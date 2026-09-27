/**
 * @file random-pools.ts
 * @description Пулы значений и генераторы для случайного создания персонажей.
 *
 * Списки — зеркало apps/web/app/create/data.ts (английские лейблы, как их шлёт
 * фронт). Значения проходят ту же нормализацию (normalizeCharacterDto) при
 * создании персонажа, поэтому в БД лягут канонические snake_case ключи.
 */

import type { CreateUserCharacterDto } from "../../chats/dto/create-user-character.dto";

// ─── Пулы (зеркало create/data.ts) ───────────────────────────────────────────

const GENDERS = ["Female", "Male", "Non-binary", "Trans Female", "Trans Male"];
const ORIENTATIONS = ["Heterosexual", "Bisexual", "Homosexual", "Pansexual", "Asexual"];
const NATIONALITIES = ["American", "British", "German", "French", "Italian", "Spanish", "Japanese", "Korean", "Chinese", "Brazilian", "Russian", "Australian", "Canadian", "Mexican", "Indian", "Swedish", "Norwegian", "Dutch", "Polish", "Ukrainian", "Thai", "Colombian", "Argentine", "Turkish", "Egyptian", "Irish"];
const LANGUAGES = ["English", "Spanish", "French", "German", "Italian", "Portuguese", "Japanese", "Korean", "Chinese", "Russian", "Arabic", "Hindi", "Turkish", "Polish", "Dutch", "Swedish", "Thai", "Vietnamese"];
const ETHNICITIES = ["Slavic", "Caucasian", "Asian", "Hispanic", "Arabic", "Black", "Latino", "Indian", "Mixed", "Scandinavian"];
const EYE_COLORS = ["Blue", "Brown", "Green", "Hazel", "Gray", "Amber", "Violet", "Black"];
const HAIR_STYLES = ["Straight", "Wavy", "Curly", "Braids", "Bun", "Ponytail", "Pixie Cut", "Bob", "Long Layers", "Dreadlocks", "Bangs", "Twin Tails", "Updo", "Messy", "Side Part"];
const HAIR_COLORS = ["Blonde", "Brunette", "Black", "Red", "Auburn", "Platinum", "Silver", "Pink", "Blue", "Purple", "Ombre", "Strawberry Blonde", "Copper", "Caramel"];
const BODY_TYPES = ["Petite", "Slim", "Athletic", "Curvy", "Thick", "Hourglass", "Fit", "Voluptuous", "Muscular"];
const SIZES = ["Flat", "Small", "Medium", "Large", "Huge"];
const RELATIONSHIP_TYPES = ["Girlfriend", "Boyfriend", "Friend", "Companion", "Mentor", "Rival", "Secret Lover", "Soulmate", "Sugar Baby", "Mistress", "Dominatrix", "Submissive Partner"];
const FAMILY_STATUSES = ["Single", "In a Relationship", "Married", "Divorced", "Widowed", "Separated", "Complicated"];
const LIFESTYLES = ["Active", "Lazy", "Homebody", "Sporty", "Party Girl", "Workaholic", "Adventurer", "Minimalist", "Luxurious", "Bohemian", "Health-Conscious", "Night Owl"];
const WORKS = ["Unemployed", "Housewife", "Teacher", "Cook", "Nurse", "Model", "Dancer", "Artist", "Writer", "Student", "Barista", "Yoga Instructor", "Fitness Trainer", "Influencer", "Photographer", "Entrepreneur", "Lawyer", "Doctor", "Programmer", "Fashion Designer", "Musician", "Waitress", "Librarian", "Florist", "Chef", "Therapist", "Streamer", "Masseuse"];
const HOBBIES = ["Pottery", "Photography", "Painting", "Yoga", "Dancing", "Cooking", "Reading", "Gaming", "Hiking", "Swimming", "Surfing", "Singing", "Piano", "Guitar", "Gardening", "Cosplay", "Fashion", "Travel", "Anime", "Writing", "Meditation", "Rock Climbing", "Horseback Riding", "Archery", "Martial Arts", "Wine Tasting", "Baking", "Shopping", "Film Making"];
const KINKS = [
  ...["Role Play", "Teacher/Student", "Boss/Secretary", "Strangers", "Cosplay", "Nurse", "Maid", "Public", "Office", "Pool Party", "Massage", "Photoshoot", "Workout Partner", "Roommate", "Neighbor"],
  ...["Dominant", "Submissive", "Bondage", "Blindfold", "Handcuffs", "Teasing", "Edging", "Worship", "Praise", "Humiliation", "Pet Play", "Collar", "Leash", "Service"],
  ...["Lingerie", "Leather", "Latex", "Stockings", "High Heels", "Uniform", "Wet", "Ice Play", "Wax", "Feather", "Whispering", "ASMR", "Dirty Talk", "Voyeurism", "Exhibitionism"],
];
const PERSONALITIES = ["Overly Confident", "Mysterious", "Obsessed With You", "Caregiver", "Dominant", "Submissive", "Seductress", "Cruel & Unforgiving", "Free Spirited", "Demanding Bully", "Hopeless Romantic", "Insatiable", "Shy & Innocent", "Playful Tease", "Intellectual", "Motherly", "Tsundere", "Yandere"];
const STYLES = ["Realistic", "Semi-real", "Anime", "2d"];

