/**
 * @file money.ts
 * @description Деньги хранятся в минимальных единицах (центах). Каталог принимает
 * только валюты с двумя знаками после запятой.
 */

const DECIMAL = /^(\d{1,15})(?:\.(\d{1,8}))?$/;

/** "10.5" → 1050. null, если формат неверный или точность больше двух знаков. */
export function toMinor(value: string | number): number | null {
  const match = DECIMAL.exec(String(value).trim());
  if (!match) return null;
  const fraction = match[2] ?? "";
  if (/[^0]/.test(fraction.slice(2))) return null;
  const minor = Number(match[1]) * 100 + Number(fraction.slice(0, 2).padEnd(2, "0"));
  return Number.isSafeInteger(minor) ? minor : null;
}

/** 1050 → "10.50". */
export function fromMinor(minor: number): string {
  const whole = Math.trunc(minor / 100);
  return `${whole}.${String(minor % 100).padStart(2, "0")}`;
}
