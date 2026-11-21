"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MaharashtraCropMatrix, type CropId } from "@/config/cropMatrix";
import { cropLabel, t } from "@/config/i18n";
import { CropAdvisorCard } from "@/components/dashboard/CropAdvisorCard";
import { CropCheckoutSheet, type PlotDraft } from "@/components/crops/CropCheckoutSheet";
import { LandBar } from "@/components/ui/LandBar";
import { ToastHost, type Toast } from "@/components/ui/ToastHost";
import { allocatePlotsByGunthas } from "@/lib/domain/allocation";
import { pickNextDefaultPlotName, resolvePresetGunthas } from "@/lib/domain/checkout";
import { formatArea, displayPlotName } from "@/lib/domain/landUnits";
import { useBalramStore } from "@/store/useBalramStore";
import { CropAllocationsSchema, growthToLifecycleStage, type CropAllocation } from "@/types/domain";

const cropIds = Object.keys(MaharashtraCropMatrix) as CropId[];

export function PortfolioCard() {
  const state = useBalramStore((s) => s);
  const text = t(state.locale);
  const allocations = state.cropAllocations;
  const totalArea = state.fieldGeometry?.areaSquareMetres ?? null;
  const derived = useMemo(() => allocatePlotsByGunthas(allocations, totalArea), [allocations, totalArea]);
  const [draftLines, setDraftLines] = useState<PlotDraft[]>([]);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [highlighted, setHighlighted] = useState<readonly string[]>([]);
  const eventId = useRef(0);
  const latestState = useRef(state);
  const opener = useRef<HTMLElement | null>(null);
  const plotsTitle = useRef<HTMLHeadingElement>(null);
  const plotRows = useRef(new Map<string, HTMLDetailsElement>());
  const writable = state.hydrated && !state.sampleDataActive;

  // A current backup can still contain plots without IDs. Give those entries
  // checkout identities without writing anything until the farmer saves.
  const checkoutAllocations = useMemo(() => {
    const used = new Set(allocations.flatMap(plot => plot.plotId ? [plot.plotId] : []));
    return allocations.map((plot, index) => {
      if (plot.plotId) return plot;
      let id = `legacy-plot-${index + 1}`;
      while (used.has(id)) id += "-x";
      used.add(id);
      return { ...plot, plotId: id };
    });
  }, [allocations]);

  const editedIds = new Set(draftLines.map(line => line.editingPlotId));
  const retainedGunthas = derived.plots.reduce((sum, plot, index) =>
    sum + (editedIds.has(checkoutAllocations[index].plotId) ? 0 : plot.areaGunthas ?? 0), 0);
  const draftGunthas = draftLines.reduce((sum, line) => sum + line.areaGunthas, 0);
  const freeGunthas = derived.totalFarmGunthas === null ? null
    : Math.max(0, derived.totalFarmGunthas - retainedGunthas - draftGunthas);

  useEffect(() => { latestState.current = state; }, [state]);

  useEffect(() => {
    if (highlighted.length === 0) return;
    const timer = window.setTimeout(() => setHighlighted([]), 2000);
    return () => window.clearTimeout(timer);
  }, [highlighted]);

  const dismissToast = useCallback((id: Toast["id"]) => {
    setToast(current => current?.id === id ? null : current);
  }, []);

  function open(trigger: HTMLElement) {
    opener.current = trigger;
    setCheckoutOpen(true);
  }

  function restoreFocus() {
    if (opener.current?.isConnected && opener.current.getClientRects().length && !opener.current.matches(":disabled")) {
      opener.current.focus();
    } else {
      plotsTitle.current?.focus();
    }
  }

  function chooseCrop(cropId: CropId, trigger: HTMLElement, alreadyPlanted = false) {
    const existing = draftLines.find(line => line.cropId === cropId && !line.editingPlotId);
    if (!writable) return;
    if (existing && !alreadyPlanted) {
      setDraftLines(lines => lines.filter(line => line !== existing));
      return;
    }
    if (existing) {
      setDraftLines(lines => lines.map(line => line === existing ? { ...line, alreadyPlanted: true, lifecycleStage: null } : line));
    } else {
      if (freeGunthas !== null && freeGunthas < 0.1) return;
      const name = pickNextDefaultPlotName([...allocations.flatMap(plot => plot.plotName ? [plot.plotName] : []), ...draftLines.map(line => line.plotName)]);
      const draftId = `draft-${++eventId.current}`;
      setDraftLines(lines => [...lines, {
        draftId, cropId, plotName: name, alreadyPlanted,
        lifecycleStage: alreadyPlanted ? null : "planned", plantingDate: null,
        areaGunthas: resolvePresetGunthas("half_remaining", 0, freeGunthas),
      }]);
    }
    open(trigger);
  }

  function editPlot(plot: CropAllocation, index: number, trigger: HTMLElement) {
    const plotId = checkoutAllocations[index].plotId;
    if (!writable || !plotId || !cropIds.includes(plot.cropId as CropId)) return;
    if (!draftLines.some(line => line.editingPlotId === plotId)) {
      const stage = plot.lifecycleStage ?? growthToLifecycleStage(plot.growthStage);
      const draftId = `draft-${++eventId.current}`;
      setDraftLines(lines => [...lines, {
        draftId, editingPlotId: plotId, cropId: plot.cropId as CropId,
        plotName: plot.plotName ?? `Plot ${index + 1}`,
        areaGunthas: derived.plots[index].areaGunthas ?? 20,
        alreadyPlanted: stage !== "planned" || plot.plantingDate !== null,
        lifecycleStage: stage, plantingDate: plot.plantingDate,
      }]);
    }
    open(trigger);
  }

  function removePlot(plotId: string) {
    const index = checkoutAllocations.findIndex(plot => plot.plotId === plotId);
    if (!writable || index < 0) return;
    const removed = allocations[index];
    const remaining = allocations.filter((_, position) => position !== index);
    const next = CropAllocationsSchema.safeParse(remaining).success
      ? remaining : checkoutAllocations.filter((_, position) => position !== index);
    state.setCropAllocations(next);
    setDraftLines(lines => lines.filter(line => line.editingPlotId !== plotId));
    setCheckoutOpen(false);
    const fieldId = state.fieldGeometry?.fieldId;
    setToast({
      id: ++eventId.current, variant: "undo",
      message: `${text.plotRemovedNamed} ${displayPlotName(removed.plotName, state.locale, index + 1)}`,
      onAction: () => {
        const current = latestState.current;
        if (!current.hydrated || current.sampleDataActive || current.fieldGeometry?.fieldId !== fieldId) return;
        const restored = [...current.cropAllocations];
        restored.splice(index, 0, removed);
        if (CropAllocationsSchema.safeParse(restored).success) current.setCropAllocations(restored);
        plotsTitle.current?.focus({ preventScroll: true });
      },
    });
  }

  function committed(next: CropAllocation[]) {
    const existingIds = new Set(checkoutAllocations.map(plot => plot.plotId));
    const added = next.filter(plot => plot.plotId && !existingIds.has(plot.plotId));
    const first = added[0];
    setDraftLines([]);
    setCheckoutOpen(false);
    setHighlighted(added.flatMap(plot => plot.plotId ? [plot.plotId] : []));
    const id = ++eventId.current;
    if (!first?.plotId || first.areaGunthas == null) {
      setToast({ id, variant: "info", message: text.plotChangesSaved });
      return;
    }
    const plotId = first.plotId;
    const name = cropLabel(state.locale, first.cropId as CropId);
    const area = formatArea(first.areaGunthas, state.landUnit, state.locale);
    setToast({
      id, variant: "info",
      message: added.length === 1 ? `${name} ${text.cropAdded} · ${area}` : `${added.length} ${text.plotsAdded}`,
      actionLabel: text.viewPlot,
      onAction: () => {
        const row = plotRows.current.get(plotId);
        if (!row?.isConnected) return;
        row.querySelector("summary")?.focus({ preventScroll: true });
        row.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      },
    });
  }

  return (
    <div id="portfolio" className="space-y-5">
      <LandBar totalGunthas={derived.totalFarmGunthas} allocatedGunthas={derived.allocatedGunthas} unit={state.landUnit} locale={state.locale} />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,370px)]">
        <div className="min-w-0 space-y-5">
          <section className="bento-card">
            <h2 ref={plotsTitle} tabIndex={-1} className="text-2xl font-bold leading-heading">{text.yourPlots}</h2>
            {state.sampleDataActive && <p className="notice mt-3 text-sm leading-body">{text.sampleReadOnly}</p>}
            {allocations.length === 0 ? <p className="mt-2 text-sm leading-body">{text.noPlotsYet}</p> :
              <ul className="mt-3 space-y-2">
                {allocations.map((plot, index) => {
                  const plotId = checkoutAllocations[index].plotId!;
                  const area = derived.plots[index].areaGunthas;
                  const crop = cropLabel(state.locale, plot.cropId as CropId) ?? text.crop;
                  const stage = plot.lifecycleStage ?? growthToLifecycleStage(plot.growthStage);
                  return (
                    <li key={plotId}>
                      <details ref={node => { if (node) plotRows.current.set(plotId, node); else plotRows.current.delete(plotId); }}
                        className={`scroll-mt-4 rounded-xl border ${highlighted.includes(plotId) ? "border-forest bg-success-subtle" : "border-forest/15"}`}>
                        <summary className="min-h-12 px-3 text-ink leading-body">
                          <span className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2">
                            <span className="min-w-0 break-words">
                              <span className="block font-bold">{displayPlotName(plot.plotName, state.locale, index + 1)}</span>
                              <span className="block font-normal">{crop} · {area === null ? text.landBar.unknown : formatArea(area, state.landUnit, state.locale)}</span>
                            </span>
                            <span className="rounded-full bg-surface-muted px-2 py-1 text-sm leading-body">{text.stageNames[stage]}</span>
                          </span>
                        </summary>
                        <div className="px-3 pb-3">
                          <button type="button" className="button-secondary" disabled={!writable || !cropIds.includes(plot.cropId as CropId)}
                            onClick={event => editPlot(plot, index, event.currentTarget)}>{text.editPlot}</button>
                        </div>
                      </details>
                    </li>
                  );
                })}
              </ul>}
          </section>
          <section aria-labelledby="planted-crops-title" className="rounded-xl border border-forest/15 bg-white p-3">
            <h2 id="planted-crops-title" className="mb-2 text-base font-bold leading-body">{text.alreadyPlantedQuestion}</h2>
            <div className="flex flex-wrap gap-2">
              {cropIds.map(cropId => (
                <button key={cropId} type="button" className="min-h-12 min-w-12 rounded-full border border-border-strong px-3 text-sm leading-body"
                  disabled={!writable} aria-disabled={!writable || (freeGunthas !== null && freeGunthas < 0.1 && !draftLines.some(line => line.cropId === cropId && !line.editingPlotId))}
                  onClick={event => chooseCrop(cropId, event.currentTarget, true)}>
                  {cropLabel(state.locale, cropId)}
                </button>
              ))}
            </div>
          </section>
          <CropAdvisorCard selectedCropIds={draftLines.filter(line => !line.editingPlotId).map(line => line.cropId)}
            onToggleCrop={chooseCrop} remainingFreeGunthas={freeGunthas} />
        </div>
        <CropCheckoutSheet lines={draftLines} existingAllocations={checkoutAllocations} totalAreaSquareMetres={totalArea}
          isOpen={checkoutOpen} onOpen={open} onClose={() => setCheckoutOpen(false)} onFocusReturn={restoreFocus}
          onLinesChange={setDraftLines} onRemovePlot={removePlot} onCommitted={committed} />
      </div>
      <ToastHost toast={toast} locale={state.locale} onDismiss={dismissToast} />
    </div>
  );
}
