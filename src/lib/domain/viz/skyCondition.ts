import { t } from "@/config/i18n";
import { growthToLifecycleStage, LifecycleStageSchema, type CropAllocation, type WeatherSnapshot } from "@/types/domain";
import { HEAVY_RAIN_CAUTION_MM, visualWeatherProvenance } from "./waterRibbon";

const LIGHT_RAIN_MM = 1;
const HOT_MAX_C = 35;
export type SkyCondition = "clear_hot" | "clear_mild" | "partly_cloudy" | "light_rain" | "heavy_rain";

export function deriveSkyCondition({ weatherSnapshot, allocations }: {
  weatherSnapshot: WeatherSnapshot | null;
  allocations: readonly CropAllocation[];
}) {
  const day = weatherSnapshot?.daily[0];
  const tempMin = day?.temperatureMin ?? null;
  const tempMax = day?.temperatureMax ?? null;
  const rainMm = day?.precipitation ?? null;
  const provenance = weatherSnapshot ? visualWeatherProvenance(weatherSnapshot) : "typical_season";

  let condition: SkyCondition = "partly_cloudy";
  if (rainMm !== null && rainMm >= HEAVY_RAIN_CAUTION_MM) condition = "heavy_rain";
  else if (rainMm !== null && rainMm >= LIGHT_RAIN_MM) condition = "light_rain";
  else if (rainMm === 0 && tempMax !== null) condition = tempMax >= HOT_MAX_C ? "clear_hot" : "clear_mild";

  const areas = { planned: 0, vegetative: 0, flowering_fruiting: 0, harvesting: 0 };
  const useGunthas = allocations.every((plot) => plot.areaGunthas != null);
  for (const plot of allocations) {
    const stage = plot.lifecycleStage ?? growthToLifecycleStage(plot.growthStage);
    areas[stage] += useGunthas ? plot.areaGunthas! : plot.percentage;
  }
  const dominantStage = LifecycleStageSchema.options.reduce((largest, stage) =>
    areas[stage] > areas[largest] ? stage : largest);

  const headlineKey = rainMm === null || (rainMm === 0 && tempMax === null) ? "unavailable" : condition;
  const headline = (locale: "en" | "mr") => {
    const { sky, weatherProvenance } = t(locale).viz;
    return headlineKey === "unavailable" ? sky.unavailable : `${weatherProvenance[provenance]} · ${sky[headlineKey]}`;
  };

  return { condition, dominantStage, provenance, tempMin, tempMax, rainMm, headline: { en: headline("en"), mr: headline("mr") } };
}