// Имена для генератора. Не привязаны к полу жёстко — рандом есть рандом.
const FEMALE_NAMES = ["Ava", "Sofia", "Mia", "Luna", "Isabella", "Aria", "Nova", "Chloe", "Emma", "Zoe", "Layla", "Nina", "Elena", "Yuki", "Sakura", "Ingrid", "Freya", "Camila", "Priya", "Amara", "Bianca", "Daria", "Vera", "Mila"];
const MALE_NAMES = ["Liam", "Noah", "Ethan", "Kai", "Adrian", "Leo", "Marco", "Dylan", "Elias", "Ivan", "Hiro", "Diego", "Aran", "Felix", "Nikolai", "Theo", "Ruben", "Sebastian"];
const SURNAMES = ["Smith", "Novak", "Ivanova", "Rossi", "Dubois", "Kim", "Tanaka", "Silva", "Nguyen", "Ahmed", "Muller", "Johansson", "Reyes", "Kowalski", "Petrova", "Okafor", "Castillo", "Bauer"];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Случайное подмножество из min..max элементов (без повторов). */
function pickSome<T>(arr: T[], min: number, max: number): T[] {
  const n = min + Math.floor(Math.random() * (max - min + 1));
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

// ─── Опции из БД (как на /create) ────────────────────────────────────────────

/** Опция персонажа из админки (CharacterOption): имя + английский промпт. */
export interface PoolOption {
  id: string;
  name: string;
  prompt?: string | null;
  generationStyle?: string | null;
}

/**
 * Контекст задачи: всё, что /create берёт из админки. Загружается один раз на
 * задачу (AutogenService.loadContext). Пустой список → фолбэк на статичный пул.
 */
export interface AutogenContext {
  styles: PoolOption[];
  humanRaces: PoolOption[];
  fantasyRaces: PoolOption[];
  hairStyles: PoolOption[];
  bodyTypes: PoolOption[];
  breastSizes: PoolOption[];
  buttSizes: PoolOption[];
  /** Голоса из каталога (Voice.isActive) — name + ElevenLabs voiceId. */
  voices: { name: string; voiceId: string }[];
  /** Промпты опций генерации для случайных одежды/эмоции/позы/локации/кадра. */
  outfits: string[];
  expressions: string[];
  poses: string[];
  locations: string[];
  framings: string[];
  allowedGenders?: string[];
}

/** Доля персонажей с фэнтези-расой (на /create она опциональна, поверх обычной). */
const FANTASY_RACE_CHANCE = 0.2;

function pickOpt(options: PoolOption[], fallback: string[]): { name: string; prompt?: string } {
  if (options.length > 0) {
    const o = pick(options);
    return { name: o.name, prompt: o.prompt || undefined };
  }
  return { name: pick(fallback) };
}

/** Случайный DTO + промпты выбранных опций (нужны только для аватара). */
export interface RandomCharacter {
  dto: CreateUserCharacterDto;
  prompts: { ethnicity?: string; hairStyle?: string; bodyType?: string };
}

/**
 * Собирает случайного персонажа так же, как «Create Your Character» (/create):
 * стиль/расы/причёски/типы тела/размеры — из опций админки (с их промптами и
 * generationStyle стиля), голос — из каталога, остальное — из тех же списков,
 * что и на /create. Нормализация значений — при создании (normalizeCharacterDto).
 *
 * @param style — стиль персонажа (опция STYLE), выбранный планом задачи.
 */
export function buildRandomCharacter(ctx: AutogenContext, style?: PoolOption): RandomCharacter {
  const genderPool =
    ctx.allowedGenders && ctx.allowedGenders.length > 0
      ? GENDERS.filter((g) => ctx.allowedGenders!.includes(g))
      : GENDERS;
  const gender = pick(genderPool.length > 0 ? genderPool : ["Female"]);
  const isFemale = gender === "Female" || gender === "Trans Female";
  const namePool = isFemale ? FEMALE_NAMES : Math.random() < 0.5 ? MALE_NAMES : FEMALE_NAMES;

  const styleOpt = style ?? (ctx.styles.length > 0 ? pick(ctx.styles) : undefined);
  const human = pickOpt(ctx.humanRaces, ETHNICITIES);
  // Фэнтези-раса (эльф, демон…) заменяет обычную, как на /create.
  const fantasy =
    ctx.fantasyRaces.length > 0 && Math.random() < FANTASY_RACE_CHANCE ? pickOpt(ctx.fantasyRaces, []) : undefined;
  const race = fantasy ?? human;
  const hairStyle = pickOpt(ctx.hairStyles, HAIR_STYLES);
  const bodyType = pickOpt(ctx.bodyTypes, BODY_TYPES);
  const voice = ctx.voices.length > 0 ? pick(ctx.voices) : undefined;

  const dto: CreateUserCharacterDto = {
    name: pick(namePool),
    surname: Math.random() < 0.6 ? pick(SURNAMES) : undefined,
    age: randInt(18, 50),
    gender,
    orientation: pick(ORIENTATIONS),
    style: styleOpt?.name ?? pick(STYLES),
    generationStyle: styleOpt?.generationStyle || undefined,
    nationality: pick(NATIONALITIES),
    language: pick(LANGUAGES),
    ethnicity: race.name,
    voice: voice?.name,
    voiceId: voice?.voiceId,
    eyeColor: pick(EYE_COLORS),
    hairStyle: hairStyle.name,
    hairColor: pick(HAIR_COLORS),
    bodyType: bodyType.name,
    breastSize: pickOpt(ctx.breastSizes, SIZES).name,
    buttSize: pickOpt(ctx.buttSizes, SIZES).name,
    personality: pick(PERSONALITIES),
    relationshipType: pick(RELATIONSHIP_TYPES),
    familyStatus: pick(FAMILY_STATUSES),
    lifestyle: pick(LIFESTYLES),
    work: pickSome(WORKS, 1, 3),
    hobbies: pickSome(HOBBIES, 1, 3),
    kinks: pickSome(KINKS, 3, 7),
  };
  return {
    dto,
    prompts: { ethnicity: race.prompt, hairStyle: hairStyle.prompt, bodyType: bodyType.prompt },
  };
}

/** Случайные одежда/эмоция/поза/локация/кадр — как pickRandomPrompts на /create. */
export function pickRandomScenePrompts(ctx: AutogenContext): string[] {
  const one = (arr: string[]) => (arr.length > 0 ? [pick(arr)] : []);
  return [...one(ctx.outfits), ...one(ctx.expressions), ...one(ctx.poses), ...one(ctx.locations), ...one(ctx.framings)];
}

/**
 * Промпт аватара — зеркало buildAvatarPrompt из apps/web/app/create/page.tsx:
 * английский промпт опции, если есть, иначе её имя. Без extraPrompts — это
 * identity-промпт (сохраняется как avatarPrompt и переиспользуется в чате).
 */
export function buildAvatarPrompt(char: RandomCharacter, extraPrompts: string[] = []): string {
  const { dto, prompts } = char;
  const parts = [
    dto.style === "Anime" ? "anime style" : "photorealistic",
    (dto.gender || "female").toLowerCase(),
    dto.age ? `${dto.age} years old` : "",
    prompts.ethnicity || (dto.ethnicity ? dto.ethnicity.toLowerCase() : ""),
    dto.hairColor ? `${dto.hairColor.toLowerCase()} hair` : "",
    prompts.hairStyle || (dto.hairStyle ? `${dto.hairStyle.toLowerCase()} hairstyle` : ""),
    dto.eyeColor ? `${dto.eyeColor.toLowerCase()} eyes` : "",
    prompts.bodyType || (dto.bodyType ? `${dto.bodyType.toLowerCase()} body` : ""),
    ...extraPrompts,
    "beautiful, high quality, detailed",
  ].filter(Boolean);
  return parts.join(", ");
}
