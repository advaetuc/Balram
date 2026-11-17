"use client";

import { useState } from "react";
import { useBalramStore } from "@/store/useBalramStore";
import { getSeasonalCropRecommendations } from "@/lib/domain/cropRecommendations";
import { MaharashtraCropMatrix, type CropId, type Season } from "@/config/cropMatrix";
import { Card } from "./Card";
import { t } from "@/config/i18n";

interface CropAdvisorCardProps {
  readonly selectedCropIds?: readonly CropId[];
  readonly onToggleCrop?: (cropId: CropId) => void;
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
  const selected = new Set(selectedCropIds);
  const visible = showAll ? recommendations : recommendations.slice(0, 3);

  return <Card id="crop-advisor" title={text.advisor} eyebrow={text.seasonWeather}>
    <label className="text-sm">{state.locale === "mr" ? "लक्ष्य हंगाम" : "Target season"}
      <select className="form-input mt-1 min-h-12" value={season} onChange={(event) => setSeason(event.target.value as "auto" | Season)}>
        <option value="auto">{state.locale === "mr" ? "स्वयंचलित / चालू हंगाम" : "Auto / current season"}</option>
        {(["Kharif", "Rabi", "Zaid", "Perennial"] as const).map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
    </label>
    <div className="my-3 flex flex-wrap gap-2">
      {state.soilKitReading && <span className="data-badge bg-forest/10 text-forest">{state.locale === "mr" ? "माती किटशी जुळवले" : "Matched to soil kit"} · pH {state.soilKitReading.ph}, {state.soilKitReading.nitrogenLevel} N</span>}
      {state.weatherSnapshot && <span className="data-badge bg-sky/10">{state.locale === "mr" ? "हवामान अंदाजाशी जुळवले" : "Matched to forecast"}</span>}
    </div>
    {remainingFreeGunthas !== null && <p className="mb-3 text-sm">{remainingFreeGunthas.toFixed(1)} {text.freeLandOf} {state.fieldGeometry?.areaSquareMetres === null || state.fieldGeometry?.areaSquareMetres === undefined ? "—" : (state.fieldGeometry.areaSquareMetres / 101.17141056).toFixed(1)} {text.gunthas}</p>}
    <div className="space-y-3">
      {visible.map((recommendation) => {
        const crop = MaharashtraCropMatrix[recommendation.cropId];
        const isSelected = selected.has(recommendation.cropId);
        const noSpace = remainingFreeGunthas !== null && remainingFreeGunthas < 0.1;
        const badge = state.locale === "mr" ? recommendation.badgeLabel.mr : recommendation.badgeLabel.en;
        return <article key={recommendation.cropId} className={`rounded-xl border p-3 transition-shadow ${isSelected ? "border-forest bg-forest/5 ring-4 ring-forest" : "border-forest/15"}`}>
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-bold">{state.locale === "mr" ? crop.marathiName : crop.name}</h3>
            <span className={`data-badge shrink-0 ${recommendation.tier === "best_match" ? "bg-forest/10 text-forest" : recommendation.tier === "high_risk" ? "bg-amber/30" : "bg-sky/10"}`}>{badge} · {recommendation.score}%</span>
          </div>
          <p className="text-sm">{crop.season} · {crop.droughtTolerance} {state.locale === "mr" ? "दुष्काळ सहनशीलता" : "drought tolerance"} · {crop.waterBudgetMmPerSeason[0]}–{crop.waterBudgetMmPerSeason[1]} mm {state.locale === "mr" ? "हंगामी पाण्याची गरज" : "seasonal water range"}</p>
          <p className="mt-1 text-sm">{state.locale === "mr" ? recommendation.whyItFits.mr : recommendation.whyItFits.en} {state.locale === "mr" ? recommendation.careNote.mr : recommendation.careNote.en}</p>
          {isSelected && <p className="mt-2 text-sm font-semibold text-forest">{text.selectedCrop}</p>}
          {noSpace && !isSelected && <p className="mt-2 text-sm text-amber-900">{text.noFreeLand}</p>}
          <button type="button" className={`mt-2 min-h-12 w-full ${isSelected ? "button-secondary" : "button-primary"}`} disabled={!onToggleCrop || !state.hydrated || state.sampleDataActive || (noSpace && !isSelected)} onClick={() => onToggleCrop?.(recommendation.cropId)}>
            {isSelected ? text.selectedCrop : noSpace ? text.noFreeLand : text.chooseCrop}
          </button>
        </article>;
      })}
    </div>
    {recommendations.length > 3 && <button type="button" className="button-secondary mt-3 min-h-12 w-full" aria-expanded={showAll} onClick={() => setShowAll(!showAll)}>{showAll ? text.showTopCrops : text.showAllCrops}</button>}
  </Card>;
}
