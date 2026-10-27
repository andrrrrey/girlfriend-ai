jest.mock("@repo/config", () => ({ loadEnv: () => ({ AI_HOST: "ai", AI_PORT: 8081 }) }));

import { MediaCacheService, mediaCacheKey } from "./media-cache.service";

/** In-memory хранилище с нужным сервису подмножеством Prisma. */
function fakeDb() {
  let seq = 0;
  const id = (p: string) => `${p}-${++seq}`;
  const characters: Record<string, { isPublic: boolean }> = { pub: { isPublic: true }, priv: { isPublic: false } };
  const assets: any[] = [];
  const deliveries: any[] = [];
  const requests: any[] = [];
  const jobs: any[] = [];
  const leaderOf = (j: any) => j.input?.cache?.leaderJobId;

  const prisma = {
    character: { findUnique: async ({ where }: any) => characters[where.id] ?? null },
    mediaAsset: {
      findFirst: async ({ where }: any) =>
        assets
          .filter((a) => a.cacheKey === where.cacheKey && a.moderation === where.moderation)
          .filter((a) => !deliveries.some((d) => d.assetId === a.id && d.userId === where.deliveries.none.userId))
          .sort((a, b) => a.createdAt - b.createdAt)[0] ?? null,
      upsert: async ({ where, create }: any) => {
        const found = assets.find((a) => a.sourceJobId === where.sourceJobId);
        if (found) return found;
        const asset = { id: id("asset"), moderation: "ok", createdAt: ++seq, ...create };
        assets.push(asset);
        return asset;
      },
    },
    mediaDelivery: {
      createMany: async ({ data }: any) => {
        for (const d of data) {
          if (!deliveries.some((x) => x.assetId === d.assetId && x.userId === d.userId)) deliveries.push(d);
        }
      },
    },
    generationRequest: {
      findFirst: async ({ where }: any) =>
        requests.filter((r) => r.cacheKey === where.cacheKey && r.status === where.status && r.leaseUntil > where.leaseUntil.gt).pop() ?? null,
      create: async ({ data }: any) => requests.push({ status: "pending", ...data }),
      updateMany: async ({ where, data }: any) => {
        for (const r of requests) if (r.leaderJobId === where.leaderJobId && (!where.status || r.status === where.status)) Object.assign(r, data);
      },
    },
    aiJob: {
      findUnique: async ({ where }: any) => jobs.find((j) => j.id === where.id) ?? null,
      findFirst: async ({ where }: any) =>
        jobs.find(
          (j) => j.userId === where.userId && where.OR.some((c: any) => (c.id ? j.id === c.id : leaderOf(j) === c.input.equals)),
        ) ?? null,
      findMany: async ({ where }: any) => jobs.filter((j) => j.status === where.status && leaderOf(j) === where.input.equals),
      updateMany: async ({ where, data }: any) => {
        const j = jobs.find((x) => x.id === where.id && x.status === where.status);
        if (j) Object.assign(j, data);
        return { count: j ? 1 : 0 };
      },
    },
  };

  /** Провайдер вызывается только из createImageJob/createVideoJob. */
  const providerCalls: string[] = [];
  const generation = {
    createImageJob: jest.fn(async (userId: string, job: any, opts: any) => {
      await new Promise((r) => setTimeout(r, 5)); // постановка в очередь не мгновенна
      const j = { id: id("job"), userId, type: "image", status: "pending", input: { ...job, chat: opts.chat, cache: opts.cache } };
      jobs.push(j);
      providerCalls.push(j.id);
      return { jobId: j.id };
    }),
    createVideoJob: jest.fn(),
    createDerivedJob: jest.fn(async (userId: string, params: any, opts: any) => {
      const j = {
        id: id("job"),
        userId,
        type: params.kind,
        status: params.output ? "completed" : "pending",
        input: { ...params.input, chat: opts.chat, cache: opts.cache },
        output: params.output,
      };
      jobs.push(j);
      return j.id;
    }),
    toClientMediaUrl: async (u: string) => u,
  };

  /** Лок как в Redis: занят — acquired=false. */
  const held = new Set<string>();
  const locks = {
    withLock: async (key: string, _ttl: number, fn: () => Promise<unknown>) => {
      if (held.has(key)) return { acquired: false };
      held.add(key);
      try {
        return { acquired: true, result: await fn() };
      } finally {
        held.delete(key);
      }
    },
  };

  const wallet = { capture: jest.fn(async () => true), release: jest.fn(async () => true) };
  return { prisma, generation, locks, wallet, assets, deliveries, jobs, providerCalls };
}

