import { cleanAssistantReply } from "./reply-cleanup";
import { languageNote, replyLanguage } from "./context-builder";

describe("cleanAssistantReply", () => {
  it("убирает подпись медиа и пометку о задержке, которые модель копировала из истории", () => {
    expect(
      cleanAssistantReply(
        "Generated image: img_bikini_gentlewave_softlight (небольшая задержка перед отправкой) надеюсь, тебе понравится...",
      ),
    ).toBe("надеюсь, тебе понравится...");
  });

  it("убирает эхо служебных пометок", () => {
    expect(cleanAssistantReply("Привет! [Reply in Russian only.] Как дела?")).toBe("Привет! Как дела?");
  });

  it("обычный ответ не меняется; пустой результат — исходный текст", () => {
    expect(cleanAssistantReply("Привет, как прошёл день?")).toBe("Привет, как прошёл день?");
    expect(cleanAssistantReply("Generated image: x")).toBe("Generated image: x");
  });
});

describe("languageNote", () => {
  it("кириллица — отвечать по-русски, латиница — на языке сообщения", () => {
    expect(languageNote("привет")).toBe("[Reply in Russian only.]");
    expect(languageNote("hola, ¿qué tal?")).toBe("[Reply only in the same language as this message.]");
    expect(languageNote("🙂 123")).toBeNull();
  });

  it("русское сообщение — требование русского и в системном промпте", () => {
    expect(replyLanguage("скинь фото в бикини")).toBe("Russian");
    expect(replyLanguage("send a pic")).toBeNull();
  });
});
