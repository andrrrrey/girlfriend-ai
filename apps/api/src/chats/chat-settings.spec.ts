import { findForbiddenRelation, normalizeChatSettings, settingsFreeTexts } from "./chat-settings";
import { buildChatSettingsPrompt, buildGreetingKickoff, hasChatCustomization, meetingBackground } from "../conversation/chat-settings-prompt";
import { normalizeGreetings, pickGreeting } from "./character-greetings";
import { parseAgeRange } from "./character-filters";

describe("normalizeChatSettings", () => {
  it("drops unknown fields and values outside the lists", () => {
    const s = normalizeChatSettings({
      relationship: "stepsister",
      archetype: "caring",
      level: "extreme",
      likes: ["kissing", "forbidden_thing"],
      hacker: true,
      sliders: { boldness: 150, humor: -5, jealousy: "toxic" },
    });
    expect(s).toEqual({ archetype: "caring", likes: ["kissing"], sliders: { boldness: 100, humor: 0 } });
  });

  it("keeps custom scenario only with text and trims long texts", () => {
    expect(normalizeChatSettings({ meetingScenario: "custom" })).toEqual({});
    const s = normalizeChatSettings({ meetingScenario: "custom", meetingCustom: "on a train", backstory: "x".repeat(3000) });
    expect(s.meetingCustom).toBe("on a train");
    expect(s.backstory).toHaveLength(2000);
  });

  it("returns {} for garbage", () => {
    expect(normalizeChatSettings(null)).toEqual({});
    expect(normalizeChatSettings("x")).toEqual({});
  });
});

describe("findForbiddenRelation", () => {
  it.each([
    "она моя сводная сестра",
    "my step-sister from next door",
    "we met at school",
    "моя учительница",
    "Sie ist meine Stiefschwester",
    "c'est ma demi-sœur",
  ])("blocks %s", (text) => {
    expect(findForbiddenRelation(text)).not.toBeNull();
  });

  it.each([
    "a nurse from Seoul who loves jazz",
    "медсестра из Сеула, любит джаз",
    "son appartement est à Paris",
    "university graduate, works as a designer",
  ])("allows %s", (text) => {
    expect(findForbiddenRelation(text)).toBeNull();
  });
});

describe("settingsFreeTexts", () => {
  it("returns only user-typed texts, not preset keys", () => {
    const texts = settingsFreeTexts({
      occupation: "nurse",
      hobbies: ["books", "skydiving"],
      boundaries: ["no talk about exes"],
      style: { petName: "зайка" },
    });
    expect(texts).toEqual(["skydiving", "зайка", "no talk about exes"]);
  });
});

describe("buildChatSettingsPrompt", () => {
  it("is empty without settings", () => {
    expect(buildChatSettingsPrompt({})).toBe("");
    expect(hasChatCustomization({})).toBe(false);
  });

  it("describes relationship, sliders, style and boundaries", () => {
    const p = buildChatSettingsPrompt({
      relationship: "stranger",
      sliders: { boldness: 90, humor: 50, jealousy: "slight" },
      style: { length: "short", petName: "зайка" },
      level: "flirt",
      boundaries: ["talking about her ex"],
    });
    expect(p).toContain("CHAT CUSTOMIZATION");
    expect(p).toContain("stranger");
    expect(p).toContain("very bold");
    expect(p).not.toContain("humorous");
    expect(p).toContain("never toxic");
    expect(p).toContain('call the user "зайка"');
    expect(p).toContain("flirting only");
    expect(p).toContain("talking about her ex");
  });
});

describe("greeting kickoff and meeting background", () => {
  it("adds scenario hint", () => {
    expect(buildGreetingKickoff("en", {})).toBe("*enters the chat* Greet me first — keep it short and in character.");
    expect(buildGreetingKickoff("en", { meetingScenario: "cafe" })).toContain("cozy cafe");
    expect(buildGreetingKickoff("ru", { meetingScenario: "custom", meetingCustom: "в поезде" })).toContain("в поезде");
  });
  it("gives photo background", () => {
    expect(meetingBackground({})).toBeNull();
    expect(meetingBackground({ meetingScenario: "office" })).toContain("office");
  });
});

describe("character greetings", () => {
  const personality = { greetings: { en: ["Hi!", "Hey you", ""], ru: ["Привет!"], xx: ["?"] } };
  it("normalizes", () => {
    expect(normalizeGreetings(personality.greetings)).toEqual({ en: ["Hi!", "Hey you"], ru: ["Привет!"] });
  });
  it("picks a random greeting for the language", () => {
    expect(pickGreeting(personality, "en", () => 0)).toBe("Hi!");
    expect(pickGreeting(personality, "en", () => 0.99)).toBe("Hey you");
    expect(pickGreeting(personality, "ru")).toBe("Привет!");
  });
  it("returns null without greetings for the language", () => {
    expect(pickGreeting(personality, "de")).toBeNull();
    expect(pickGreeting({}, "en")).toBeNull();
  });
});

describe("parseAgeRange", () => {
  it("parses ranges", () => {
    expect(parseAgeRange("18-25")).toEqual({ min: 18, max: 25 });
    expect(parseAgeRange("46+")).toEqual({ min: 46, max: 200 });
    expect(parseAgeRange("abc")).toBeNull();
    expect(parseAgeRange(undefined)).toBeNull();
  });
});
