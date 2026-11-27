import { checkRules } from "./moderation-rules";

describe("moderation rules", () => {
  const blocked: [string, string][] = [
    ["nude schoolgirl in classroom", "minor"],
    ["sexy teen girl", "minor"],
    ["l0li anime girl", "minor"],
    ["a 15 years old girl in bikini", "minor"],
    ["girl, 14yo, lingerie", "minor"],
    ["голая школьница", "minor"],
    ["девушке 16 лет, бельё", "minor"],
    ["16-летняя девушка", "minor"],
    ["nacktes Kind", "minor"],
    ["fille de 15 ans", "minor"],
    ["une enfant", "minor"],
    ["stepsis in the kitchen", "incest"],
    ["step-mom seduces", "incest"],
    ["naked with her brother", "incest"],
    ["секс с сестрой", "incest"],
    ["инцест", "incest"],
    ["Taylor Swift nude", "real_person"],
    ["голый Путин", "real_person"],
    ["celebrity lookalike in bed", "real_person"],
    ["rape scene", "non_consent"],
    ["изнасилование", "non_consent"],
    ["nude girl sleeping, unconscious", "non_consent"],
    ["sex with a dog", "bestiality"],
    ["зоофилия", "bestiality"],
    ["necrophilia", "necrophilia"],
    ["decapitated woman, gore", "violence"],
    ["nazi uniform", "other"],
  ];

  it.each(blocked)("blocks %s", (text, category) => {
    expect(checkRules(text)?.category).toBe(category);
  });

  const allowed = [
    "beautiful woman, 25 years old, red dress, beach at sunset",
    "nude woman on the bed, soft light",
    "девушка 23 лет в бикини на пляже",
    "doggy style, adult woman, lingerie",
    "woman in a striped shirt with her sister at a cafe",
    "gorgeous redhead, moment of joy, momentum",
    "violet dress, violin",
    "tiered skirt, lingerie",
    "mature woman, 35 yo, office",
    "Frau, 30 Jahre, Strand",
    "femme de 28 ans, plage",
  ];

  it.each(allowed)("allows %s", (text) => {
    expect(checkRules(text)).toBeNull();
  });

  it("uses extra admin blocklist and names", () => {
    expect(checkRules("photo of foo bar", ["foo bar"])?.category).toBe("other");
    expect(checkRules("Ivan Testov in bed", [], ["Ivan Testov"])?.category).toBe("real_person");
  });
});
