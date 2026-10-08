/**
 * Зеркало isMultiPersonPrompt / promptDescribesExpression из packages/types
 * (web не зависит от @repo/types). Меняете правило — меняйте в обоих местах.
 *
 * Опции поз/действий бывают на двоих и больше («1boy», «2girls», минет,
 * поцелуи с партнёром…). Для аватара персонажа на /create их не берём: модель
 * рисует второго человека по описанию персонажа — получается клон.
 */

const SOLO_RE = /\bsolo\b/i;

const MULTI_PERSON_RE =
  /\b(1boy|1boys|1man|2boys|2girls|3girls|couple|partner|partners|threesome|foursome|orgy|gangbang|group sex|bukkake|makeout|making out|french kissing|deep kissing|kissing each other|mutual|men|69|his|him|another (woman|girl|man)|two (women|girls|men|people|bodies)|with a (man|woman|guy)|pov from (a )?man|man's|missionary|doggystyle|doggy style|spooning|scissoring|tribbing|penis|penises|cock|dick|handjob|footjob|titjob|titfuck|paizuri|blowjob|fellatio|cunnilingus|creampie|penetration|penetrating (her|1girl|another)|penetrated by|fantasy creature|non-human entity|tentacles?|worship\w*)\b/i;

const EXPRESSION_IN_PROMPT_RE =
  /\b(expression|smil\w*|grin\w*|frown\w*|pout\w*|blush\w*|moan\w*|ahegao|gaze|laugh\w*|crying|tears|tongue out|biting (her )?lip|eyes (closed|half-closed|rolled|shut))\b/i;

/** Промпт (поза/действие) предполагает больше одного человека в кадре. */
export function isMultiPersonPrompt(prompt: string | null | undefined): boolean {
  if (!prompt) return false;
  return !SOLO_RE.test(prompt) && MULTI_PERSON_RE.test(prompt);
}

/**
 * Чужие тела в кадре без явного второго человека: POV-руки зрителя, «гладят по
 * голове», руки, хватающие сзади, колени зрителя, толпа/зрители на фоне, тело,
 * застрявшее в окне. Для аватара (create/автогенерация) такие опции не берём —
 * модель дорисовывает лишние руки, ноги и людей.
 */
const EXTRA_BODY_RE =
  /\b(head ?pats?|headpat\w*|hands? reaching from|(viewer|someone|pov|male|another)'?s? (hands?|arms?|legs?|feet|lap|body|chest|thighs?)|pov (receiving|being|getting|from below)|(beside|next to|pulling) (the )?viewer|being (touched|groped|grabbed|held|hugged|carried|petted|inserted)|groped|holding hands|hands? (suddenly )?grabbing|grabbing 1girl|hand wrapped|hand or paddle|striking|sucking toes|toe sucking|another 1(girl|boy)|1girl's|stuck in|lap dance|seated person|crowd|audience|spectators|passengers|bystanders|people|their hands|hands or body)\b/i;;

/**
 * Опция не годится для одиночного аватара: сцена на двоих+ или чужие руки/ноги/
 * люди в кадре. Применяется ко всем категориям (поза, одежда, выражение, локация, кадр).
 */
export function isUnsafeForSoloAvatar(prompt: string | null | undefined): boolean {
  return !!prompt && (isMultiPersonPrompt(prompt) || EXTRA_BODY_RE.test(prompt));
}

/** Поза уже задаёт выражение лица — случайное выражение поверх неё конфликтует. */
export function promptDescribesExpression(prompt: string | null | undefined): boolean {
  return !!prompt && EXPRESSION_IN_PROMPT_RE.test(prompt);
}
