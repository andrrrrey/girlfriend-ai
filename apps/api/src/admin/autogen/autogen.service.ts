/**
 * @file autogen.service.ts
 * @description Оркестратор фоновой автогенерации персонажей (админка).
 *
 * Для каждой задачи (AutoGenTask) последовательно создаёт N персонажей со
 * случайными атрибутами:
 *   1. случайный DTO (random-pools)
 *   2. аватар — image-job через очередь + поллинг AiJob
 *   3. бэкстори (childhood/lifeStory/phobias) через AI-текст
 *   4. создание персонажа (createdBy=null → платформенный, сразу виден на сайте)
 *
 * Обработка ошибок:
 *   - нехватка баланса (image/text) → останавливаем ВСЮ задачу (stopped_no_balance)
 *   - прочие ошибки → ретрай персонажа до MAX_RETRIES, затем пропуск (failed++)
 *
 * Управление: пауза/возобновление/отмена через поле status (перечитывается между
 * персонажами). Прогресс — счётчики succeeded/failed в БД (поллит фронт).
 *
 * Устойчивость к рестарту: onModuleInit возобновляет задачи со статусом running.
 */

import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../../prisma.service";
import { CharactersService } from "../../chats/characters.service";
import { GenerationService } from "../../generation/generation.service";
import { generateBackstory } from "../../chats/generate-backstory";
import { buildRandomCharacterDto, buildAvatarPrompt } from "./random-pools";

/** Максимум повторов на одного персонажа при не-балансовой ошибке. */
const MAX_RETRIES = 3;
/** Интервал поллинга статуса image-job. */
const POLL_INTERVAL_MS = 2500;
/** Максимум попыток поллинга (~200с при 2.5с). */
const POLL_MAX_ATTEMPTS = 80;

/** Ошибка «нет баланса» — останавливает всю задачу. */
class BalanceError extends Error {}

/** Классифицирует сообщение ошибки провайдера как нехватку баланса/кредитов. */
function isBalanceError(message: string): boolean {
  return /INSUFFICIENT_BALANCE|insufficient|balance|not enough|no credit|out of credit|credits?\b|payment required|\b402\b/i.test(
    message,
  );
}

