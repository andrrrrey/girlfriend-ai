import { en } from "./en";
import { ru } from "./ru";
import { de } from "./de";
import { fr } from "./fr";

export type Lang = "en" | "ru" | "de" | "fr";

/** Языки интерфейса в порядке показа в переключателе (название — на самом языке). */
export const LANGUAGES: { code: Lang; name: string }[] = [
  { code: "en", name: "English" },
  { code: "ru", name: "Русский" },
  { code: "de", name: "Deutsch" },
  { code: "fr", name: "Français" },
];

/** All valid translation keys, derived from the English source dictionary. */
export type TKey = keyof typeof en;

export const dictionaries: Record<Lang, Record<TKey, string>> = { en, ru, de, fr };

export function isLang(v: unknown): v is Lang {
  return v === "en" || v === "ru" || v === "de" || v === "fr";
}
