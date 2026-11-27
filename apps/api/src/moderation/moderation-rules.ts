/**
 * @file moderation-rules.ts
 * @description Единый список запретов для запросов генерации (быстрая проверка
 * по словарю, RU/EN/DE/FR). Второй рубеж — LLM-классификация (/ai/moderate),
 * она ловит эвфемизмы и обход фильтра.
 *
 * Категории: minor (дети и всё, что на них похоже), incest, real_person,
 * non_consent, bestiality, necrophilia, violence, other.
 */

export type ModerationCategory =
  | "minor"
  | "incest"
  | "real_person"
  | "non_consent"
  | "bestiality"
  | "necrophilia"
  | "violence"
  | "other";

export const MODERATION_CATEGORIES: ModerationCategory[] = [
  "minor",
  "incest",
  "real_person",
  "non_consent",
  "bestiality",
  "necrophilia",
  "violence",
  "other",
];

/** Начало слова (буква не предшествует) — \b не работает с кириллицей. */
const B = "(?<![\\p{L}\\p{N}])";
/** Конец слова. */
const E = "(?![\\p{L}\\p{N}])";

const word = (alts: string[]) => new RegExp(`${B}(?:${alts.join("|")})${E}`, "iu");
const stem = (alts: string[]) => new RegExp(`${B}(?:${alts.join("|")})`, "iu");

/** Сексуальный контекст — для правил «член семьи/спящая/труп/животное + секс». */
const SEXUAL = stem([
  "sex", "fuck", "nude", "naked", "nsfw", "porn", "cum", "blowjob", "orgasm", "horny", "erotic",
  "pussy", "penis", "dick", "cock", "boob", "tits", "breast", "nipple", "lingerie", "topless", "undress",
  "stripp", "striptease", "masturbat", "penetrat", "intercourse", "aroused", "seduc", "bdsm", "kinky", "spread legs",
  "секс", "трах", "ебл", "ебат", "выеб", "голая", "голый", "голые", "обнаж", "порн", "минет", "эрот",
  "член", "киск", "сиськ", "сиси", "грудь", "соск", "оргазм", "возбужд", "мастурб", "раздет", "раздев",
  "nackt", "fick", "titten", "brüste", "erotisch", "porno",
  "nue", "nu ", "sexe", "baise", "seins", "érotique", "excitée",
]);

const MINOR = [
  word([
    "child", "children", "childs?", "kids?", "kiddies", "toddlers?", "infants?", "underage", "under-age",
    "pre-?teens?", "teens?", "teenagers?", "teenage", "tweens?", "loli", "lolis", "lolita", "lolicon",
    "shota", "shotacon", "jailbait", "pedo", "paedo", "pedophil\\w*", "paedophil\\w*",
    "school ?girls?", "school ?boys?", "elementary school", "middle school", "kindergarten", "little girls?",
    "little boys?", "young girls?", "young boys?", "girl child", "minors", "juvenile", "pubescent", "prepubescent",
    "flat[- ]chested child", "childlike", "child-like", "chibi", "cub",
  ]),
  stem([
    "ребен", "ребён", "дети", "детей", "детск", "детишк", "малолет", "несовершеннолет", "подрост", "школьниц",
    "школьник", "школота", "девочк", "мальчик", "малыш", "младен", "лоли", "тинейдж", "педоф", "ученица",
    "первоклас", "пионерк",
    "kinder", "kindlich", "minderjährig", "jugendlich", "schulmädchen", "kleines mädchen", "kleiner junge",
    "enfant", "mineure?", "gamine", "fillette", "écolière", "ecoliere", "adolescent", "pédophil", "pedophil",
  ]),
];

/** Нем. «Kind» совпадает с англ. «kind» — считаем только в сексуальном контексте. */
const KIND_DE = word(["kind", "kindes"]);

/** Возраст ниже 18, записанный цифрами: «16 years old», «15yo», «14 лет», «16 Jahre», «15 ans», «age 12». */
const AGE_PATTERNS = [
  new RegExp(`${B}(\\d{1,2})\\s*[- ]?(?:years?[- ]?old|yrs?[- ]?old|y\\.?\\s?o\\.?|yo)${E}`, "iu"),
  new RegExp(`${B}(?:age[ds]?|aged|возраст(?:ом)?|alter|âge|age de)\\s*[:=]?\\s*(\\d{1,2})${E}`, "iu"),
  new RegExp(`${B}(\\d{1,2})\\s*[- ]?(?:лет|год|года|годиков|летн\\p{L}*|jahre?|jährig\\p{L}*|ans)${E}`, "iu"),
];

