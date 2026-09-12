/**
 * @file engagement-gen.service.ts
 * @description Оркестратор фоновой автогенерации контента для персонажей (админка,
 * раздел «Вовлечённость»).
 *
 * Для каждой задачи (EngagementGenTask) генерирует N изображений и M видео НА
 * КАЖДОГО выбранного персонажа со случайными опциями/промптом:
 *   1. случайный промпт (база персонажа + случайные фрагменты опций)
 *   2. image/video-job через очередь (GenerationService) + поллинг AiJob
 *   3. готовые джобы привязаны к персонажу (characterId) и сразу попадают в
 *      галерею/шортсы (это просто фильтры по завершённым AiJob).
 *
 * План работы детерминирован (персонажи × [изображения, затем видео]); прогресс —
 * счётчики succeeded/failed. На возобновлении пропускаем уже обработанные единицы
 * (первые succeeded+failed), поэтому item-таблица не нужна.
 *
 * Обработка ошибок:
 *   - нехватка баланса → останавливаем ВСЮ задачу (stopped_no_balance)
 *   - прочие ошибки → единица помечается failed++, продолжаем
 *
 * Управление: пауза/возобновление/отмена через поле status (перечитывается между
 * единицами). Устойчивость к рестарту: onModuleInit возобновляет running-задачи.
 */

