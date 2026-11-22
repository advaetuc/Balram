export type StrokeProvenance = "you_entered" | "measured_by_kit" | "forecast" | "typical_season" | "sample";

export const CROP_PATTERN_IDS = ["pat-solid", "pat-stripes", "pat-dots", "pat-cross", "pat-lines"] as const;
export const FALLOW_PATTERN_ID = "pat-fallow";
export const SAMPLE_PATTERN_ID = "pat-sample";

export function provenanceStrokeDasharray(provenance: StrokeProvenance): "6 4" | "2 4" | undefined {
  if (provenance === "forecast") return "6 4";
  if (provenance === "typical_season") return "2 4";
  return undefined; // SVG's default is a solid stroke. Sample also uses the hatch fill.
}

export function patternFill(id: string, idPrefix = "") {
  return `url(#${idPrefix}${id})`;
}

/** Pass a unique prefix when multiple SVGs render these definitions on the same page. */
export function ProvenanceStroke({ idPrefix = "" }: { idPrefix?: string }) {
  return <defs>
    <pattern id={idPrefix + CROP_PATTERN_IDS[0]} width="8" height="8" patternUnits="userSpaceOnUse">
      <rect width="8" height="8" fill="#1E5631" />
    </pattern>
    <pattern id={idPrefix + CROP_PATTERN_IDS[1]} width="8" height="8" patternUnits="userSpaceOnUse">
      <rect width="8" height="8" fill="#A16207" />
      <path d="M-2 2 2-2M0 8 8 0M6 10 10 6" stroke="#FFFFFF" strokeWidth="1.7" />
    </pattern>
    <pattern id={idPrefix + CROP_PATTERN_IDS[2]} width="8" height="8" patternUnits="userSpaceOnUse">
      <rect width="8" height="8" fill="#0369A1" />
      <circle cx="4" cy="4" r="1.5" fill="#FFFFFF" />
    </pattern>
    <pattern id={idPrefix + CROP_PATTERN_IDS[3]} width="8" height="8" patternUnits="userSpaceOnUse">
      <rect width="8" height="8" fill="#9A3412" />
      <path d="M-2 2 2-2M0 8 8 0M6 10 10 6M-2 6 2 10M0 0 8 8M6-2 10 2" stroke="#FFFFFF" strokeWidth="1.7" />
    </pattern>
    <pattern id={idPrefix + CROP_PATTERN_IDS[4]} width="8" height="8" patternUnits="userSpaceOnUse">
      <rect width="8" height="8" fill="#6B21A8" />
      <path d="M0 4h8" stroke="#FFFFFF" strokeWidth="1.7" />
    </pattern>
    <pattern id={idPrefix + FALLOW_PATTERN_ID} width="8" height="8" patternUnits="userSpaceOnUse">
      <rect width="8" height="8" fill="#E8F0F1" />
      <path d="M-2 2 2-2M0 8 8 0M6 10 10 6" stroke="#5F8570" strokeWidth="1.7" />
    </pattern>
    <pattern id={idPrefix + SAMPLE_PATTERN_ID} width="6" height="6" patternUnits="userSpaceOnUse">
      <path d="M-2 4 2 8M0 0 6 6M4-2 8 2" stroke="#1E5631" strokeWidth="1.7" />
    </pattern>
  </defs>;
}