const FAMILY_WORDS = word([
  "sisters?", "brothers?", "moms?", "mommy", "mothers?", "father", "daughters?", "sons?", "aunts?", "aunty",
  "uncles?", "cousins?", "nieces?", "nephews?", "grandma", "grandpa", "family",
]);
const FAMILY = stem([
  "сестр", "брат", "мама", "мамой", "мамочк", "мать", "матери", "отец", "отца", "папа", "папой", "дочь", "дочер",
  "дочк", "сын", "тетя", "тетей", "тетк", "тетуш", "дяд", "кузин", "племянн", "бабушк", "дедушк", "отчим", "мачех", "сводн",
  "schwester", "bruder", "mutter", "vater", "tochter", "sohn", "tante", "onkel", "cousine",
  "sœur", "soeur", "frère", "frere", "mère", "père", "fille de", "fils", "tante", "oncle", "cousine",
]);

const INCEST = [
  stem(["incest", "инцест", "inzest", "inceste", "step-?sis", "step-?bro", "step-?mom", "step-?dad", "step-?daughter",
    "step-?son", "step-?sister", "step-?brother", "step-?mother", "step-?father", "family taboo", "taboo family"]),
];

const NON_CONSENT = [
  stem(["rape", "raping", "raped", "rapist", "forced sex", "forced to", "non-?consensual", "noncon", "molest",
    "sexual assault", "sexually assault", "against (?:her|his|their) will", "abduct", "kidnap", "roofie", "date rape",
    "изнасил", "насилу", "насиль", "принужд", "против (?:её|ее|его|своей) воли", "без согласия", "похищ",
    "vergewaltig", "gegen ihren willen", "nötigung", "entführ",
    "violée?s?" + E, "violer" + E, "viol" + E, "contre son gré", "contre sa volonté", "enlèvement"]),
];
/** Беспомощное состояние — запрещено только в сексуальном контексте. */
const HELPLESS = stem([
  "drugged", "unconscious", "passed out", "sleeping", "asleep", "intoxicated", "drunk girl", "blackout",
  "без сознания", "бессознат", "спящ", "спит", "накачан", "пьяная", "в отключке",
  "bewusstlos", "schlafend", "betrunken", "inconsciente?", "endormie?", "droguée?",
]);

const BESTIALITY = [stem(["bestial", "zoophil", "zoo sex", "зоофил", "скотолож", "sodomie animale", "sodomie avec"])];
const ANIMAL = stem([
  "собак", "пес ", "псом", "конь", "коня", "лошад", "животн", "hund", "pferd", "chien", "cheval",
]);
const ANIMAL_WORDS = word(["dogs?", "horses?", "animals?", "beasts?", "tiere?"]);

const NECRO = [stem(["necrophil", "некрофил", "nekrophil", "nécrophil"])];
const CORPSE = stem(["corpse", "dead body", "dead girl", "труп", "мёртв", "мертв", "leiche", "cadavre"]);

const VIOLENCE = [
  stem(["gore", "dismember", "decapitat", "behead", "mutilat", "tortur", "snuff", "disembowel", "guro",
    "расчлен", "обезглав", "пытк", "пытат", "изувеч", "folter", "verstümmel", "enthaupt", "démembr", "décapit"]),
];

const OTHER = [
  stem(["nazi", "swastika", "hakenkreuz", "свастик", "нацист", "kkk", "ku klux", "isis", "terroris", "террорист",
    "self-?harm", "suicide", "суицид", "самоуб", "selbstmord"]),
];