describe("MediaCacheService", () => {
  const job = { prompt: "1girl, beach, bikini", model: "urn:air:x", provider: "civitai", generationStyle: "realism", contentMode: "nsfw" as const };
  const chat = { sessionId: "chat", caption: "photo", source: "web" };
  let db: ReturnType<typeof fakeDb>;
  let service: MediaCacheService;

  const request = (userId: string, characterId = "pub") =>
    service.request({ kind: "image", userId, characterId, job, chat: { ...chat, sessionId: `chat-${userId}` } });

  /** Воркер сообщает об успехе генерации. */
  const complete = (jobId: string, url = `s3://media/${jobId}.png`) => service.onJobCompleted(jobId, { url });

  beforeEach(() => {
    db = fakeDb();
    service = new MediaCacheService(db.prisma as any, db.locks as any, db.generation as any, db.wallet as any, { capture: jest.fn() } as any);
  });

  it("два параллельных одинаковых запроса — один вызов провайдера и один вариант для обоих", async () => {
    const [a, b] = await Promise.all([request("u1"), request("u2")]);

    expect(db.providerCalls).toHaveLength(1);
    expect([a.via, b.via].sort()).toEqual(["coalesced", "generated"]);

    const leader = a.via === "generated" ? a : b;
    const follower = a.via === "generated" ? b : a;
    const res = await complete(leader.jobId);

    expect(db.assets).toHaveLength(1);
    expect(res.followerJobIds).toEqual([follower.jobId]);
    expect(db.jobs.find((j) => j.id === follower.jobId)).toMatchObject({ status: "completed", output: { url: db.assets[0].url } });
    // Ожидавший платит полную цену — его резерв списывается.
    expect(db.wallet.capture).toHaveBeenCalledWith(`gen:${follower.jobId}`);
  });

  it("готовый вариант выдаётся другому пользователю из кэша, без генерации", async () => {
    const first = await request("u1");
    await complete(first.jobId);

    const second = await request("u2");
    expect(second.via).toBe("cache");
    expect(second.hit).toEqual({ assetId: db.assets[0].id, output: { url: db.assets[0].url } });
    expect(db.providerCalls).toHaveLength(1);
    expect(db.generation.createDerivedJob).toHaveBeenCalledWith(
      "u2",
      expect.objectContaining({ output: { url: db.assets[0].url } }),
      expect.objectContaining({ cache: expect.objectContaining({ role: "hit", assetId: db.assets[0].id }) }),
    );
  });

  it("пул вариантов: пользователь не получает один вариант дважды — тогда генерируется новый", async () => {
    const first = await request("u1");
    await complete(first.jobId);

    const again = await request("u1");
    expect(again.via).toBe("generated");
    await complete(again.jobId);
    expect(db.assets).toHaveLength(2);

    // u2 получает варианты по очереди, начиная со старого, затем — новый.
    const v1 = await request("u2");
    const v2 = await request("u2");
    expect(v1.hit?.assetId).toBe(db.assets[0].id);
    expect(v2.hit?.assetId).toBe(db.assets[1].id);
    expect((await request("u2")).via).toBe("generated");
  });

  it("свой повторный запрос во время своей же генерации не ждёт её, а запускает новую", async () => {
    const [a, b] = await Promise.all([request("u1"), request("u1")]);
    expect([a.via, b.via]).toEqual(["generated", "generated"]);
    expect(db.providerCalls).toHaveLength(2);
  });

  it("scope OWNER (приватный персонаж): другие пользователи кэш не делят", async () => {
    const own = await request("u1", "priv");
    await complete(own.jobId);
    expect(db.assets[0]).toMatchObject({ scope: "OWNER", ownerUserId: "u1" });

    const other = await request("u2", "priv");
    expect(other.via).toBe("generated");
    expect(db.providerCalls).toHaveLength(2);
  });

  it("ключ: свободный текст делает его личным; img2img, seed и пачка не кэшируются", () => {
    expect(mediaCacheKey("image", job, "PUBLIC", "u1")).toBe(mediaCacheKey("image", job, "PUBLIC", "u2"));
    expect(mediaCacheKey("image", job, "OWNER", "u1")).not.toBe(mediaCacheKey("image", job, "OWNER", "u2"));
    expect(mediaCacheKey("image", { ...job, prompt: "1girl,  beach, bikini " }, "PUBLIC", "u1")).toBe(
      mediaCacheKey("image", job, "PUBLIC", "u1"),
    );
    expect(mediaCacheKey("image", { ...job, initImageUrl: "https://x/a.png" }, "PUBLIC", "u1")).toBeNull();
    expect(mediaCacheKey("image", { ...job, seed: 42 }, "PUBLIC", "u1")).toBeNull();
    expect(mediaCacheKey("image", { ...job, count: 4 }, "PUBLIC", "u1")).toBeNull();
  });

  it("заблокированный в админке вариант больше не выдаётся", async () => {
    const first = await request("u1");
    await complete(first.jobId);
    db.assets[0].moderation = "blocked";

    expect((await request("u2")).via).toBe("generated");
  });

  it("неудачная генерация: ожидавшие завершаются ошибкой, их резервы возвращаются", async () => {
    const [a, b] = await Promise.all([request("u1"), request("u2")]);
    const leader = a.via === "generated" ? a : b;
    const follower = a.via === "generated" ? b : a;

    expect(await service.onJobFailed(leader.jobId, "provider down")).toEqual([follower.jobId]);
    expect(db.jobs.find((j) => j.id === follower.jobId)?.status).toBe("failed");
    expect(db.wallet.release).toHaveBeenCalledWith(`gen:${follower.jobId}`, "generation_failed");
    // Следующий запрос не ждёт провалившуюся генерацию.
    expect((await request("u3")).via).toBe("generated");
  });
});
