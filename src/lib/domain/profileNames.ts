import { MAX_PROFILE_NAME_LENGTH, ProfileMetaSchema, type Locale, type ProfileMeta } from "@/types/domain";

export const defaultProfileName = (locale: Locale) => locale === "mr" ? "माझे शेत" : "My Farm";

export function normalizeProfileName(raw: string): string {
  return raw.normalize("NFKC").trim().replace(/\s+/gu, " ");
}

function graphemes(name: string): string[] {
  return typeof Intl.Segmenter === "function"
    ? Array.from(new Intl.Segmenter("und", { granularity: "grapheme" }).segment(name), ({ segment }) => segment)
    : Array.from(name);
}

export function fitProfileName(name: string, suffix = ""): string {
  const segments = graphemes(name).slice(0, MAX_PROFILE_NAME_LENGTH - graphemes(suffix).length);
  while (segments.length > 0) {
    const candidate = segments.join("").trimEnd() + suffix;
    if (ProfileMetaSchema.shape.name.safeParse(candidate).success) return candidate;
    segments.pop();
  }
  return suffix.trimStart();
}

type ProfileNameValidation =
  | { ok: true; name: string }
  | { ok: false; reason: "empty" | "too_long" | "duplicate" };

export function validateProfileName(
  raw: string, profiles: readonly ProfileMeta[], excludeId?: string,
): ProfileNameValidation {
  const name = normalizeProfileName(raw);
  if (!name) return { ok: false, reason: "empty" };
  if (graphemes(name).length > MAX_PROFILE_NAME_LENGTH || !ProfileMetaSchema.shape.name.safeParse(name).success) {
    return { ok: false, reason: "too_long" };
  }
  if (profiles.some((profile) => profile.id !== excludeId &&
      normalizeProfileName(profile.name).toLowerCase() === name.toLowerCase())) {
    return { ok: false, reason: "duplicate" };
  }
  return { ok: true, name };
}

export function makeUniqueProfileName(base: string, profiles: readonly ProfileMeta[]): string {
  const normalized = normalizeProfileName(base) || defaultProfileName("en");
  const name = fitProfileName(normalized) || defaultProfileName("en");
  if (validateProfileName(name, profiles).ok) return name;
  for (let number = 2; ; number++) {
    const candidate = fitProfileName(name, ` (${number})`);
    if (validateProfileName(candidate, profiles).ok) return candidate;
  }
}
