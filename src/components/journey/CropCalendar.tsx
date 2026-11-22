"use client";

import { useId, useMemo, useState } from "react";
import type { CropId } from "@/config/cropMatrix";
import { cropLabel, t } from "@/config/i18n";
import { CalendarRibbon, type CalendarHalf } from "@/components/viz/CalendarRibbon";
import { VizCaption } from "@/components/viz/VizCaption";
import { VizTable } from "@/components/viz/VizTable";
import { displayPlotName } from "@/lib/domain/landUnits";
import { buildCropCalendar } from "@/lib/domain/viz/calendarLayout";
import { farmRoadmap } from "@/lib/ui/farmRoadmap";
import { useNow } from "@/lib/ui/useNow";
import { useBalramStore } from "@/store/useBalramStore";
import { growthToLifecycleStage } from "@/types/domain";
import { RoadmapList } from "./RoadmapList";

export function CropCalendar({ printStatic = false }: { printStatic?: boolean }) {
  const state = useBalramStore(value => value);
  const { todayIso } = useNow();
  const { locale, sampleDataActive, cropAllocations } = state;
  const [half, setHalf] = useState<CalendarHalf | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const sectionId = useId();
  const actionsId = useId();
  const dictionary = t(locale);
  const text = dictionary.viz.cropCalendar;
  const layout = useMemo(() => buildCropCalendar({ allocations: cropAllocations, todayIso }), [cropAllocations, todayIso]);
  const formatter = useMemo(() => new Intl.DateTimeFormat(locale === "mr" ? "mr-IN" : "en-IN", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  }), [locale]);

  const formatDate = (iso: string) => formatter.format(Date.parse(iso));
  const labels = cropAllocations.map((plot, index) => ({
    key: plot.plotId === undefined ? `legacy:${index}` : `plot:${plot.plotId}`,
    name: displayPlotName(plot.plotName, locale, index + 1),
    crop: Object.hasOwn(dictionary.cropNames, plot.cropId) ? cropLabel(locale, plot.cropId as CropId) : dictionary.crop,
    needsPlantingDate: plot.plantingDate === null,
  }));
  const selectedIndex = printStatic ? -1 : labels.findIndex(label => label.key === selectedKey);
  const selected = cropAllocations[selectedIndex];

  function plotActions() {
    if (!selected) return [];
    if (selected.plotId !== undefined) {
      return farmRoadmap(state).filter(item => item.plotId === selected.plotId);
    }
    // A legacy plot can lack a saved ID. Give it a temporary identity for this view
    // so whole-farm actions and other ID-less plots are excluded from the result.
    let id = "calendar-legacy-plot";
    while (cropAllocations.some(plot => plot.plotId === id)) id += "-";
    const allocations = cropAllocations.map((plot, index) => index === selectedIndex
      ? { ...plot, plotId: id, plotName: displayPlotName(plot.plotName, "en", index + 1) } : plot);
    return farmRoadmap({ ...state, cropAllocations: allocations }).filter(item => item.plotId === id);
  }

  const visibleHalf = half ?? ((layout.todayXPercent ?? 0) >= 50 ? 1 : 0);
  const rows = cropAllocations.map((plot, index) => {
    const harvest = layout.plots[index].harvest;
    return [
      labels[index].name, labels[index].crop, plot.plantingDate ? formatDate(plot.plantingDate) : "—",
      harvest ? formatDate(harvest.date) : "—",
      dictionary.stageNames[plot.lifecycleStage ?? growthToLifecycleStage(plot.growthStage)],
    ];
  });

  return <figure aria-labelledby={sectionId} className="mt-5 min-w-0 space-y-3">
    <h3 id={sectionId} className="text-lg font-bold leading-heading text-forest print:break-after-avoid">{text.title}</h3>
    <CalendarRibbon layout={layout} labels={labels} locale={locale} formatDate={formatDate} half={visibleHalf}
      selectedKey={printStatic ? null : selectedKey} actionsId={actionsId} onHalfChange={setHalf}
      onPlotSelect={key => setSelectedKey(previous => previous === key ? null : key)} printStatic={printStatic} />
    {!printStatic && <section id={actionsId} hidden={!selected} aria-labelledby={`${actionsId}-title`}
      className="rounded-xl border border-forest/20 bg-surface-bg p-3 print:hidden">
      {selected && <>
        <p id={`${actionsId}-title`} className="mb-3 font-bold leading-heading text-forest [overflow-wrap:anywhere]">
          {text.plotActions} · {labels[selectedIndex].name}
        </p>
        <RoadmapList items={plotActions()} locale={locale} />
      </>}
    </section>}
    {rows.length > 0 && <VizTable locale={locale} caption={dictionary.viz.textTwins.calendar}
      columns={[dictionary.plotNameLabel, dictionary.crop, dictionary.plantingDateLabel, text.harvestEstimate, text.activeStage]} rows={rows} />}
    <VizCaption summary={text.caption} provenance={sampleDataActive ? "sample" : "estimated"} locale={locale} />
  </figure>;
}
