import { OutboxDispatcher, backoffMs } from "./outbox.dispatcher";
import { OutboxService } from "./outbox.service";

describe("OutboxDispatcher", () => {
  let prisma: any;
  let outbox: OutboxService;
  let dispatcher: OutboxDispatcher;

  beforeEach(() => {
    prisma = {
      $queryRaw: jest.fn(),
      outboxEvent: { update: jest.fn(), deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    outbox = new OutboxService();
    dispatcher = new OutboxDispatcher(prisma, outbox, { scheduleInterval: jest.fn(), scheduleDaily: jest.fn() } as any);
  });

  it("доставляет событие подписчикам и помечает done", async () => {
    const handler = jest.fn().mockResolvedValue(undefined);
    outbox.registerHandler("message.created", handler);
    const event = { id: "e-1", type: "message.created", payload: { messageId: "m-1" }, attempts: 1 };
    prisma.$queryRaw.mockResolvedValue([event]);

    expect(await dispatcher.dispatchBatch()).toBe(1);
    expect(handler).toHaveBeenCalledWith(event);
    expect(prisma.outboxEvent.update).toHaveBeenCalledWith({
      where: { id: "e-1" },
      data: expect.objectContaining({ status: "done" }),
    });
  });

  it("событие без подписчиков тоже помечается доставленным", async () => {
    prisma.$queryRaw.mockResolvedValue([{ id: "e-1", type: "unknown", payload: {}, attempts: 1 }]);
    await dispatcher.dispatchBatch();
    expect(prisma.outboxEvent.update.mock.calls[0][0].data.status).toBe("done");
  });

  it("ошибка подписчика → повтор с задержкой, после лимита попыток → failed", async () => {
    outbox.registerHandler("message.created", jest.fn().mockRejectedValue(new Error("telegram 500")));

    prisma.$queryRaw.mockResolvedValue([{ id: "e-1", type: "message.created", payload: {}, attempts: 2 }]);
    await dispatcher.dispatchBatch();
    expect(prisma.outboxEvent.update.mock.calls[0][0].data).toMatchObject({ status: "pending", lastError: "telegram 500" });

    prisma.$queryRaw.mockResolvedValue([{ id: "e-1", type: "message.created", payload: {}, attempts: 8 }]);
    await dispatcher.dispatchBatch();
    expect(prisma.outboxEvent.update.mock.calls[1][0].data.status).toBe("failed");
  });

  it("задержка повтора растёт экспоненциально и ограничена 30 минутами", () => {
    expect(backoffMs(1)).toBe(5_000);
    expect(backoffMs(2)).toBe(10_000);
    expect(backoffMs(20)).toBe(30 * 60_000);
  });
});
