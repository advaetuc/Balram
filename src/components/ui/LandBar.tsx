"use client";

import { useId } from "react";
import type { CropId } from "@/config/cropMatrix";
import { cropLabel, t } from "@/config/i18n";
import { ProvenanceBadge } from "@/components/ui/ProvenanceBadge";
import { CROP_PATTERN_IDS, FALLOW_PATTERN_ID, patternFill, ProvenanceStroke } from "@/components/viz/ProvenanceStroke";
import { VizTable } from "@/components/viz/VizTable";
import { displayPlotName, formatArea } from "@/lib/domain/landUnits";
import { barSegments } from "@/lib/domain/viz/barSegments";
import { formatNumber } from "@/lib/ui/format";
import { growthToLifecycleStage, type CropAllocation, type LandUnit, type Locale } from "@/types/domain";

interface LandBarProps {
  totalGunthas: number | null;
  allocatedGunthas: number;
  plots: readonly CropAllocation[];
  selectedPlotId: string | null;
  onSelectPlot: (plotId: string) => void;
  onShowAllPlots: () => void;
  unit: LandUnit;
  locale: Locale;
  sampleDataActive: boolean;
}

export function LandBar({
  totalGunthas, allocatedGunthas, plots, selectedPlotId, onSelectPlot, onShowAllPlots, unit, locale, sampleDataActive,
}: LandBarProps) {
  const dictionary = t(locale);
  const text = dictionary.landBar;
  const prefix = `land-bar-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}-`;
  const { segments, overflowPlotCount, unassignedGunthas } = barSegments(totalGunthas ?? 0, plots);
  const displayArea = (area: number | null) => area === null ? text.unknown : formatArea(area, unit, locale);
  const free = displayArea(totalGunthas === null ? null : unassignedGunthas);
  const labels = plots.map((plot, index) => ({
    id: plot.plotId ?? `legacy:${index}`,
    name: displayPlotName(plot.plotName, locale, index + 1),
    crop: Object.hasOwn(dictionary.cropNames, plot.cropId) ? cropLabel(locale, plot.cropId as CropId) : dictionary.crop,
    stage: dictionary.stageNames[plot.lifecycleStage ?? growthToLifecycleStage(plot.growthStage)],
    area: displayArea(plot.areaGunthas ?? (totalGunthas === null ? null : totalGunthas * (plot.percentage / 100))),
  }));
  const selected = labels.find(label => label.id === selectedPlotId);
  const callout = selected ? `${selected.name} · ${selected.crop} · ${selected.area}` : "";

  return <div lang={locale} className="min-w-0 space-y-3 rounded-xl border border-forest/15 bg-white p-3 text-sm leading-body">
    <div role="status" className={callout ? "font-semibold text-forest [overflow-wrap:anywhere]" : "sr-only"}>{callout}</div>
    <svg width="0" height="0" aria-hidden="true" className="pointer-events-none absolute">
      <ProvenanceStroke idPrefix={prefix} />
    </svg>
    {segments.length ? <div className="-mx-3 overflow-x-auto print:hidden">
      <div role="group" aria-label={text.allocation} className="flex h-14 min-w-[320px] overflow-hidden rounded-lg">
        {segments.map(segment => {
          const width = { width: `${segment.displayWidthPercent}%` };
          if (segment.kind === "fallow") {
            return <div key="fallow" aria-hidden="true" className="relative h-14 shrink-0" style={width}>
              <svg className="absolute inset-0 h-full w-full"><rect width="100%" height="100%" fill={patternFill(FALLOW_PATTERN_ID, prefix)} /></svg>
            </div>;
          }
          const label = labels[segment.plotIndex];
          const pressed = selectedPlotId === label.id;
          return <button key={label.id} type="button" aria-pressed={pressed}
            aria-label={`${label.name} · ${label.crop} · ${label.area}`}
            onClick={() => onSelectPlot(label.id)} style={width}
            className="press relative flex min-h-14 min-w-12 shrink-0 items-center justify-center px-1 focus-visible:z-10 focus-visible:-outline-offset-4 focus-visible:outline-white">
            <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
              <rect width="100%" height="100%" fill={patternFill(CROP_PATTERN_IDS[segment.patternIndex], prefix)} />
            </svg>
            <span aria-hidden="true" className="relative flex min-w-0 flex-col items-center gap-0.5 leading-none text-white">
              <span className="grid size-6 place-items-center rounded-full bg-ink font-bold">{segment.initial[locale]}</span>
              {segment.displayWidthPercent >= 24 && <span className="max-w-full truncate rounded bg-ink px-1 py-0.5 text-xs font-semibold">{label.area}</span>}
            </span>
            {pressed && <span aria-hidden="true" className="pointer-events-none absolute inset-1 rounded border-2 border-white" />}
          </button>;
        })}
      </div>
    </div> : <p className="grid h-14 place-items-center rounded-lg bg-surface-muted px-2 text-center">{text.empty}</p>}
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="font-medium">
        {text.unassigned}: {free} · {text.total}: {displayArea(totalGunthas)} · {text.planned}: {displayArea(allocatedGunthas)}
      </p>
      {sampleDataActive && <ProvenanceBadge locale={locale} provenance="sample" />}
      {overflowPlotCount > 0 && <button type="button" className="button-secondary press min-h-12 rounded-full print:hidden"
        onClick={onShowAllPlots}>{text.morePlots.replace("{0}", formatNumber(overflowPlotCount, 0, locale))}</button>}
    </div>
    <VizTable locale={locale} caption={dictionary.viz.textTwins.land} alwaysReadable
      columns={[dictionary.plotNameLabel, dictionary.crop, dictionary.stage, dictionary.landShareLabel]}
      rows={[...labels.map(label => [label.name, label.crop, label.stage, label.area]), [text.unassigned, "—", "—", free]]} />
  </div>;
}
