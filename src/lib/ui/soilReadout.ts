import { t } from "@/config/i18n";
import { SOIL_PRESET_RANGES } from "@/lib/domain/soilChemistry";
import type { Locale, SoilKitReading } from "@/types/domain";
import { formatNumber } from "./format";

export function formatSoilNutrient(value: number, locale: Locale): string {
  if (value === 0) {
    return new Intl.NumberFormat(locale === "mr" ? "mr-IN" : "en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(0);
  }
  return value < 0.01 ? `<${formatNumber(0.01, 2, locale)}` : formatNumber(value, 2, locale);
}

export function describeSoilReadout(reading: SoilKitReading, locale: Locale) {
  const copy = t(locale).soilLab;
  const { moistureLevel, moisturePercent, phosphorusBlueIntensity } = reading;
  const { moistMin, moistMax } = SOIL_PRESET_RANGES.moisture;
  const number = (value: number) => formatNumber(value, 2, locale);
  const band = moistureLevel && moistureLevel !== "untested" ? copy.moisture.levels[moistureLevel] : null;
  const moisture = band && {
    label: copy.moisture.label,
    band,
    result: moisturePercent == null ? band : `${number(moisturePercent)}% · ${band}`,
    threshold: moistureLevel === "dry" ? `< ${number(moistMin)}%`
      : moistureLevel === "wet" ? `> ${number(moistMax)}%` : `${number(moistMin)}–${number(moistMax)}%`,
  };
  const shade = phosphorusBlueIntensity == null ? undefined : copy.blue.swatches[phosphorusBlueIntensity as keyof typeof copy.blue.swatches];
  const blue = phosphorusBlueIntensity != null && shade ? {
    label: copy.blue.scale,
    result: `${number(phosphorusBlueIntensity)}/${number(5)} · ${shade}`,
  } : null;
  return { moisture, blue, optical: Boolean(blue && reading.labCalculation?.tcs3200RawUs) };
}
