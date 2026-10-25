import { BadRequestException } from "@nestjs/common";
import {
  buildCharacterImagePrompt,
  composeChatExtra,
  composeStudioPrompt,
  resolveOption,
} from "./prompt-composer";
import { CATALOG } from "./catalog.fixture";
import { parseGenerationSpec } from "./generation-spec";
import { toEnglishTag } from "./option-tags";

describe("composeStudioPrompt", () => {
  it("собирает промпт в том же порядке и с теми же тегами, что прежний buildCompositePrompt", () => {
    const spec = parseGenerationSpec({
      kind: "image",
      model: "alibaba/wan-2.6/text-to-image",
      character: {
        style: "Realistic",
        gender: "Female",
        age: 25,
        humanRace: "Европейская",
        eyeColor: "Hazel",
        eyeFeatures: ["Normal", "Long eyelashes"],
        hairColor: "Strawberry Blonde",
        hairLength: "long",
        bodyType: "curvy",
        breastSize: "Large",
        height: "Tall",
      },
      appearance: { outfits: ["Bikini"], condition: ["wet"] },
      pose: { facialExpressions: ["smile"], poses: ["img_hand_on_hip"] },
      scene: { locations: ["Beach"], timeOfDay: ["Sunset"], props: " surfboard " },
      camera: { framing: ["Close-up"], lens: ["Portrait 85mm"], lighting: ["Unknown Light"] },
      userText: " looking at camera ",
    });

    expect(composeStudioPrompt(spec, CATALOG)).toBe(
      [
        "masterpiece, best quality, highres, nsfw, explicit, photorealistic, raw photo",
        "woman, 25-year-old, caucasian",
        "hazel eyes, long eyelashes",
        "strawberry blonde hair, long hair",
        "curvy body, large breasts, tall height",
        "smiling",
        "red bikini, wet",
        "Hand On Hip, Full-Body",
        "on a sunny beach, dramatic sunset sky, vivid bands of intense orange red pink and purple coloring clouds, surfboard",
        "close-up shot, 85mm portrait lens, soft background bokeh, flattering compression, unknown light",
        "looking at camera",
      ].join(", "),
    );
  });

  it("опция находится и по названию, и по slug, и по синониму — промпт одинаковый", () => {
    const byName = composeStudioPrompt({ kind: "image", appearance: { outfits: ["Bikini"] } }, CATALOG);
    const bySlug = composeStudioPrompt({ kind: "image", appearance: { outfits: ["bikini"] } }, CATALOG);
    const bySynonym = composeStudioPrompt({ kind: "image", appearance: { outfits: ["Купальник"] } }, CATALOG);
    expect(bySlug).toBe(byName);
    expect(bySynonym).toBe(byName);
    expect(byName).toBe("masterpiece, best quality, highres, red bikini");
  });

  it("неизвестные опции из БД пропускаются, как раньше", () => {
    expect(composeStudioPrompt({ kind: "image", pose: { poses: ["nope"] } }, CATALOG)).toBe(
      "masterpiece, best quality, highres",
    );
    expect(resolveOption(CATALOG.pose.POSE, "nope")).toBeUndefined();
  });
});

describe("фото персонажа в чате", () => {
  it("поза добавляется как toEnglishTag(prompt позы) — как прежний buildChatImagePrompt", () => {
    const spec = parseGenerationSpec({ kind: "image", preset: "chat", characterId: "c", pose: { poses: ["img_hand_on_hip"] } });
    const extra = composeChatExtra(spec, CATALOG);
    expect(extra).toBe(toEnglishTag("Hand On Hip, Full-Body"));
    expect(buildCharacterImagePrompt({ avatarPrompt: "woman, red hair" }, extra)).toBe(`woman, red hair, ${extra}`);
  });

  it("без сохранённого avatarPrompt промпт собирается из атрибутов персонажа", () => {
    expect(
      buildCharacterImagePrompt({ gender: "Female", age: 22, eyeColor: "Blue", hairColor: "Блонд", breastSize: "Medium" }, "smiling"),
    ).toBe("woman, 22-year-old, blue eyes, блонд hair, medium breasts, smiling");
  });
});

describe("parseGenerationSpec", () => {
  it("отбрасывает лишние поля и пустые секции", () => {
    expect(parseGenerationSpec({ kind: "image", hacker: true, pose: {}, userText: "" })).toEqual({ kind: "image" });
  });

  it("отклоняет некорректные значения", () => {
    expect(() => parseGenerationSpec({ kind: "audio" })).toThrow(BadRequestException);
    expect(() => parseGenerationSpec({ kind: "image", count: 3 })).toThrow(BadRequestException);
    expect(() => parseGenerationSpec({ kind: "image", pose: { poses: "x" } })).toThrow(BadRequestException);
  });
});
