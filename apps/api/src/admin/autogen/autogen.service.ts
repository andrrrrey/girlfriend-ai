/**
 * @file autogen.service.ts
 * @description Оркестратор фоновой автогенерации персонажей (админка).
 *
 * Для каждой задачи (AutoGenTask) последовательно создаёт N персонажей со
 * случайными атрибутами — так же, как «Create Your Character» (/create):
 *   1. случайный DTO из опций админки (random-pools + loadContext); стиль — по
 *      плану задачи: выбранные стили чередуются равномерно (round-robin по номеру)
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
import { isUnsafeForSoloAvatar } from "@repo/types";
import {
  buildRandomCharacter,
  buildAvatarPrompt,
  pickRandomScenePrompts,
  type AutogenContext,
  type PoolOption,
  type RandomCharacter,
} from "./random-pools";

/** Максимум повторов на одного персонажа при не-балансовой ошибке. */
const MAX_RETRIES = 3;
/** Интервал поллинга статуса image-job. */
const POLL_INTERVAL_MS = 2500;
/** Максимум попыток поллинга (~350с при 2.5с): AI-сервис при сбоях Civitai
 *  повторяет и откатывается на другую модель пула (до ~220с + постобработка). */
const POLL_MAX_ATTEMPTS = 140;

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

  /**
   * @param styleIds — id опций STYLE, в которых создавать персонажей. Пусто —
   *   все стили. Несколько стилей делятся поровну от общего числа.
   */
  async createTask(adminId: string, count: number, contentMode?: "nsfw" | "sfw", styleIds?: string[]) {
    const mode: "nsfw" | "sfw" = contentMode === "sfw" ? "sfw" : "nsfw";
    const task = await this.prisma.autoGenTask.create({
      data: {
        total: count,
        status: "running",
        createdBy: adminId,
        params: { contentMode: mode, styleIds: styleIds ?? [] },
      },
    });
    void this.runTask(task.id);
    return task;
  }

  async list() {
    const tasks = await this.prisma.autoGenTask.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return this.attachCharacters(tasks);
  }

  async get(id: string) {
    const task = await this.prisma.autoGenTask.findUnique({ where: { id } });
    if (!task) return task;
    const [enriched] = await this.attachCharacters([task]);
    return enriched;
  }

  /**
   * Дополняет задачи данными созданных персонажей (id/name/avatarUrl) для показа
   * миниатюр в админке. characterIds — только UUID; тянем детали одним запросом
   * и раскладываем в исходном порядке (несуществующих отбрасываем).
   */
  private async attachCharacters<T extends { characterIds: string[] }>(tasks: T[]) {
    const allIds = Array.from(new Set(tasks.flatMap((t) => t.characterIds)));
    if (allIds.length === 0) return tasks.map((t) => ({ ...t, characters: [] }));
    const chars = await this.prisma.character.findMany({
      where: { id: { in: allIds } },
      select: { id: true, name: true, avatarUrl: true },
    });
    const byId = new Map(chars.map((c) => [c.id, c]));
    return tasks.map((t) => ({
      ...t,
      characters: t.characterIds
        .map((id) => byId.get(id))
        .filter((c): c is (typeof chars)[number] => c != null),
    }));
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

  /**
   * Всё, что /create берёт из админки: опции персонажа (стили с generationStyle,
   * расы, причёски, типы тела, размеры), голоса каталога и опции генерации для
   * случайной одежды/позы/сцены/кадра. В SFW-режиме — только nsfw=false опции.
   */
  private async loadContext(mode: "nsfw" | "sfw"): Promise<AutogenContext> {
    const [options, voices, appearance, pose, scene, camera, allowedGenders, existing] = await Promise.all([
      this.generation.getCharacterOptions(undefined, mode),
      this.prisma.voice.findMany({ where: { isActive: true }, orderBy: [{ order: "asc" }, { createdAt: "asc" }] }),
      this.generation.getAppearanceOptions(mode),
      this.generation.getPoseOptions(mode),
      this.generation.getSceneOptions(mode),
      this.generation.getCameraOptions(mode),
      this.generation.getEnabledGenders(),
      // Имена существующих персонажей — чтобы новые не повторяли их.
      this.prisma.character.findMany({ select: { name: true } }),
    ]);
    const byCategory = (category: string): PoolOption[] =>
      options
        .filter((o) => o.category === category)
        .map((o) => ({ id: o.id, name: o.name, prompt: o.prompt, generationStyle: o.generationStyle }));
    // Аватар — один человек: во всех категориях отбрасываем опции на двоих+ и с
    // чужими руками/ногами/людьми в кадре (POV-руки, толпа, хватают сзади…) —
    // иначе модель дорисовывает лишние конечности и клонов персонажа.
    const promptsOf = (cats: { options: { prompt?: string | null }[] }[]) =>
      cats.flatMap((c) => c.options).map((o) => o.prompt).filter((p): p is string => !!p && !isUnsafeForSoloAvatar(p));
    return {
      styles: byCategory("STYLE"),
      humanRaces: byCategory("HUMAN_RACE"),
      fantasyRaces: byCategory("FANTASY_RACE"),
      hairStyles: byCategory("HAIR_STYLE"),
      bodyTypes: byCategory("BODY_TYPE"),
      breastSizes: byCategory("BREAST_SIZE"),
      buttSizes: byCategory("BUTT_SIZE"),
      voices: voices.map((v) => ({ name: v.name, voiceId: v.voiceId })),
      outfits: promptsOf(appearance.OUTFITS),
      expressions: promptsOf(pose.FACIAL_EXPRESSION),
      poses: promptsOf(pose.POSE),
      locations: promptsOf(scene.LOCATION),
      framings: camera.FRAMING.map((o) => o.prompt).filter((p): p is string => !!p && !isUnsafeForSoloAvatar(p)),
      allowedGenders,
      usedNames: new Set(existing.map((c) => c.name.trim().toLowerCase())),
    };
  }

  // ─── Цикл генерации ─────────────────────────────────────────────────────────

  private async runTask(taskId: string): Promise<void> {
    if (this.active.has(taskId)) return;
    this.active.add(taskId);
    try {
      // Активная модель изображений (первая включённая в админке) + её провайдер.
      const models = await this.generation.getImageStyles();
      const activeModel = models[0];

      const initial = await this.prisma.autoGenTask.findUnique({ where: { id: taskId } });
      if (!initial) return;
      const params = (initial.params ?? {}) as { contentMode?: string; styleIds?: string[] };
      // Режим контента задачи: SFW-персонажи генерируются без NSFW-опций/промптов.
      const contentMode: "nsfw" | "sfw" = params.contentMode === "sfw" ? "sfw" : "nsfw";
      const ctx = await this.loadContext(contentMode);
      // План стилей: выбранные (или все) опции STYLE по кругу — равные доли от total.
      const selected = params.styleIds?.length
        ? ctx.styles.filter((st) => params.styleIds!.includes(st.id))
        : ctx.styles;
      const stylePlan: PoolOption[] = selected.length > 0 ? selected : ctx.styles;

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

        // Стиль этого слота: номер персонажа в задаче по кругу по плану стилей.
        // Слот сгорает и при пропуске (failed), поэтому доли равны по попыткам.
        const slot = task.succeeded + task.failed;
        const style = stylePlan.length > 0 ? stylePlan[slot % stylePlan.length] : undefined;

        try {
          const characterId = await this.generateOneCharacter(task.createdBy, activeModel, ctx, contentMode, style);
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
    ctx: AutogenContext,
    contentMode: "nsfw" | "sfw" = "nsfw",
    style?: PoolOption,
  ): Promise<string> {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const char = buildRandomCharacter(ctx, style);
        const dto = char.dto;

        // 1. Аватар — ставим image-job и ждём результат. Сохраняем точный промпт
        // и seed показанного аватара, чтобы генерация картинок этого персонажа
        // (чат/страница генерации) совпадала с его аватаром.
        const avatar = await this.generateAvatar(adminId, char, ctx, activeModel, contentMode);
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
        const character = await this.characters.createFromDto(dto, { createdBy: null, contentMode });
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
    char: RandomCharacter,
    ctx: AutogenContext,
    activeModel: { id: string; provider?: string } | undefined,
    contentMode: "nsfw" | "sfw" = "nsfw",
  ): Promise<{ url: string; prompt: string; seed: number; model?: string }> {
    // Как на /create: в генерацию идёт identity + случайные одежда/поза/сцена/кадр,
    // а сохраняется только identity (её переиспользуют чат и generation).
    const identityPrompt = buildAvatarPrompt(char);
    const prompt = buildAvatarPrompt(char, pickRandomScenePrompts(ctx));
    // Фиксируем seed, чтобы аватар был воспроизводим и совпадал с картинками в чате.
    const seed = Math.floor(Math.random() * 2_147_483_647);
    // 9:16 + hires-fix — те же параметры аватара, что на /create.
    const payload: Parameters<GenerationService["createImageJob"]>[1] = {
      prompt,
      seed,
      contentMode,
      aspectRatio: "9:16",
      hiresFix: true,
    };
    // generationStyle из стиля персонажа (Anime → аниме-чекпоинты и т.п.);
    // без маппинга — realism, как на /create.
    const generationStyle = char.dto.generationStyle || "realism";
    if (activeModel) {
      payload.model = activeModel.id;
      payload.provider = activeModel.provider;
      if (activeModel.provider === "civitai") payload.generationStyle = generationStyle;
    } else {
      payload.provider = "civitai";
      payload.generationStyle = generationStyle;
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
          if (url) return { url, prompt: identityPrompt, seed, model: output?.meta?.model };
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