/** Узнаваемые реальные люди (база; расширяется списком из админки). LLM ловит остальных. */
const REAL_PERSON_NAMES = [
  "taylor swift", "billie eilish", "scarlett johansson", "emma watson", "margot robbie", "ariana grande",
  "kim kardashian", "kylie jenner", "kendall jenner", "selena gomez", "jennifer lawrence", "gal gadot",
  "angelina jolie", "megan fox", "dua lipa", "rihanna", "beyonce", "beyoncé", "natalie portman", "zendaya",
  "jenna ortega", "millie bobby brown", "sydney sweeney", "ana de armas", "emma stone", "anne hathaway",
  "jennifer aniston", "shakira", "lady gaga", "miley cyrus", "olivia rodrigo", "sabrina carpenter",
  "elon musk", "donald trump", "joe biden", "kamala harris", "vladimir putin", "zelensky", "zelenskyy",
  "путин", "трамп", "байден", "зеленск", "бузова", "ивлеева", "пугачёва", "пугачева", "собчак",
];
const REAL_PERSON = [
  stem([
    "celebrit", "famous (?:actress|actor|singer|model|person|streamer|influencer)", "lookalike", "look-alike",
    "deepfake", "deep fake", "real person", "real people",
    "знаменитост", "звезд[аыу] (?:кино|эстрады)", "известн(?:ая|ый|ой) (?:актрис|актёр|актер|певиц|блогер|модел)",
    "двойник", "дипфейк", "реальн(?:ый|ая|ого|ую) челов",
    "berühmtheit", "prominente", "célébrité", "sosie",
  ]),
];

export type RuleHit = { category: ModerationCategory; match: string };

/** Нормализация: регистр, ё→е, простая «leetspeak»-замена, схлопывание разделителей внутри слова. */
export function normalizePrompt(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKC")
    .replace(/ё/g, "е")
    .replace(/(?<=\p{L})[._*\-](?=\p{L})/gu, "")
    .replace(/(?<=\p{L})0(?=\p{L})/gu, "o")
    .replace(/(?<=\p{L})1(?=\p{L})/gu, "i")
    .replace(/(?<=\p{L})3(?=\p{L})/gu, "e")
    .replace(/(?<=\p{L})4(?=\p{L})/gu, "a")
    .replace(/(?<=\p{L})@(?=\p{L})/gu, "a")
    .replace(/(?<=\p{L})\$(?=\p{L})/gu, "s")
    .replace(/\s+/g, " ");
}

function firstMatch(text: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return m[0];
  }
  return null;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Проверка текста по словарю. Возвращает первую найденную категорию или null.
 * @param extra — дополнительные запрещённые слова/фразы из админки (подстрока, без учёта регистра)
 * @param extraNames — дополнительные имена реальных людей из админки
 */
export function checkRules(text: string, extra: string[] = [], extraNames: string[] = []): RuleHit | null {
  if (!text) return null;
  const t = normalizePrompt(text);

  const sexual = SEXUAL.test(t);

  const minor = firstMatch(t, MINOR) ?? (sexual ? t.match(KIND_DE)?.[0] ?? null : null);
  if (minor) return { category: "minor", match: minor };
  for (const re of AGE_PATTERNS) {
    const m = t.match(re);
    if (m && Number(m[1]) < 18) return { category: "minor", match: m[0] };
  }


  const incest = firstMatch(t, INCEST);
  if (incest) return { category: "incest", match: incest };
  if (sexual) {
    const fam = t.match(FAMILY_WORDS) ?? t.match(FAMILY);
    if (fam) return { category: "incest", match: fam[0] };
  }

  const nc = firstMatch(t, NON_CONSENT);
  if (nc) return { category: "non_consent", match: nc };
  if (sexual) {
    const h = t.match(HELPLESS);
    if (h) return { category: "non_consent", match: h[0] };
  }

  const best = firstMatch(t, BESTIALITY);
  if (best) return { category: "bestiality", match: best };
  if (sexual) {
    const a = t.match(ANIMAL_WORDS) ?? t.match(ANIMAL);
    if (a) return { category: "bestiality", match: a[0] };
  }

  const necro = firstMatch(t, NECRO);
  if (necro) return { category: "necrophilia", match: necro };
  if (sexual) {
    const c = t.match(CORPSE);
    if (c) return { category: "necrophilia", match: c[0] };
  }

  const names = [...REAL_PERSON_NAMES, ...extraNames.map((n) => normalizePrompt(n).trim()).filter(Boolean)];
  const nameRe = new RegExp(`${B}(?:${names.map(escapeRe).join("|")})`, "iu");
  const name = t.match(nameRe);
  if (name) return { category: "real_person", match: name[0] };
  const rp = firstMatch(t, REAL_PERSON);
  if (rp) return { category: "real_person", match: rp };

  const vio = firstMatch(t, VIOLENCE);
  if (vio) return { category: "violence", match: vio };

  const other = firstMatch(t, OTHER);
  if (other) return { category: "other", match: other };

  for (const raw of extra) {
    const w = normalizePrompt(raw).trim();
    if (w && t.includes(w)) return { category: "other", match: w };
  }
  return null;
}
