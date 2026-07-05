/**
 * Master list of gender labels (Title Case) — the union of all gender options
 * used across character creation, image/video generation and auto-generation.
 * `Female` is the baseline gender and can never be disabled.
 *
 * Admins restrict the available genders via the `ENABLED_GENDERS` AppSetting
 * (a JSON array of Title Case labels from this list).
 */
export const ALL_GENDERS = [
  "Female",
  "Male",
  "Non-binary",
  "Trans Female",
  "Trans Male",
  "Femboy",
] as const;

export type Gender = (typeof ALL_GENDERS)[number];

/**
 * Resolves the admin-configured list of enabled genders from a raw
 * `ENABLED_GENDERS` AppSetting value. Falls back to the full master list when
 * the value is missing/invalid, and always guarantees `Female` is present.
 */
export function resolveEnabledGenders(rawValue?: string | null): string[] {
  let enabled: string[] = [...ALL_GENDERS];
  if (rawValue) {
    try {
      const parsed: unknown = JSON.parse(rawValue);
      if (Array.isArray(parsed) && parsed.length > 0) {
        enabled = ALL_GENDERS.filter((g) => (parsed as string[]).includes(g));
      }
    } catch {
      // fall back to full list
    }
  }
  if (!enabled.includes("Female")) enabled.unshift("Female");
  return enabled;
}