import { BadRequestException, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../../prisma.service";
import { GenerationService } from "../../generation/generation.service";
import { StartEngagementGenDto } from "./dto/start-engagement-gen.dto";
import { buildBasePrompt, buildRandomEngagementPrompt } from "./random-engagement";

/** Интервал поллинга статуса media-job. */
const POLL_INTERVAL_MS = 3000;
/** Максимум попыток поллинга (~25 мин при 3с) — покрывает ожидание в очереди. */
const POLL_MAX_ATTEMPTS = 500;

/** Ошибка «нет баланса» — останавливает всю задачу. */
class BalanceError extends Error {}

/** Классифицирует сообщение ошибки провайдера как нехватку баланса/кредитов. */
function isBalanceError(message: string): boolean {
  return /INSUFFICIENT_BALANCE|insufficient|balance|not enough|no credit|out of credit|credits?\b|payment required|\b402\b/i.test(
    message,
  );
}

type Unit = { characterId: string; kind: "image" | "video" };

@Injectable()
export class EngagementGenService implements OnModuleInit {
  private readonly logger = new Logger(EngagementGenService.name);
  /** id задач, для которых уже крутится цикл (защита от двойного запуска). */
  private readonly active = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly generation: GenerationService,
  ) {}

  /** При старте API — возобновить задачи, оставшиеся в статусе running. */
  async onModuleInit(): Promise<void> {
    const running = await this.prisma.engagementGenTask.findMany({
      where: { status: "running" },
      select: { id: true },
    });
    for (const { id } of running) {
      this.logger.log(`resuming engagement-gen task ${id} after restart`);
      void this.runTask(id);
    }
  }

  // ─── Публичный API (используется контроллером) ──────────────────────────────

  async createTask(adminId: string, dto: StartEngagementGenDto) {
    const characterIds = Array.from(new Set(dto.characterIds.filter(Boolean)));
    if (characterIds.length === 0) throw new BadRequestException("No characters selected");
    const imagesPerChar = Math.max(0, Math.floor(dto.imagesPerChar || 0));
    const videosPerChar = Math.max(0, Math.floor(dto.videosPerChar || 0));
    const total = characterIds.length * (imagesPerChar + videosPerChar);
    if (total === 0) throw new BadRequestException("Nothing to generate (both counts are 0)");

    const task = await this.prisma.engagementGenTask.create({
      data: {
        status: "running",
        total,
        imagesPerChar,
        videosPerChar,
        characterIds,
        createdBy: adminId,
        params: dto.contentMode ? { contentMode: dto.contentMode } : {},
      },
    });
    void this.runTask(task.id);
    return task;
  }

  list() {
    return this.prisma.engagementGenTask.findMany({ orderBy: { createdAt: "desc" }, take: 20 });
  }

  get(id: string) {
    return this.prisma.engagementGenTask.findUnique({ where: { id } });
  }

  /** Пауза: задача останавливается после текущей единицы, остаётся возобновляемой. */
  async pause(id: string) {
    const task = await this.prisma.engagementGenTask.findUnique({ where: { id } });
    if (task && task.status === "running") {
      return this.prisma.engagementGenTask.update({ where: { id }, data: { status: "paused" } });
    }
    return task;
  }

  /** Возобновление приостановленной/остановленной по балансу задачи. */
  async resume(id: string) {
    const task = await this.prisma.engagementGenTask.findUnique({ where: { id } });
    if (task && (task.status === "paused" || task.status === "stopped_no_balance")) {
      const updated = await this.prisma.engagementGenTask.update({
        where: { id },
        data: { status: "running", lastError: null },
      });
      void this.runTask(id);
      return updated;
    }
    return task;
  }

  /** Отмена: задача останавливается окончательно. */
  async cancel(id: string) {
    const task = await this.prisma.engagementGenTask.findUnique({ where: { id } });
    if (task && (task.status === "running" || task.status === "paused")) {
      return this.prisma.engagementGenTask.update({
        where: { id },
        data: { status: "cancelled", finishedAt: new Date() },
      });
    }
    return task;
  }

  // ─── Цикл генерации ─────────────────────────────────────────────────────────

  private async runTask(taskId: string): Promise<void> {
    if (this.active.has(taskId)) return;
    this.active.add(taskId);
    try {
      const task = await this.prisma.engagementGenTask.findUnique({ where: { id: taskId } });
      if (!task || task.status !== "running") return;

      // Детерминированный план: персонажи × [изображения, затем видео].
      const plan: Unit[] = [];
      for (const characterId of task.characterIds) {
        for (let i = 0; i < task.imagesPerChar; i++) plan.push({ characterId, kind: "image" });
        for (let i = 0; i < task.videosPerChar; i++) plan.push({ characterId, kind: "video" });
      }

      const dtoMode = (task.params as { contentMode?: "nsfw" | "sfw" } | null)?.contentMode;

      // Модель для text-to-video (scratch) резолвим один раз на задачу — без явной
      // модели бэкенд ушёл бы в дефолтного modelslab-провайдера.
      const videoModel = task.videosPerChar > 0 ? await this.resolveVideoModel() : undefined;

      // Пропускаем уже обработанные единицы (succeeded+failed) — резюм после рестарта/паузы.
      for (let i = task.succeeded + task.failed; i < plan.length; i++) {
        const fresh = await this.prisma.engagementGenTask.findUnique({
          where: { id: taskId },
          select: { status: true },
        });
        if (!fresh || fresh.status !== "running") return; // пауза / отмена / стоп по балансу

        const unit = plan[i];
        try {
          const jobId = await this.generateOne(unit, task.createdBy, dtoMode, videoModel);
          await this.prisma.engagementGenTask.update({
            where: { id: taskId },
            data: { succeeded: { increment: 1 }, mediaJobIds: { push: jobId } },
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (err instanceof BalanceError) {
            this.logger.warn(`engagement-gen task ${taskId} stopped: no balance — ${message}`);
            await this.prisma.engagementGenTask.update({
              where: { id: taskId },
              data: { status: "stopped_no_balance", lastError: message, finishedAt: new Date() },
            });
            return;
          }
          this.logger.error(`engagement-gen task ${taskId}: unit failed — ${message}`);
          await this.prisma.engagementGenTask.update({
            where: { id: taskId },
            data: { failed: { increment: 1 }, lastError: message },
          });
        }
      }

      // Все единицы обработаны — завершаем (если задачу не отменили).
      const finalTask = await this.prisma.engagementGenTask.findUnique({ where: { id: taskId } });
      if (finalTask && finalTask.status === "running") {
        await this.prisma.engagementGenTask.update({
          where: { id: taskId },
          data: { status: "completed", finishedAt: new Date() },
        });
      }
    } catch (err) {
      this.logger.error(
        `engagement-gen task ${taskId} crashed: ${err instanceof Error ? err.message : String(err)}`,
      );
      await this.prisma.engagementGenTask
        .update({ where: { id: taskId }, data: { status: "failed", finishedAt: new Date() } })
        .catch(() => {});
    } finally {
      this.active.delete(taskId);
    }
  }

  /**
   * Генерирует одну единицу (изображение или видео) для персонажа: собирает
   * случайный промпт, ставит job, поллит статус. Возвращает id завершённой джобы.
   * @throws BalanceError при нехватке баланса (останавливает всю задачу)
   */
  private async generateOne(
    unit: Unit,
    adminId: string,
    dtoMode?: "nsfw" | "sfw",
    videoModel?: string,
  ): Promise<string> {
    const character = await this.prisma.character.findFirst({
      where: { id: unit.characterId, deletedAt: null },
    });
    if (!character) throw new Error(`Character ${unit.characterId} not found`);

    const personality = (character.personality as Record<string, unknown>) || {};
    const contentMode: "nsfw" | "sfw" = dtoMode ?? (character.nsfw === false ? "sfw" : "nsfw");
    const basePrompt = buildBasePrompt(personality, character.name);
    const prompt = await buildRandomEngagementPrompt(this.prisma, basePrompt, contentMode);
    const seed = Math.floor(Math.random() * 2_147_483_647);

    let jobId: string;
    if (unit.kind === "image") {
      const generationStyle = (personality.generationStyle as string) || "realism";
      const avatarModel =
        typeof personality.avatarModel === "string" ? (personality.avatarModel as string) : undefined;
      const payload: Parameters<GenerationService["createImageJob"]>[1] = {
        prompt,
        provider: "civitai",
        generationStyle,
        characterId: character.id,
        seed,
        contentMode,
      };
      if (avatarModel) payload.model = avatarModel;
      ({ jobId } = await this.generation.createImageJob(adminId, payload));
    } else {
      ({ jobId } = await this.generation.createVideoJob(adminId, {
        prompt,
        mode: "scratch",
        model: videoModel,
        characterId: character.id,
        seed,
        contentMode,
      }));
    }

    return this.pollJob(jobId, adminId);
  }

  /**
   * Активная модель для text-to-video (scratch): первая включённая с id вида
   * "*text-to-video". Фолбэк — первая включённая видео-модель.
   */
  private async resolveVideoModel(): Promise<string | undefined> {
    const styles = await this.generation.getVideoStyles();
    const t2v = styles.find((m) => m.id.includes("text-to-video"));
    return (t2v ?? styles[0])?.id;
  }

  /** Поллит AiJob до завершения. Возвращает jobId при успехе. */
  private async pollJob(jobId: string, adminId: string): Promise<string> {
    for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
      const status = await this.generation.getJobStatus(jobId, adminId);
      if (status) {
        if (status.status === "completed") {
          const output = status.output as { url?: string } | null;
          if (output?.url) return jobId;
          throw new Error("job completed without url");
        }
        if (status.status === "failed") {
          const msg = status.error || "generation failed";
          if (isBalanceError(msg)) throw new BalanceError(msg);
          throw new Error(msg);
        }
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
    throw new Error("generation timed out");
  }
}
