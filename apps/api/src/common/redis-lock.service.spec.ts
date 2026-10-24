import { RedisLockService } from "./redis-lock.service";

/** Минимальная in-memory имитация нужных команд Redis. */
function fakeRedis() {
  const store = new Map<string, string>();
  return {
    store,
    set: jest.fn(async (key: string, value: string, _px: string, _ttl: number, nx: string) => {
      if (nx === "NX" && store.has(key)) return null;
      store.set(key, value);
      return "OK";
    }),
    eval: jest.fn(async (script: string, _n: number, key: string, token: string) => {
      if (store.get(key) !== token) return 0;
      if (script.includes("del")) store.delete(key);
      return 1;
    }),
  };
}

describe("RedisLockService", () => {
  it("второй acquire того же ключа возвращает null, после release — снова свободен", async () => {
    const redis = fakeRedis();
    const locks = new RedisLockService(redis as any);

    const first = await locks.acquire("chat:1", 1000);
    expect(first).not.toBeNull();
    expect(await locks.acquire("chat:1", 1000)).toBeNull();

    await locks.release(first!);
    expect(await locks.acquire("chat:1", 1000)).not.toBeNull();
  });

  it("release чужим токеном не снимает лок", async () => {
    const redis = fakeRedis();
    const locks = new RedisLockService(redis as any);
    await locks.acquire("chat:1", 1000);

    await locks.release({ key: "chat:1", token: "someone-else" });
    expect(redis.store.has("lock:chat:1")).toBe(true);
  });

  it("withLock освобождает лок даже при ошибке и сообщает о занятости", async () => {
    const redis = fakeRedis();
    const locks = new RedisLockService(redis as any);

    await expect(locks.withLock("job", 1000, async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    expect(redis.store.size).toBe(0);

    const held = await locks.acquire("job", 1000);
    expect(await locks.withLock("job", 1000, async () => 1)).toEqual({ acquired: false });
    await locks.release(held!);
    expect(await locks.withLock("job", 1000, async () => 1)).toEqual({ acquired: true, result: 1 });
  });
});
