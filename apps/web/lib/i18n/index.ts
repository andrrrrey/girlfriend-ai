import { en } from "./en";
import { ru } from "./ru";

export type Lang = "en" | "ru";

/** All valid translation keys, derived from the English source dictionary. */
export type TKey = keyof typeof en;

export const dictionaries: Record<Lang, Record<TKey, string>> = { en, ru };
