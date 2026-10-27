import { ChatEventsService } from "./chat-events.service";

describe("ChatEventsService", () => {
  it("новое сообщение (outbox) публикуется в Redis-канал чата и доходит до подписчиков", async () => {
    let handler: ((e: any) => Promise<void>) | undefined;
    let onMessage: ((pattern: string, channel: string, message: string) => void) | undefined;
    const subscriber = {
      on: jest.fn((_event: string, cb: any) => (onMessage = cb)),
      psubscribe: jest.fn().mockResolvedValue(1),
      quit: jest.fn().mockResolvedValue("OK"),
    };
    const redis = {
      publish: jest.fn(async (channel: string, message: string) => onMessage?.("chat-events:*", channel, message)),
      duplicate: jest.fn(() => subscriber),
    };
    const outbox = { registerHandler: jest.fn((_type: string, h: any) => (handler = h)) };

    const service = new ChatEventsService(redis as any, outbox as any);
    await service.onModuleInit();

    const received: unknown[] = [];
    const unsubscribe = service.subscribe("chat-1", (e) => received.push(e));
    await handler!({ payload: { messageId: "m1", chatSessionId: "chat-1", role: "assistant", type: "image", source: "telegram" } });
    await handler!({ payload: { messageId: "m2", chatSessionId: "chat-2", role: "user", type: "text", source: "web" } });

    expect(redis.publish).toHaveBeenCalledWith("chat-events:chat-1", expect.any(String));
    expect(received).toEqual([{ type: "message", messageId: "m1", role: "assistant", messageType: "image", source: "telegram" }]);

    unsubscribe();
    await handler!({ payload: { messageId: "m3", chatSessionId: "chat-1", role: "user", type: "text", source: "telegram" } });
    expect(received).toHaveLength(1);
  });
});
