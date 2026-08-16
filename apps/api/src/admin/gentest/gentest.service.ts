/**
 * @file gentest.service.ts
 * @description Оркестратор тестового перебора генераций (админка).
 *
 * Механика: админ выбирает персонажа и отмечает опции в подгруппах
 * (OUTFITS/OUTFIT_DETAILS/FACIAL_EXPRESSION/POSE/LOCATION/FRAMING/CAMERA_ANGLE).
 * Система строит КРОСС-ПРОИЗВЕДЕНИЕ выбранных (по одной опции на подгруппу в
 * комбинации), собирает промпт на бэкенде (base-идентичность персонажа +
 * фрагменты опций в порядке buildCompositePrompt) и генерирует каждую комбинацию
 * через тот же image-pipeline, что чат — на пиннутом Civitai AIR персонажа.
 *
 * Многопоточность: пул воркеров (task.concurrency) разбирает GenTestItem'ы,
 * каждый ставит image-job + поллит статус и пишет результат в свою строку.
 * Пауза/отмена — через поле status (перечитывается между элементами).
 * Устойчивость к рестарту: onModuleInit возобновляет running-задачи.
 */

import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../../prisma.service";
import { GenerationService } from "../../generation/generation.service";
import { StartGenTestDto } from "./dto/start-gentest.dto";

/** Порядок осей (подгрупп) в комбинации — зеркало buildCompositePrompt (apps/web). */
const AXIS_ORDER = [
  "FACIAL_EXPRESSION",
  "OUTFITS",
  "OUTFIT_DETAILS",
  "POSE",
  "LOCATION",
  "FRAMING",
  "CAMERA_ANGLE",
] as const;
type Axis = (typeof AXIS_ORDER)[number];

/** К какой таблице опций относится каждая подгруппа. */
const AXIS_TABLE: Record<Axis, "appearance" | "pose" | "scene" | "camera"> = {
  OUTFITS: "appearance",
  OUTFIT_DETAILS: "appearance",
  FACIAL_EXPRESSION: "pose",
  POSE: "pose",
  LOCATION: "scene",
  FRAMING: "camera",
  CAMERA_ANGLE: "camera",
};

/** Жёсткий верхний лимит числа комбинаций на задачу (защита очереди). */
const MAX_COMBOS = 300;
const POLL_INTERVAL_MS = 2500;
const POLL_MAX_ATTEMPTS = 80; // ~200с

interface OptionRow {
  id: string;
  name: string;
  prompt: string | null;
}

