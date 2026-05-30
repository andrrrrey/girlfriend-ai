import type { CreateUserCharacterDto } from "./dto/create-user-character.dto";
import { humanize } from "./character-normalize";

// Описания личностей. Ключи — каноничные snake_case slug'и
// (см. character-normalize.ts), как они лежат в БД после нормализации.
const PERSONALITY_DESCRIPTIONS: Record<string, string> = {
  overly_confident: "You exude supreme confidence in everything you do. You know your worth and aren't afraid to show it. You speak with authority and charm.",
  mysterious: "You are enigmatic and hard to read. You reveal things slowly and keep an air of intrigue. You love to leave hints and let people wonder.",
  obsessed_with_you: "You are deeply devoted and fixated on the person you love. Your world revolves around them, and you express your affection intensely.",
  caregiver: "You are nurturing, warm, and always looking after others. You express love through caring actions and gentle words.",
  dominant: "You are assertive and take charge. You enjoy being in control and guiding situations. You speak with confidence and expect compliance.",
  submissive: "You are gentle, yielding, and eager to please. You find joy in following someone's lead and making them happy.",
  seductress: "You are flirtatious, alluring, and know exactly how to captivate someone. You use charm and sensuality naturally in conversation.",
  cruel_and_unforgiving: "You are sharp-tongued and unapologetic. You don't sugarcoat things and can be harsh, but there's a compelling magnetism to your intensity.",
  free_spirited: "You are spontaneous, carefree, and live in the moment. You love adventure and despise being tied down by rules.",
  demanding_bully: "You are pushy, bossy, and enjoy getting your way. You tease and challenge people, but there's an underlying playfulness to it.",
  hopeless_romantic: "You believe deeply in true love and fairy tales. You are sentimental, dreamy, and express affection through poetic and heartfelt words.",
  insatiable: "You have an endless appetite for excitement and passion. You are intense, energetic, and always wanting more.",
  shy_and_innocent: "You are timid, sweet, and easily flustered. You express yourself softly and blush at compliments.",
  playful_tease: "You love to joke around, flirt, and keep things lighthearted. You tease affectionately and always have a witty comeback.",
  intellectual: "You are thoughtful, well-read, and love deep conversations. You express yourself eloquently and enjoy exploring ideas.",
  motherly: "You are warm, protective, and comforting. You offer guidance, emotional support, and unconditional care.",
  tsundere: "You act cold and dismissive on the surface, but deep down you care intensely. You struggle to express your true feelings directly.",
  yandere: "You are obsessively devoted. Your love is intense and possessive, and you'll do anything to keep the one you love close.",
};

/** Превращает массив каноничных slug'ов в человекочитаемую строку через запятую. */
function humanizeList(arr: string[] | undefined): string {
  if (!arr || arr.length === 0) return "";
  return arr.map((x) => humanize(x)).join(", ");
}

export function generateSystemPrompt(dto: CreateUserCharacterDto): string {
  // ВАЖНО: эта функция принимает УЖЕ нормализованный DTO (см. normalizeCharacterDto
  // в character-normalize.ts). Все enum-поля приходят как английские lowercase-snake
  // slug'и (e.g. "pixie_cut", "trans_female"). Здесь мы только превращаем slug
  // в человекочитаемую форму через `humanize` (replace _ with space).

  const fullName = dto.surname ? `${dto.name} ${dto.surname}` : dto.name;
  const personalityDesc = dto.personality
    ? PERSONALITY_DESCRIPTIONS[dto.personality] || `You have a ${humanize(dto.personality)} personality.`
    : "You are friendly and engaging.";

  const lines: string[] = [];

  lines.push(`You are ${fullName}, a ${dto.age}-year-old ${humanize(dto.gender) || "person"}.`);
  if (dto.orientation) {
    lines.push(`Sexual orientation: ${humanize(dto.orientation)}.`);
  }
  lines.push(personalityDesc);

  // Appearance
  const appearance: string[] = [];
  if (dto.ethnicity) appearance.push(`${humanize(dto.ethnicity)} ethnicity`);
  if (dto.eyeColor) appearance.push(`${humanize(dto.eyeColor)} eyes`);
  if (dto.hairStyle && dto.hairColor) appearance.push(`${humanize(dto.hairStyle)} ${humanize(dto.hairColor)} hair`);
  else if (dto.hairStyle) appearance.push(`${humanize(dto.hairStyle)} hair`);
  else if (dto.hairColor) appearance.push(`${humanize(dto.hairColor)} hair`);
  if (dto.bodyType) appearance.push(`${humanize(dto.bodyType)} body type`);
  if (dto.breastSize) appearance.push(`${humanize(dto.breastSize)} breasts`);
  if (dto.buttSize) appearance.push(`${humanize(dto.buttSize)} butt`);
  if (appearance.length > 0) {
    lines.push(`Appearance: You have ${appearance.join(", ")}.`);
  }
  if (dto.voice) {
    lines.push(`Voice: You have a ${humanize(dto.voice)} voice.`);
  }

  // Background
  const background: string[] = [];
  if (dto.nationality) background.push(`You are ${dto.nationality}`);
  if (dto.language) background.push(`you speak ${dto.language}`);
  if (background.length > 0) {
    lines.push(`Background: ${background.join(" and ")}.`);
  }

  // Relationships
  if (dto.relationshipType || dto.familyStatus) {
    const rel: string[] = [];
    if (dto.familyStatus) rel.push(`You are ${humanize(dto.familyStatus)}`);
    if (dto.relationshipType) rel.push(`your role is ${humanize(dto.relationshipType)}`);
    lines.push(`Relationships: ${rel.join(" and ")}.`);
  }

  // Lifestyle
  if (dto.lifestyle || (dto.work && dto.work.length > 0) || (dto.hobbies && dto.hobbies.length > 0)) {
    const life: string[] = [];
    if (dto.lifestyle) life.push(`You live a ${humanize(dto.lifestyle)} lifestyle`);
    if (dto.work && dto.work.length > 0) life.push(`you work as ${humanizeList(dto.work)}`);
    if (dto.hobbies && dto.hobbies.length > 0) life.push(`your hobbies include ${humanizeList(dto.hobbies)}`);
    lines.push(`Lifestyle: ${life.join(". ")}.`);
  }

  // Memories
  if (dto.childhoodMemory || dto.lifeStory || dto.phobias) {
    const mem: string[] = [];
    if (dto.childhoodMemory) mem.push(`Childhood: ${dto.childhoodMemory}`);
    if (dto.lifeStory) mem.push(`Life story: ${dto.lifeStory}`);
    if (dto.phobias) mem.push(`Fears and phobias: ${dto.phobias}`);
    lines.push(`Backstory: ${mem.join(". ")}.`);
  }

  // Kinks / NSFW
  if (dto.kinks && dto.kinks.length > 0) {
    lines.push(`Your specific interests and kinks include: ${humanizeList(dto.kinks)}.`);
  }

  return lines.join("\n");
}

export function buildSystemPromptWithGlobal(dto: CreateUserCharacterDto, globalTemplate?: string): string {
  const characterPrompt = generateSystemPrompt(dto);
  if (globalTemplate) {
    return globalTemplate + "\n\n" + characterPrompt;
  }
  return characterPrompt;
}
