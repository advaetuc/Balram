import { z } from "zod";
import { LandUnitSchema, type LandUnit, type Locale } from "@/types/domain";
import { GUNTHAS_PER_ACRE } from "./areaConversion";

export { LandUnitSchema };
export type { LandUnit };

export const AREA_EPSILON_GUNTHAS = 0.01;
export const MAX_AREA_GUNTHAS = 400_000;
export const MR_NUMERALS: "latn" | "deva" = "latn";

function normalizeDisplayGunthas(gunthas: number): number {
  if (!Number.isFinite(gunthas)) throw new RangeError("Land area must be finite.");
  if (Math.abs(gunthas) < AREA_EPSILON_GUNTHAS) return 0;
  const nearestAcre = Math.round(gunthas / GUNTHAS_PER_ACRE) * GUNTHAS_PER_ACRE;
  return Math.abs(gunthas - nearestAcre) <= 0.025 ? Math.round(gunthas) : gunthas;
}

export function gunthasToUnitValue(gunthas: number, unit: LandUnit): number {
  const normalized = normalizeDisplayGunthas(gunthas);
  if (unit === "acres") {
    return Math.round((normalized / GUNTHAS_PER_ACRE) * 100 + Number.EPSILON) / 100;
  }
  return Math.round(normalized * 10 + Number.EPSILON) / 10;
}

export function unitValueToGunthas(value: number, unit: LandUnit): number {
  const parsed = z.number().finite().parse(value);
  const rawGunthas = unit === "acres" ? parsed * GUNTHAS_PER_ACRE : parsed;
  return Math.round(rawGunthas * 100) / 100;
}

/** Deterministic Indian digit grouping without locale-dependent Intl behavior. */
export function formatIndianNumber(value: number, maxFractionDigits = 2): string {
  if (!Number.isFinite(value)) throw new RangeError("A finite number is required for display.");
  if (!Number.isInteger(maxFractionDigits) || maxFractionDigits < 0 || maxFractionDigits > 20) {
    throw new RangeError("Fraction digits must be an integer from 0 to 20.");
  }
  const scale = 10 ** maxFractionDigits;
  const rounded = Math.round((Math.abs(value) + Number.EPSILON) * scale) / scale;
  const [rawInteger = "0", rawFraction = ""] = rounded.toFixed(maxFractionDigits).split(".");
  const integer = rawInteger.length <= 3
    ? rawInteger
    : `${rawInteger.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${rawInteger.slice(-3)}`;
  const fraction = rawFraction.replace(/0+$/, "");
  return `${value < 0 ? "-" : ""}${integer}${fraction ? `.${fraction}` : ""}`;
}

export function unitNoun(value: number, unit: LandUnit, locale: Locale): string {
  if (locale === "mr") {
    if (unit === "acres") return "एकर";
    return value === 1 ? "गुंठा" : "गुंठे";
  }
  if (unit === "acres") return value === 1 ? "Acre" : "Acres";
  return value === 1 ? "Guntha" : "Gunthas";
}

function formatSingleArea(gunthas: number, unit: LandUnit, locale: Locale): string {
  const value = gunthasToUnitValue(gunthas, unit);
  const digits = unit === "acres" ? 2 : 1;
  return `${formatIndianNumber(value, digits)} ${unitNoun(value, unit, locale)}`;
}

export function formatArea(
  gunthas: number,
  unit: LandUnit,
  locale: Locale,
  options?: { includeSecondary?: boolean },
): string {
  const primary = formatSingleArea(gunthas, unit, locale);
  if (!options?.includeSecondary) return primary;
  const secondaryUnit: LandUnit = unit === "acres" ? "gunthas" : "acres";
  return `${primary} (= ${formatSingleArea(gunthas, secondaryUnit, locale)})`;
}

export type AreaInputResult = { ok: true; gunthas: number } | { ok: false; error: { en: string; mr: string } };

const emptyError = {
  en: "Enter a land area greater than zero.",
  mr: "शून्यापेक्षा जास्त जमीन क्षेत्र भरा.",
};
const numberError = {
  en: "Enter a valid number using digits and one decimal separator.",
  mr: "अंक आणि एक दशांश चिन्ह वापरून योग्य संख्या भरा.",
};
const positiveError = {
  en: "Land area must be greater than zero.",
  mr: "जमिनीचे क्षेत्र शून्यापेक्षा जास्त असावे.",
};
const maximumError = {
  en: "Land area cannot exceed 10,000 Acres (400,000 Gunthas).",
  mr: "जमिनीचे क्षेत्र १०,००० एकर (४,००,००० गुंठे) पेक्षा जास्त असू शकत नाही.",
};

export function parseAreaInput(rawInput: string, unit: LandUnit, _locale: Locale = "en"): AreaInputResult {
  const normalizedDigits = rawInput.replace(/[\u0966-\u096F]/g, (digit) => String(digit.charCodeAt(0) - 0x0966)).trim();
  if (!normalizedDigits) return { ok: false, error: emptyError };
  const commaCount = (normalizedDigits.match(/,/g) ?? []).length;
  const normalized = commaCount === 1 && !normalizedDigits.includes(".")
    ? normalizedDigits.replace(",", ".")
    : normalizedDigits;
  if (!/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return { ok: false, error: numberError };
  const value = Number(normalized);
  if (!Number.isFinite(value)) return { ok: false, error: numberError };
  if (value <= 0) return { ok: false, error: positiveError };
  const gunthas = unitValueToGunthas(value, unit);
  if (gunthas > MAX_AREA_GUNTHAS) return { ok: false, error: maximumError };
  return { ok: true, gunthas };
}

const presetNames: Readonly<Record<string, string>> = {
  "well plot": "विहिरीचा प्लॉट",
  "borewell patch": "बोअरवेल प्लॉट",
  "canal plot": "कालव्याचा प्लॉट",
  "roadside field": "रस्त्यालगतचा प्लॉट",
};

export function displayPlotName(name: string | null | undefined, locale: Locale, fallbackIndex = 1): string {
  const trimmed = name?.trim();
  if (!trimmed) return locale === "mr" ? `प्लॉट ${fallbackIndex}` : `Plot ${fallbackIndex}`;
  if (locale !== "mr") return name!;
  const known = presetNames[trimmed.toLocaleLowerCase("en")];
  if (known) return known;
  const numbered = /^Plot\s+(\d+)$/i.exec(trimmed);
  if (numbered?.[1]) return `प्लॉट ${numbered[1]}`;
  return name!;
}