@Injectable()
export class GentestService implements OnModuleInit {
  private readonly logger = new Logger(GentestService.name);
  /** id задач, для которых уже крутится пул воркеров (защита от двойного запуска). */
  private readonly active = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly generation: GenerationService,
  ) {}

  async onModuleInit(): Promise<void> {
    const running = await this.prisma.genTestTask.findMany({ where: { status: "running" }, select: { id: true } });
    for (const { id } of running) {
      this.logger.log(`resuming gentest task ${id} after restart`);
      void this.runTask(id);
    }
  }

  // ─── Публичный API ──────────────────────────────────────────────────────────

  list() {
    return this.prisma.genTestTask.findMany({ orderBy: { createdAt: "desc" }, take: 20 });
  }

  async get(id: string) {
    const task = await this.prisma.genTestTask.findUnique({ where: { id } });
    if (!task) throw new NotFoundException("Task not found");
    const items = await this.prisma.genTestItem.findMany({ where: { taskId: id }, orderBy: { order: "asc" } });
    return { task, items };
  }

  async cancel(id: string) {
    const task = await this.prisma.genTestTask.findUnique({ where: { id } });
    if (task && task.status === "running") {
      return this.prisma.genTestTask.update({ where: { id }, data: { status: "cancelled", finishedAt: new Date() } });
    }
    return task;
  }

  /** Создаёт задачу: строит комбинации, сохраняет items, запускает пул воркеров. */
  async createTask(adminId: string, dto: StartGenTestDto) {
    const character = await this.prisma.character.findFirst({ where: { id: dto.characterId, deletedAt: null } });
    if (!character) throw new NotFoundException("Character not found");
    const personality = (character.personality as Record<string, unknown>) || {};

    // Санитайзим выбор: только известные оси, только непустые массивы id.
    const selections: Partial<Record<Axis, string[]>> = {};
    for (const axis of AXIS_ORDER) {
      const ids = (dto.selections?.[axis] || []).filter((x) => typeof x === "string" && x);
      if (ids.length) selections[axis] = Array.from(new Set(ids));
    }

    // Подтягиваем name+prompt выбранных опций из соответствующих таблиц.
    const optionMap = await this.loadOptions(selections);

    // Оси в фиксированном порядке (только непустые).
    const axes = AXIS_ORDER.filter((a) => selections[a]?.length);
    if (axes.length === 0) throw new BadRequestException("Не выбрано ни одной опции");

    // Кросс-произведение с ранним контролем размера.
    let combos: { axis: Axis; opt: OptionRow }[][] = [[]];
    for (const axis of axes) {
      const opts = (selections[axis] || []).map((id) => optionMap[id]).filter(Boolean) as OptionRow[];
      const next: { axis: Axis; opt: OptionRow }[][] = [];
      for (const base of combos) {
        for (const opt of opts) next.push([...base, { axis, opt }]);
      }
      combos = next;
      if (combos.length > MAX_COMBOS) {
        throw new BadRequestException(`Слишком много комбинаций (>${MAX_COMBOS}). Сократите выбор опций.`);
      }
    }

    // База-идентичность персонажа (тот же источник, что чат: personality.avatarPrompt).
    const basePrompt = this.buildBasePrompt(personality, character.name);

    // Seed фиксируем на задачу: img2img → seed аватара (совпадение образа),
    // txt2img → переданный или случайный (чтобы разница шла только от опции).
    const mode: "img2img" | "txt2img" = dto.mode === "txt2img" ? "txt2img" : "img2img";
    const avatarSeed = typeof personality.avatarSeed === "number" ? (personality.avatarSeed as number) : undefined;
    const seed = mode === "img2img"
      ? (avatarSeed ?? Math.floor(Math.random() * 2_147_483_647))
      : (typeof dto.seed === "number" ? dto.seed : Math.floor(Math.random() * 2_147_483_647));

    const concurrency = Math.min(Math.max(1, dto.concurrency || 3), 8);

    const task = await this.prisma.genTestTask.create({
      data: {
        characterId: character.id,
        status: "running",
        mode,
        total: combos.length,
        concurrency,
        seed,
        createdBy: adminId,
        params: { selections } as object,
      },
    });

    // Формируем items: prompt = base + фрагменты опций в порядке осей.
    await this.prisma.genTestItem.createMany({
      data: combos.map((combo, i) => {
        const extra = combo.map(({ opt }) => opt.prompt?.trim()).filter(Boolean).join(", ");
        const label = combo.map(({ opt }) => opt.name).join(" · ");
        const prompt = [basePrompt, extra].filter(Boolean).join(", ");
        return {
          taskId: task.id,
          order: i,
          label,
          selections: Object.fromEntries(combo.map(({ axis, opt }) => [axis, { id: opt.id, name: opt.name }])),
          prompt,
        };
      }),
    });

    void this.runTask(task.id);
    return task;
  }

  // ─── Внутреннее ─────────────────────────────────────────────────────────────

  /** Загружает name+prompt выбранных опций из appearance/pose/scene/camera. */
  private async loadOptions(selections: Partial<Record<Axis, string[]>>): Promise<Record<string, OptionRow>> {
    const byTable: Record<"appearance" | "pose" | "scene" | "camera", Set<string>> = {
      appearance: new Set(),
      pose: new Set(),
      scene: new Set(),
      camera: new Set(),
    };
    for (const axis of AXIS_ORDER) {
      for (const id of selections[axis] || []) byTable[AXIS_TABLE[axis]].add(id);
    }
    const map: Record<string, OptionRow> = {};
    const put = (rows: OptionRow[]) => rows.forEach((r) => (map[r.id] = r));
    const [ap, po, sc, ca] = await Promise.all([
      byTable.appearance.size
        ? this.prisma.appearanceOption.findMany({ where: { id: { in: [...byTable.appearance] } }, select: { id: true, name: true, prompt: true } })
        : Promise.resolve([]),
      byTable.pose.size
        ? this.prisma.poseOption.findMany({ where: { id: { in: [...byTable.pose] } }, select: { id: true, name: true, prompt: true } })
        : Promise.resolve([]),
      byTable.scene.size
        ? this.prisma.sceneOption.findMany({ where: { id: { in: [...byTable.scene] } }, select: { id: true, name: true, prompt: true } })
        : Promise.resolve([]),
      byTable.camera.size
        ? this.prisma.cameraOption.findMany({ where: { id: { in: [...byTable.camera] } }, select: { id: true, name: true, prompt: true } })
        : Promise.resolve([]),
    ]);
    put(ap); put(po); put(sc); put(ca);
    return map;
  }

  /**
   * База-идентичность персонажа для промпта. Приоритет — сохранённый avatarPrompt
   * (тот же источник, что чат/страница генерации). Фолбэк — минимальная сборка
   * из атрибутов personality. Quality/NSFW-теги добавит AI-сервис.
   */
  private buildBasePrompt(personality: Record<string, unknown>, name: string): string {
    const saved = typeof personality.avatarPrompt === "string" ? personality.avatarPrompt.trim() : "";
    if (saved) return saved;
    const parts: string[] = [];
    const push = (v: unknown) => { if (typeof v === "string" && v.trim()) parts.push(v.trim()); };
    push(personality.gender);
    if (personality.age) parts.push(`${personality.age}-year-old`);
    push(personality.ethnicity || personality.nationality);
    if (personality.eyeColor) parts.push(`${personality.eyeColor} eyes`);
    if (personality.hairColor) parts.push(`${personality.hairColor} hair`);
    push(personality.hairStyle);
    push(personality.bodyType);
    return parts.length ? parts.join(", ") : name;
  }

  /** Запускает пул воркеров, разбирающих pending-элементы задачи. */
  private async runTask(taskId: string): Promise<void> {
    if (this.active.has(taskId)) return;
    this.active.add(taskId);
    try {
      const task = await this.prisma.genTestTask.findUnique({ where: { id: taskId } });
      if (!task || task.status !== "running") return;

      const character = await this.prisma.character.findUnique({ where: { id: task.characterId } });
      if (!character) {
        await this.prisma.genTestTask.update({ where: { id: taskId }, data: { status: "failed", finishedAt: new Date() } });
        return;
      }
      const personality = (character.personality as Record<string, unknown>) || {};
      const generationStyle = (personality.generationStyle as string) || "realism";
      const avatarModel = typeof personality.avatarModel === "string" ? (personality.avatarModel as string) : undefined;
      const contentMode: "nsfw" | "sfw" = character.nsfw === false ? "sfw" : "nsfw";

      // Прерванные рестартом элементы возвращаем в очередь.
      await this.prisma.genTestItem.updateMany({ where: { taskId, status: "processing" }, data: { status: "pending" } });

      // Очередь pending-элементов (in-memory: .shift() в одном процессе безопасен).
      const pending = await this.prisma.genTestItem.findMany({
        where: { taskId, status: "pending" },
        orderBy: { order: "asc" },
        select: { id: true },
      });
      const queue = pending.map((p) => p.id);

      const worker = async (): Promise<void> => {
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const fresh = await this.prisma.genTestTask.findUnique({ where: { id: taskId }, select: { status: true } });
          if (!fresh || fresh.status !== "running") return; // отмена/готово
          const itemId = queue.shift();
          if (!itemId) return;
          await this.processItem(taskId, itemId, {
            mode: task.mode as "img2img" | "txt2img",
            seed: task.seed ?? undefined,
            adminId: task.createdBy,
            generationStyle,
            avatarModel,
            avatarUrl: character.avatarUrl,
            contentMode,
          });
        }
      };

      await Promise.all(Array.from({ length: Math.max(1, task.concurrency) }, () => worker()));

      // Завершение (если не отменена в процессе).
      const finalTask = await this.prisma.genTestTask.findUnique({ where: { id: taskId } });
      if (finalTask && finalTask.status === "running") {
        await this.prisma.genTestTask.update({ where: { id: taskId }, data: { status: "completed", finishedAt: new Date() } });
      }
    } catch (err) {
      this.logger.error(`gentest task ${taskId} crashed: ${err instanceof Error ? err.message : String(err)}`);
      await this.prisma.genTestTask.update({ where: { id: taskId }, data: { status: "failed", finishedAt: new Date() } }).catch(() => {});
    } finally {
      this.active.delete(taskId);
    }
  }

  /** Генерирует одну комбинацию: ставит image-job, поллит статус, пишет результат. */
  private async processItem(
    taskId: string,
    itemId: string,
    ctx: {
      mode: "img2img" | "txt2img";
      seed?: number;
      adminId: string;
      generationStyle: string;
      avatarModel?: string;
      avatarUrl: string | null;
      contentMode: "nsfw" | "sfw";
    },
  ): Promise<void> {
    const item = await this.prisma.genTestItem.findUnique({ where: { id: itemId } });
    if (!item) return;
    await this.prisma.genTestItem.update({ where: { id: itemId }, data: { status: "processing" } });

    try {
      const payload: Parameters<GenerationService["createImageJob"]>[1] = {
        prompt: item.prompt,
        provider: "civitai",
        generationStyle: ctx.generationStyle,
        contentMode: ctx.contentMode,
        seed: ctx.seed,
      };
      if (ctx.avatarModel) payload.model = ctx.avatarModel;
      if (ctx.mode === "img2img" && ctx.avatarUrl) payload.initImageUrl = ctx.avatarUrl;

      const { jobId } = await this.generation.createImageJob(ctx.adminId, payload);
      await this.prisma.genTestItem.update({ where: { id: itemId }, data: { jobId } });

      for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
        const status = await this.generation.getJobStatus(jobId, ctx.adminId);
        if (status?.status === "completed") {
          const output = status.output as { url?: string } | null;
          await this.prisma.genTestItem.update({ where: { id: itemId }, data: { status: "completed", imageUrl: output?.url || null } });
          await this.prisma.genTestTask.update({ where: { id: taskId }, data: { done: { increment: 1 } } });
          return;
        }
        if (status?.status === "failed") {
          await this.prisma.genTestItem.update({ where: { id: itemId }, data: { status: "failed", error: status.error || "generation failed" } });
          await this.prisma.genTestTask.update({ where: { id: taskId }, data: { failed: { increment: 1 } } });
          return;
        }
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      }
      // Таймаут.
      await this.prisma.genTestItem.update({ where: { id: itemId }, data: { status: "failed", error: "timeout" } });
      await this.prisma.genTestTask.update({ where: { id: taskId }, data: { failed: { increment: 1 } } });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.prisma.genTestItem.update({ where: { id: itemId }, data: { status: "failed", error: msg } }).catch(() => {});
      await this.prisma.genTestTask.update({ where: { id: taskId }, data: { failed: { increment: 1 } } }).catch(() => {});
    }
  }
}
