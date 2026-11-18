"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MaharashtraCropMatrix, type CropId } from "@/config/cropMatrix";
import { t } from "@/config/i18n";
import { CropAdvisorCard } from "@/components/dashboard/CropAdvisorCard";
import { CropCheckoutSheet } from "@/components/crops/CropCheckoutSheet";
import { allocatePlotsByGunthas } from "@/lib/domain/allocation";
import { pickNextDefaultPlotName, resolvePresetGunthas, type CheckoutDraftLine } from "@/lib/domain/checkout";
import { formatArea, displayPlotName } from "@/lib/domain/landUnits";
import { createPlotRemovalSnapshot, restorePlotRemoval, type PlotRemovalSnapshot } from "@/lib/domain/plotUndo";
import { useBalramStore } from "@/store/useBalramStore";
import type { CropAllocation } from "@/types/domain";

export function PortfolioCard() {
  const state = useBalramStore((s) => s);
  const text = t(state.locale);
  const allocations = state.cropAllocations;
  const totalArea = state.fieldGeometry?.areaSquareMetres ?? null;
  const derived = useMemo(() => allocatePlotsByGunthas(allocations, totalArea), [allocations, totalArea]);
  const [draftLines, setDraftLines] = useState<CheckoutDraftLine[]>([]);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [undoSnapshot, setUndoSnapshot] = useState<PlotRemovalSnapshot | null>(null);
  const undoTimer = useRef<number | null>(null);
  const editedIds = new Set(draftLines.flatMap((line) => line.editingPlotId ? [line.editingPlotId] : []));
  const retained = allocations.filter((plot) => !plot.plotId || !editedIds.has(plot.plotId));
  const draftSum = draftLines.reduce((sum, line) => sum + line.areaGunthas, 0);
  const retainedGunthas = retained.reduce((sum, plot) => sum + (plot.areaGunthas ?? (derived.totalFarmGunthas === null ? 0 : derived.totalFarmGunthas * plot.percentage / 100)), 0);
  const freeGunthas = derived.totalFarmGunthas === null ? null : Math.max(0, derived.totalFarmGunthas - retainedGunthas - draftSum);

  useEffect(() => () => { if (undoTimer.current !== null) clearTimeout(undoTimer.current); }, []);

  function toggleCrop(cropId: CropId) {
    const existingLine = draftLines.find((line) => line.cropId === cropId);
    if (existingLine) {
      setDraftLines((lines) => lines.filter((line) => line.draftId !== existingLine.draftId));
      return;
    }
    if (freeGunthas !== null && freeGunthas < 0.1) return;
    const name = pickNextDefaultPlotName([...allocations.flatMap((plot) => plot.plotName ? [plot.plotName] : []), ...draftLines.map((line) => line.plotName)]);
    const id = `draft-${Math.random().toString(36).slice(2)}`;
    setDraftLines((lines) => [...lines, { draftId: id, cropId, plotName: name, areaGunthas: resolvePresetGunthas("half_remaining", 0, freeGunthas), alreadyPlanted: false, lifecycleStage: "planned", plantingDate: null }]);
    setCheckoutOpen(true);
  }

  function removePlot(plotId: string) {
    if (state.sampleDataActive || !state.hydrated) return;
    const snapshot = createPlotRemovalSnapshot(allocations, plotId);
    if (!snapshot) return;
    if (undoTimer.current !== null) clearTimeout(undoTimer.current);
    state.setCropAllocations([...snapshot.remainingAllocations]);
    setDraftLines((lines) => lines.filter((line) => line.editingPlotId !== plotId));
    setCheckoutOpen(false);
    setUndoSnapshot(snapshot);
    const namedPlot = snapshot.removedPlot.plotName ?? text.plotRemovedToast;
    setToast(`${text.plotRemovedNamed} ${namedPlot}`);
    undoTimer.current = window.setTimeout(() => { setUndoSnapshot(null); setToast(""); undoTimer.current = null; }, 10_000);
  }

  function undoRemoval() {
    if (!undoSnapshot || state.sampleDataActive || !state.hydrated) return;
    if (undoTimer.current !== null) clearTimeout(undoTimer.current);
    state.setCropAllocations(restorePlotRemoval(undoSnapshot));
    setUndoSnapshot(null);
    setToast("");
    undoTimer.current = null;
  }

  function editPlot(plot: CropAllocation, index: number) {
    const id = plot.plotId;
    const line: CheckoutDraftLine = {
      draftId: `edit-${id ?? index}-${Math.random().toString(36).slice(2)}`,
      ...(id ? { editingPlotId: id } : {}),
      cropId: plot.cropId as CropId,
      plotName: plot.plotName ?? `Plot ${index + 1}`,
      areaGunthas: plot.areaGunthas ?? (derived.totalFarmGunthas === null ? 20 : derived.totalFarmGunthas * plot.percentage / 100),
      alreadyPlanted: plot.lifecycleStage !== undefined && plot.lifecycleStage !== "planned" || plot.plantingDate !== null,
      lifecycleStage: plot.lifecycleStage ?? "planned",
      plantingDate: plot.plantingDate,
    };
    setDraftLines((lines) => [...lines.filter((item) => item.editingPlotId !== id && item.cropId !== plot.cropId), line]);
    setCheckoutOpen(true);
  }

  return <div id="portfolio" className="space-y-5">
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_370px]">
      <div className="min-w-0 space-y-5">
        <CropAdvisorCard selectedCropIds={draftLines.map((line) => line.cropId)} onToggleCrop={toggleCrop} remainingFreeGunthas={freeGunthas} />
        <section id="your-plots" className="bento-card scroll-mt-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-widest text-forest">{text.allocated}</p>
          <h2 className="text-xl font-bold">{text.yourPlots}</h2>
          {derived.totalFarmGunthas !== null && <div className="my-4 grid gap-2 rounded-xl bg-forest/5 p-3 sm:grid-cols-3">
            <div><b>{text.totalLand}</b><p>{formatArea(derived.totalFarmGunthas, state.landUnit, state.locale)}</p></div>
            <div><b>{text.allocated}</b><p>{formatArea(derived.allocatedGunthas, state.landUnit, state.locale)}</p></div>
            <div><b>{text.fallow}</b><p>{formatArea(Math.max(0, derived.unassignedGunthas ?? 0), state.landUnit, state.locale)}</p></div>
          </div>}
          {derived.totalFarmGunthas === null && <p className="notice my-3">{state.locale === "mr" ? "आधी प्लॉट गुंठ्यांमध्ये नोंदवा. नकाशा काढल्यावर एकूण जमीन दिसेल." : "Add plot sizes in Gunthas. Draw your field boundary to see the total farm area."}</p>}
          {state.sampleDataActive && <p className="notice my-3">{text.sampleReadOnly}</p>}
          {allocations.length === 0 ? <p className="rounded-xl bg-daylight p-4 text-sm">{text.checkoutEmpty}</p> : <ul className="space-y-2">{allocations.map((plot, index) => {
            const crop = MaharashtraCropMatrix[plot.cropId as CropId];
            const size = plot.areaGunthas ?? (derived.totalFarmGunthas === null ? 0 : derived.totalFarmGunthas * plot.percentage / 100);
            const stage = plot.lifecycleStage ?? "planned";
            return <li key={plot.plotId ?? `${plot.cropId}-${index}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-forest/15 p-3">
              <div className="min-w-0"><h3 className="font-bold">{displayPlotName(plot.plotName, state.locale, index + 1)} · {state.locale === "mr" ? crop?.marathiName ?? plot.cropId : crop?.name ?? plot.cropId}</h3><p className="text-sm">{formatArea(size, state.landUnit, state.locale)} · {plot.percentage.toFixed(2)}% · {text.stageNames[stage]}</p></div>
              <div className="flex flex-wrap gap-2"><button type="button" className="button-secondary min-h-12" disabled={!state.hydrated || state.sampleDataActive} onClick={() => editPlot(plot, index)}>{text.editPlot}</button></div>
            </li>;
          })}</ul>}
          <p className="mt-3 text-sm text-stone-600">{state.locale === "mr" ? "प्लॉट बदल Checkout मध्ये तात्पुरते राहतात; जतन केल्यावरच शेत नियोजन बदलते." : "Plot edits stay in checkout until you save them to your farm plan."}</p>
        </section>
        {toast && <div role="status" aria-live="polite" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-forest/20 bg-white p-3 shadow-sm"><span>{toast}</span>{undoSnapshot && <button type="button" className="button-secondary min-h-12" onClick={undoRemoval}>{text.undo}</button>}</div>}
      </div>
      <CropCheckoutSheet lines={draftLines} existingAllocations={allocations} totalAreaSquareMetres={totalArea} isOpen={checkoutOpen} onOpen={() => setCheckoutOpen(true)} onClose={() => setCheckoutOpen(false)} onLinesChange={setDraftLines} onRemovePlot={removePlot} onCommitted={() => { setDraftLines([]); setToast(text.plotAddedToast); window.setTimeout(() => setToast(""), 3500); }} />
    </div>
  </div>;
}