@Injectable()
export class AutogenService implements OnModuleInit {
  private readonly logger = new Logger(AutogenService.name);
  /** id задач, для которых уже крутится цикл (защита от двойного запуска). */
  private readonly active = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly characters: CharactersService,
    private readonly generation: GenerationService,
  ) {}

  /** При старте API — возобновить задачи, оставшиеся в статусе running (после рестарта). */
  async onModuleInit(): Promise<void> {
    const running = await this.prisma.autoGenTask.findMany({
      where: { status: "running" },
      select: { id: true },
    });
    for (const { id } of running) {
      this.logger.log(`resuming autogen task ${id} after restart`);
      void this.runTask(id);
    }
  }

  // ─── Публичный API (используется контроллером) ──────────────────────────────

  async createTask(adminId: string, count: number) {
    const task = await this.prisma.autoGenTask.create({
      data: { total: count, status: "running", createdBy: adminId },
    });
    void this.runTask(task.id);
    return task;
  }

  list() {
    return this.prisma.autoGenTask.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
    });
  }

  get(id: string) {
    return this.prisma.autoGenTask.findUnique({ where: { id } });
  }

  /** Пауза: задача останавливается после текущего персонажа, остаётся возобновляемой. */
  async pause(id: string) {
    const task = await this.prisma.autoGenTask.findUnique({ where: { id } });
    if (task && task.status === "running") {
      return this.prisma.autoGenTask.update({ where: { id }, data: { status: "paused" } });
    }
    return task;
  }

  /** Возобновление приостановленной задачи. */
  async resume(id: string) {
    const task = await this.prisma.autoGenTask.findUnique({ where: { id } });
    if (task && (task.status === "paused" || task.status === "stopped_no_balance")) {
      const updated = await this.prisma.autoGenTask.update({
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
    const task = await this.prisma.autoGenTask.findUnique({ where: { id } });
    if (task && (task.status === "running" || task.status === "paused")) {
      return this.prisma.autoGenTask.update({
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
      // Активная модель изображений (первая включённая в админке) + её провайдер.
      const models = await this.generation.getImageStyles();
      const activeModel = models[0];

      // Разрешённые админом гендеры (для авто-генерации).
      const allowedGenders = await this.generation.getEnabledGenders();

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const task = await this.prisma.autoGenTask.findUnique({ where: { id: taskId } });
        if (!task) return;
        if (task.status !== "running") return; // пауза / отмена / стоп по балансу
        if (task.succeeded + task.failed >= task.total) {
          await this.prisma.autoGenTask.update({
            where: { id: taskId },
            data: { status: "completed", finishedAt: new Date() },
          });
          return;
        }

        try {
          const characterId = await this.generateOneCharacter(task.createdBy, activeModel, allowedGenders);
          await this.prisma.autoGenTask.update({
            where: { id: taskId },
            data: { succeeded: { increment: 1 }, characterIds: { push: characterId } },
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (err instanceof BalanceError) {
            this.logger.warn(`autogen task ${taskId} stopped: no balance — ${message}`);
            await this.prisma.autoGenTask.update({
              where: { id: taskId },
              data: { status: "stopped_no_balance", lastError: message, finishedAt: new Date() },
            });
            return;
          }
          // Не-балансовая ошибка после всех ретраев — пропускаем персонажа.
          this.logger.error(`autogen task ${taskId}: character failed after retries — ${message}`);
          await this.prisma.autoGenTask.update({
            where: { id: taskId },
            data: { failed: { increment: 1 }, lastError: message },
          });
        }
      }
    } finally {
      this.active.delete(taskId);
    }
  }

  /**
   * Генерирует одного персонажа с ретраями. Возвращает id созданного персонажа.
   * Балансовую ошибку пробрасывает сразу (BalanceError) — её нельзя «переретраить».
   */
  private async generateOneCharacter(
    adminId: string,
    activeModel: { id: string; provider?: string } | undefined,
    allowedGenders?: string[],
  ): Promise<string> {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const dto = buildRandomCharacterDto(allowedGenders);

        // 1. Аватар — ставим image-job и ждём результат. Сохраняем точный промпт
        // и seed показанного аватара, чтобы генерация картинок этого персонажа
        // (чат/страница генерации) совпадала с его аватаром.
        const avatar = await this.generateAvatar(adminId, dto, activeModel);
        dto.avatarUrl = avatar.url;
        dto.avatarPrompt = avatar.prompt;
        dto.avatarSeed = avatar.seed;
        dto.avatarModel = avatar.model;

        // 2. Бэкстори (childhood/lifeStory/phobias).
        try {
          const bs = await generateBackstory(dto.name, dto as unknown as Record<string, unknown>);
          dto.childhoodMemory = bs.childhoodMemory || undefined;
          dto.lifeStory = bs.lifeStory || undefined;
          dto.phobias = bs.phobias || undefined;
        } catch (bsErr) {
          const m = bsErr instanceof Error ? bsErr.message : String(bsErr);
          if (isBalanceError(m)) throw new BalanceError(m);
          throw bsErr; // прочую ошибку — в ретрай
        }

        // 3. Создание персонажа (платформенный, сразу виден на сайте).
        const character = await this.characters.createFromDto(dto, { createdBy: null });
        return character.id;
      } catch (err) {
        if (err instanceof BalanceError) throw err;
        lastErr = err;
        this.logger.warn(
          `autogen character attempt ${attempt}/${MAX_RETRIES} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }

  /**
   * Ставит image-job на аватар и поллит AiJob до готовности.
   * @returns URL готового изображения
   * @throws BalanceError если провайдер сообщил о нехватке баланса
   * @throws Error при прочих сбоях/таймауте (уйдёт в ретрай персонажа)
   */
  private async generateAvatar(
    adminId: string,
    dto: ReturnType<typeof buildRandomCharacterDto>,
    activeModel: { id: string; provider?: string } | undefined,
  ): Promise<{ url: string; prompt: string; seed: number; model?: string }> {
    const prompt = buildAvatarPrompt(dto);
    // Фиксируем seed, чтобы аватар был воспроизводим и совпадал с картинками в чате.
    const seed = Math.floor(Math.random() * 2_147_483_647);
    const payload: Parameters<GenerationService["createImageJob"]>[1] = { prompt, seed };
    if (activeModel) {
      payload.model = activeModel.id;
      payload.provider = activeModel.provider;
      if (activeModel.provider === "civitai") payload.generationStyle = "realism";
    }

    const { jobId } = await this.generation.createImageJob(adminId, payload);

    for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
      const status = await this.generation.getJobStatus(jobId, adminId);
      if (status) {
        if (status.status === "completed") {
          const output = status.output as { url?: string; meta?: { model?: string } } | null;
          const url = output?.url;
          // Чекпоинт (для Civitai — AIR) фактической генерации — чтобы картинки
          // персонажа шли на той же модели.
          if (url) return { url, prompt, seed, model: output?.meta?.model };
          throw new Error("image job completed without url");
        }
        if (status.status === "failed") {
          const msg = status.error || "image generation failed";
          if (isBalanceError(msg)) throw new BalanceError(msg);
          throw new Error(msg);
        }
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
    throw new Error("image generation timed out");
  }
}
