/**
 * @file reply-cleanup.ts
 * @description Очистка ответа модели от служебных фрагментов.
 *
 * Модель иногда повторяет то, что видела в истории или в служебных пометках:
 * подписи медиасообщений («Generated image: img_bikini_…»), «(небольшая задержка
 * перед отправкой)», «[System note: …]». Пользователю это показывать нельзя.
 */

const PATTERNS: RegExp[] = [
  // «Generated image: img_bikini_front_currentstyle» и т.п.
  /generated\s+(image|video|photo)\s*:\s*[^\s,.!?]*/gi,
  // Пометки о задержке/генерации/отправке в скобках
  /[(\[][^()\[\]]*(задержк|отправк|генерац|delay|generat|loading)[^()\[\]]*[)\]]/gi,
  // Эхо служебных пометок
  /\[[^\]]*(system note|reply in|reply only)[^\]]*\]/gi,
];

/**
 * Убирает служебные фрагменты из ответа. Если после очистки текста не осталось —
 * возвращает исходный (лучше странный ответ, чем пустой).
 */
export function cleanAssistantReply(text: string): string {
  let cleaned = text;
  for (const re of PATTERNS) cleaned = cleaned.replace(re, " ");
  cleaned = cleaned
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([,.!?…])/g, "$1")
    .replace(/^[\s,.;:—–-]+/, "")
    .trim();
  return cleaned || text.trim();
}
