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

// ─── Public ──────────────────────────────────────────────────────────────────

/**
 * Собирает полностью случайный DTO персонажа (английские лейблы, как с фронта).
 * Нормализация значений произойдёт при создании (normalizeCharacterDto).
 */
export function buildRandomCharacterDto(): CreateUserCharacterDto {
  const gender = pick(GENDERS);
  const isFemale = gender === "Female" || gender === "Trans Female";
  const namePool = isFemale ? FEMALE_NAMES : Math.random() < 0.5 ? MALE_NAMES : FEMALE_NAMES;

  return {
    name: pick(namePool),
    surname: Math.random() < 0.6 ? pick(SURNAMES) : undefined,
    age: randInt(18, 45),
    gender,
    orientation: pick(ORIENTATIONS),
    style: pick(STYLES),
    nationality: pick(NATIONALITIES),
    language: pick(LANGUAGES),
    ethnicity: pick(ETHNICITIES),
    eyeColor: pick(EYE_COLORS),
    hairStyle: pick(HAIR_STYLES),
    hairColor: pick(HAIR_COLORS),
    bodyType: pick(BODY_TYPES),
    breastSize: pick(SIZES),
    buttSize: pick(SIZES),
    personality: pick(PERSONALITIES),
    relationshipType: pick(RELATIONSHIP_TYPES),
    familyStatus: pick(FAMILY_STATUSES),
    lifestyle: pick(LIFESTYLES),
    work: pickSome(WORKS, 1, 2),
    hobbies: pickSome(HOBBIES, 2, 4),
    kinks: pickSome(KINKS, 2, 5),
  };
}

/**
 * Строит промпт для генерации аватара из случайного DTO.
 * Аналог buildAvatarPrompt из apps/web/app/create/page.tsx, но на серверных
 * (ещё не нормализованных) английских лейблах — их можно класть в промпт как есть.
 */
export function buildAvatarPrompt(dto: CreateUserCharacterDto): string {
  const parts = [
    dto.style === "Anime" ? "anime style" : "photorealistic",
    (dto.gender || "female").toLowerCase(),
    dto.age ? `${dto.age} years old` : "",
    dto.ethnicity ? dto.ethnicity.toLowerCase() : "",
    dto.hairColor ? `${dto.hairColor.toLowerCase()} hair` : "",
    dto.hairStyle ? `${dto.hairStyle.toLowerCase()} hairstyle` : "",
    dto.eyeColor ? `${dto.eyeColor.toLowerCase()} eyes` : "",
    dto.bodyType ? `${dto.bodyType.toLowerCase()} body` : "",
    "beautiful, high quality, detailed, portrait",
  ].filter(Boolean);
  return parts.join(", ");
}
