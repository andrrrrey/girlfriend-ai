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

/** Поза уже задаёт выражение лица — случайное выражение поверх неё конфликтует. */
export function promptDescribesExpression(prompt: string | null | undefined): boolean {
  return !!prompt && EXPRESSION_IN_PROMPT_RE.test(prompt);
}
