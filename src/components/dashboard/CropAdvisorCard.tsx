"use client";

import { useState } from "react";
import { useBalramStore } from "@/store/useBalramStore";
import { getSeasonalCropRecommendations } from "@/lib/domain/cropRecommendations";
import { MaharashtraCropMatrix, type CropId, type Season } from "@/config/cropMatrix";
import { Card } from "./Card";
import { droughtToleranceLabel, seasonLabel, t } from "@/config/i18n";
import { formatArea } from "@/lib/domain/landUnits";
import { squareMetresToGunthas } from "@/lib/domain/geometry";

interface CropAdvisorCardProps {
  readonly selectedCropIds?: readonly CropId[];
  readonly onToggleCrop?: (cropId: CropId, trigger: HTMLElement) => void;
  readonly remainingFreeGunthas?: number | null;
}

export function CropAdvisorCard({ selectedCropIds = [], onToggleCrop, remainingFreeGunthas = null }: CropAdvisorCardProps) {
  const state = useBalramStore((s) => s);
  const text = t(state.locale);
  const [season, setSeason] = useState<"auto" | Season>("auto");
  const [showAll, setShowAll] = useState(false);
  const recommendations = getSeasonalCropRecommendations({
    targetSeason: season === "auto" ? undefined : season,
    monthZeroIndexed: state.now === null ? undefined : new Date(state.now).getMonth(),
    soilKitReading: state.soilKitReading,
    weatherSnapshot: state.weatherSnapshot,
  });
  const added = new Set(state.cropAllocations.map(plot => plot.cropId));
  const selected = new Set(selectedCropIds);
  const topRecommendations = recommendations.slice(0, 3);

  const renderRecommendation = (recommendation: typeof recommendations[number], motionClass = "") => {
    const crop = MaharashtraCropMatrix[recommendation.cropId];
    const isSelected = selected.has(recommendation.cropId);
    const noSpace = remainingFreeGunthas !== null && remainingFreeGunthas < 0.1;
    const badge = state.locale === "mr" ? recommendation.badgeLabel.mr : recommendation.badgeLabel.en;
    return <article key={recommendation.cropId}
      className={`${motionClass} rounded-xl border p-3 transition-colors duration-fast ease-standard ${isSelected ? "border-forest bg-forest/5 ring-4 ring-forest" : "border-forest/15"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-bold">{state.locale === "mr" ? crop.marathiName : crop.name}</h3>
        <span className={`rounded-full px-3 py-1 text-sm font-semibold leading-body ${recommendation.tier === "best_match" ? "bg-forest/10 text-forest" : recommendation.tier === "high_risk" ? "bg-amber/30" : "bg-sky/10"}`}>{badge} · {recommendation.score}%</span>
      </div>
      {added.has(recommendation.cropId) && <span className="check-badge mt-2 inline-flex items-center gap-1 rounded-full bg-success-subtle px-3 py-1 text-sm font-semibold leading-body text-on-success-subtle"><span aria-hidden="true">✓</span>{text.cropAddedBadge}</span>}
      {isSelected && <span className="check-badge mt-2 inline-flex items-center gap-1 rounded-full bg-success-subtle px-3 py-1 text-sm font-semibold leading-body text-on-success-subtle"><span aria-hidden="true">✓</span>{text.selectedCrop}</span>}
      <p className="block text-sm leading-body">{seasonLabel(state.locale, crop.season)} · {droughtToleranceLabel(state.locale, crop.droughtTolerance)} {state.locale === "mr" ? "दुष्काळ सहनशीलता" : "drought tolerance"} · {crop.waterBudgetMmPerSeason[0]}–{crop.waterBudgetMmPerSeason[1]} {state.locale === "mr" ? "मिमी हंगामी पाण्याची गरज" : "mm seasonal water range"}</p>
      <p className="mt-1 text-sm leading-body">{state.locale === "mr" ? recommendation.whyItFits.mr : recommendation.whyItFits.en} {state.locale === "mr" ? recommendation.careNote.mr : recommendation.careNote.en}</p>
      {noSpace && !isSelected && <p className="mt-2 text-sm text-amber-900">{text.noFreeLand}</p>}
      <button type="button" className={`press mt-2 min-h-12 w-full ${isSelected ? "button-secondary" : "button-primary"}`} disabled={!onToggleCrop || !state.hydrated || state.sampleDataActive} aria-disabled={noSpace && !isSelected} aria-pressed={isSelected} onClick={event => onToggleCrop?.(recommendation.cropId, event.currentTarget)}>
        {isSelected ? text.selectedCrop : noSpace ? text.noFreeLand : text.chooseCrop}
      </button>
    </article>;
  };

  return <Card id="crop-advisor" title={text.advisor} eyebrow={text.seasonWeather}>
    <label className="block text-sm leading-body">{state.locale === "mr" ? "लक्ष्य हंगाम" : "Target season"}
      <select className="form-input mt-1 min-h-12" value={season} onChange={(event) => setSeason(event.target.value as "auto" | Season)}>
        <option value="auto">{state.locale === "mr" ? "स्वयंचलित / चालू हंगाम" : "Auto / current season"}</option>
        {(["Kharif", "Rabi", "Zaid", "Perennial"] as const).map((item) => <option key={item} value={item}>{seasonLabel(state.locale, item)}</option>)}
      </select>
    </label>
    <div className="my-3 flex flex-wrap gap-2">
      {state.soilKitReading && <span className="rounded-full px-3 py-1 text-sm font-semibold leading-body bg-forest/10 text-forest">{state.locale === "mr" ? "माती किटशी जुळवले" : "Matched to soil kit"} · pH {state.soilKitReading.ph}</span>}
      {state.weatherSnapshot && <span className="rounded-full px-3 py-1 text-sm font-semibold leading-body bg-sky/10">{state.locale === "mr" ? "हवामान अंदाजाशी जुळवले" : "Matched to forecast"}</span>}
    </div>
    {remainingFreeGunthas !== null && <p className="mb-3 text-sm leading-body">{formatArea(remainingFreeGunthas, state.landUnit, state.locale)} {text.freeLandOf} {state.fieldGeometry?.areaSquareMetres == null ? "—" : formatArea(squareMetresToGunthas(state.fieldGeometry.areaSquareMetres), state.landUnit, state.locale)}</p>}
    <div key={season} className="space-y-3 stagger">
      {topRecommendations.map((recommendation) => renderRecommendation(recommendation))}
    </div>
    {showAll && recommendations.length > 3 && <div className="space-y-3">
      {recommendations.slice(3).map((recommendation) => renderRecommendation(recommendation, "rise-in"))}
    </div>}
    {recommendations.length > 3 && <button type="button" className="button-secondary mt-3 min-h-12 w-full" aria-expanded={showAll} onClick={() => setShowAll(!showAll)}>{showAll ? text.showTopCrops : text.showAllCrops}</button>}
  </Card>;
}
