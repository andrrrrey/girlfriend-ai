import { ContextBuilder } from "./context-builder";

describe("ContextBuilder", () => {
  const chat: any = { id: "chat-1", characterId: "char-1", chatProfile: null };
  const actor = { id: "u", subscription: "paid", contentMode: "nsfw", isAdult: true };

  it("история для модели — без фото/видео (их подписи модель копировала в ответы)", async () => {
    const chats = { getMessageHistory: jest.fn().mockResolvedValue([{ role: "user", content: "привет" }]) };
    const builder = new ContextBuilder(chats as any);

    await builder.build(chat, actor);

    expect(chats.getMessageHistory).toHaveBeenCalledWith("chat-1", 20, { textOnly: true });
  });

  it("служебная пометка добавляется только к последнему сообщению пользователя в запросе", async () => {
    const chats = {
      getMessageHistory: jest.fn().mockResolvedValue([
        { role: "user", content: "a" },
        { role: "assistant", content: "b" },
        { role: "user", content: "пришли фото" },
      ]),
    };
    const req = await new ContextBuilder(chats as any).build(chat, actor, { lastUserNote: "[note]" });
    expect(req.messages.map((m) => m.content)).toEqual(["a", "b", "пришли фото\n\n[note]\n[Reply in Russian only.]"]);
  });
});
