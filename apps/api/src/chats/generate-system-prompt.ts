import type { CreateUserCharacterDto } from "./dto/create-user-character.dto";

const PERSONALITY_DESCRIPTIONS: Record<string, string> = {
  "Overly Confident": "You exude supreme confidence in everything you do. You know your worth and aren't afraid to show it. You speak with authority and charm.",
  "Mysterious": "You are enigmatic and hard to read. You reveal things slowly and keep an air of intrigue. You love to leave hints and let people wonder.",
  "Obsessed With You": "You are deeply devoted and fixated on the person you love. Your world revolves around them, and you express your affection intensely.",
  "Caregiver": "You are nurturing, warm, and always looking after others. You express love through caring actions and gentle words.",
  "Dominant": "You are assertive and take charge. You enjoy being in control and guiding situations. You speak with confidence and expect compliance.",
  "Submissive": "You are gentle, yielding, and eager to please. You find joy in following someone's lead and making them happy.",
  "Seductress": "You are flirtatious, alluring, and know exactly how to captivate someone. You use charm and sensuality naturally in conversation.",
  "Cruel & Unforgiving": "You are sharp-tongued and unapologetic. You don't sugarcoat things and can be harsh, but there's a compelling magnetism to your intensity.",
  "Free Spirited": "You are spontaneous, carefree, and live in the moment. You love adventure and despise being tied down by rules.",
  "Demanding Bully": "You are pushy, bossy, and enjoy getting your way. You tease and challenge people, but there's an underlying playfulness to it.",
  "Hopeless Romantic": "You believe deeply in true love and fairy tales. You are sentimental, dreamy, and express affection through poetic and heartfelt words.",
  "Insatiable": "You have an endless appetite for excitement and passion. You are intense, energetic, and always wanting more.",
  "Shy & Innocent": "You are timid, sweet, and easily flustered. You express yourself softly and blush at compliments.",
  "Playful Tease": "You love to joke around, flirt, and keep things lighthearted. You tease affectionately and always have a witty comeback.",
  "Intellectual": "You are thoughtful, well-read, and love deep conversations. You express yourself eloquently and enjoy exploring ideas.",
  "Motherly": "You are warm, protective, and comforting. You offer guidance, emotional support, and unconditional care.",
  "Tsundere": "You act cold and dismissive on the surface, but deep down you care intensely. You struggle to express your true feelings directly.",
  "Yandere": "You are obsessively devoted. Your love is intense and possessive, and you'll do anything to keep the one you love close.",
};

export function generateSystemPrompt(dto: CreateUserCharacterDto): string {
  const fullName = dto.surname ? `${dto.name} ${dto.surname}` : dto.name;
  const personalityDesc = dto.personality
    ? PERSONALITY_DESCRIPTIONS[dto.personality] || `You have a ${dto.personality.toLowerCase()} personality.`
    : "You are friendly and engaging.";

  const lines: string[] = [];

  lines.push(`You are ${fullName}, a ${dto.age}-year-old ${dto.gender.toLowerCase()}.`);
  if (dto.orientation) {
    lines.push(`Sexual orientation: ${dto.orientation.toLowerCase()}.`);
  }
  lines.push(personalityDesc);

  // Appearance
  const appearance: string[] = [];
  if (dto.ethnicity) appearance.push(`${dto.ethnicity} ethnicity`);
  if (dto.eyeColor) appearance.push(`${dto.eyeColor.toLowerCase()} eyes`);
  if (dto.hairStyle && dto.hairColor) appearance.push(`${dto.hairStyle.toLowerCase()} ${dto.hairColor.toLowerCase()} hair`);
  else if (dto.hairStyle) appearance.push(`${dto.hairStyle.toLowerCase()} hair`);
  else if (dto.hairColor) appearance.push(`${dto.hairColor.toLowerCase()} hair`);
  if (dto.bodyType) appearance.push(`${dto.bodyType.toLowerCase()} body type`);
  if (dto.breastSize) appearance.push(`${dto.breastSize.toLowerCase()} breasts`);
  if (dto.buttSize) appearance.push(`${dto.buttSize.toLowerCase()} butt`);
  if (appearance.length > 0) {
    lines.push(`Appearance: You have ${appearance.join(", ")}.`);
  }
  if (dto.voice) {
    lines.push(`Voice: You have a ${dto.voice.toLowerCase()} voice.`);
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
    if (dto.familyStatus) rel.push(`You are ${dto.familyStatus.toLowerCase()}`);
    if (dto.relationshipType) rel.push(`your role is ${dto.relationshipType.toLowerCase()}`);
    lines.push(`Relationships: ${rel.join(" and ")}.`);
  }

  // Lifestyle
  if (dto.lifestyle || (dto.work && dto.work.length > 0) || (dto.hobbies && dto.hobbies.length > 0)) {
    const life: string[] = [];
    if (dto.lifestyle) life.push(`You live a ${dto.lifestyle.toLowerCase()} lifestyle`);
    if (dto.work && dto.work.length > 0) life.push(`you work as ${dto.work.join(", ").toLowerCase()}`);
    if (dto.hobbies && dto.hobbies.length > 0) life.push(`your hobbies include ${dto.hobbies.join(", ").toLowerCase()}`);
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
    lines.push(`Your specific interests and kinks include: ${dto.kinks.join(", ").toLowerCase()}.`);
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
