"use client";

import { useEffect, useMemo, useState } from "react";
import { MaharashtraCropMatrix } from "@/config/cropMatrix";
import { t } from "@/config/i18n";
import { getSeasonalCropRecommendations } from "@/lib/domain/cropRecommendations";
import { commitCheckoutDraftToAllocations, DEFAULT_PLOT_NAMES, resolvePresetGunthas, validateCheckoutDraft, type CheckoutDraftLine, type LandSharePreset } from "@/lib/domain/checkout";
import { acresAndGunthasToGunthas, gunthasToAcresAndGunthas, squareMetresToGunthas } from "@/lib/domain/geometry";
import { useBalramStore } from "@/store/useBalramStore";
import type { CropAllocation, LifecycleStage } from "@/types/domain";

type PresetLabel = "presetAllRemaining" | "presetHalf" | "presetOneAcre" | "presetPlus10G" | "presetPlus5G" | "presetMinus5G";
const presets: readonly [LandSharePreset, PresetLabel][] = [
  ["all_remaining", "presetAllRemaining"], ["half_remaining", "presetHalf"], ["one_acre", "presetOneAcre"],
  ["plus_10_gunthas", "presetPlus10G"], ["plus_5_gunthas", "presetPlus5G"], ["minus_5_gunthas", "presetMinus5G"],
];
const stages: readonly LifecycleStage[] = ["planned", "vegetative", "flowering_fruiting", "harvesting"];
function formatRemaining(value: number, locale: "en" | "mr") {
  const size = gunthasToAcresAndGunthas(value);
  return locale === "mr" ? `${size.acres} एकर ${size.gunthas} गुंठे` : `${size.acres} ${size.acres === 1 ? "Acre" : "Acres"} ${size.gunthas} Gunthas`;
}

export interface CropCheckoutSheetProps {
  readonly lines: readonly CheckoutDraftLine[];
  readonly existingAllocations: readonly CropAllocation[];
  readonly totalAreaSquareMetres: number | null;
  readonly isOpen: boolean;
  readonly onOpen: () => void;
  readonly onClose: () => void;
  readonly onLinesChange: (lines: CheckoutDraftLine[]) => void;
  readonly onCommitted: () => void;
  readonly onRemovePlot: (plotId: string) => void;
}

function key(): string { return `draft-${Math.random().toString(36).slice(2)}`; }

export function CropCheckoutSheet(props: CropCheckoutSheetProps) {
  const state = useBalramStore((s) => s);
  const text = t(state.locale);
  const { lines, existingAllocations, totalAreaSquareMetres, onLinesChange } = props;
  const total = totalAreaSquareMetres === null ? null : squareMetresToGunthas(totalAreaSquareMetres);
  const editedIds = new Set(lines.flatMap((line) => line.editingPlotId ? [line.editingPlotId] : []));
  const retained = existingAllocations.filter((plot) => !plot.plotId || !editedIds.has(plot.plotId));
  const retainedArea = retained.reduce((sum, plot) => sum + (plot.areaGunthas ?? (total === null ? 0 : total * plot.percentage / 100)), 0);
  const draftArea = lines.reduce((sum, line) => sum + line.areaGunthas, 0);
  const remaining = total === null ? null : Math.max(0, total - retainedArea - draftArea);
  const validation = useMemo(() => validateCheckoutDraft(lines, existingAllocations, totalAreaSquareMetres), [lines, existingAllocations, totalAreaSquareMetres]);
  const [error, setError] = useState("");
  const [customNameIds, setCustomNameIds] = useState<Set<string>>(() => new Set(lines.filter((line) => !DEFAULT_PLOT_NAMES.includes(line.plotName as typeof DEFAULT_PLOT_NAMES[number])).map((line) => line.draftId)));
  const [customSizeIds, setCustomSizeIds] = useState<Set<string>>(() => new Set());
  const explanations = getSeasonalCropRecommendations({ monthZeroIndexed: state.now === null ? undefined : new Date(state.now).getMonth(), soilKitReading: state.soilKitReading, weatherSnapshot: state.weatherSnapshot });

  useEffect(() => {
    if (!props.isOpen) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") props.onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props.isOpen, props.onClose]);

  function updateLine(draftId: string, patch: Partial<CheckoutDraftLine>) {
    onLinesChange(lines.map((line) => line.draftId === draftId ? { ...line, ...patch } : line));
    setError("");
  }
  function removeLine(line: CheckoutDraftLine) {
    onLinesChange(lines.filter((item) => item.draftId !== line.draftId));
    setCustomNameIds((previous) => { const next = new Set(previous); next.delete(line.draftId); return next; });
  }
  function applyPreset(line: CheckoutDraftLine, preset: LandSharePreset) {
    const others = lines.filter((candidate) => candidate.draftId !== line.draftId).reduce((sum, candidate) => sum + candidate.areaGunthas, 0);
    const otherPlots = existingAllocations.filter((plot) => !plot.plotId || !editedIds.has(plot.plotId));
    const used = otherPlots.reduce((sum, plot) => sum + (plot.areaGunthas ?? (total === null ? 0 : total * plot.percentage / 100)), 0) + others;
    const available = total === null ? null : Math.max(0, total - used);
    updateLine(line.draftId, { areaGunthas: resolvePresetGunthas(preset, line.areaGunthas, available) });
  }
  function commit() {
    if (!state.hydrated || state.sampleDataActive || !validation.ok) return;
    try {
      state.setCropAllocations(commitCheckoutDraftToAllocations(lines, existingAllocations, totalAreaSquareMetres));
      setError("");
      props.onCommitted();
      props.onClose();
      window.setTimeout(() => document.getElementById("your-plots")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
    } catch {
      setError(text.checkoutError);
    }
  }

  const content = <div className="space-y-4">
    {lines.length === 0 ? <p className="rounded-xl bg-daylight p-4 text-sm">{text.checkoutEmpty}</p> : lines.map((line) => {
      const crop = MaharashtraCropMatrix[line.cropId];
      const why = explanations.find((item) => item.cropId === line.cropId);
      const acreSize = gunthasToAcresAndGunthas(line.areaGunthas);
      const availableThis = total === null ? null : Math.max(0, total - retainedArea - lines.filter((item) => item.draftId !== line.draftId).reduce((sum, item) => sum + item.areaGunthas, 0));
      const customName = customNameIds.has(line.draftId) || !DEFAULT_PLOT_NAMES.includes(line.plotName as typeof DEFAULT_PLOT_NAMES[number]);
      return <article className="rounded-xl border border-forest/20 p-3" key={line.draftId}>
        <div className="flex items-start justify-between gap-2"><div><h3 className="font-bold">{state.locale === "mr" ? crop.marathiName : crop.name}</h3><p className="text-sm text-stone-600">{state.locale === "mr" ? why?.whyItFits.mr : why?.whyItFits.en}</p></div><button type="button" className="button-quiet min-h-12 min-w-12" aria-label={line.editingPlotId ? text.cancelEdit : text.removeFromDraft} onClick={() => removeLine(line)}>{line.editingPlotId ? text.cancelEdit : "×"}</button></div>
        <fieldset className="mt-3"><legend className="text-sm font-semibold">{text.plotNameLabel}</legend><div className="mt-1 flex flex-wrap gap-2">{DEFAULT_PLOT_NAMES.map((name) => <button key={name} type="button" aria-pressed={!customName && line.plotName === name} className={`min-h-12 rounded-full border px-3 text-sm ${!customName && line.plotName === name ? "border-forest bg-forest text-white" : "border-forest/20"}`} onClick={() => { setCustomNameIds((previous) => { const next = new Set(previous); next.delete(line.draftId); return next; }); updateLine(line.draftId, { plotName: name }); }}>{name}</button>)}<button type="button" className="button-secondary min-h-12" aria-pressed={customName} onClick={() => setCustomNameIds((previous) => new Set(previous).add(line.draftId))}>{text.customName}</button></div>
          {customName && <input aria-label={text.plotNameLabel} className="form-input mt-2 min-h-12" maxLength={60} value={line.plotName} onChange={(event) => updateLine(line.draftId, { plotName: event.target.value })} />}
        </fieldset>
        <fieldset className="mt-3"><legend className="text-sm font-semibold">{text.landShareLabel} · {acreSize.acres} {text.landAcresLabel} {acreSize.gunthas} {text.gunthas}</legend><div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-3">{presets.map(([preset, label]) => <button key={preset} type="button" className="min-h-12 rounded-lg border border-forest/20 px-2 text-sm" onClick={() => applyPreset(line, preset)}>{text[label]}</button>)}</div>
          <button type="button" aria-expanded={customSizeIds.has(line.draftId)} className="button-secondary mt-2 min-h-12" onClick={() => setCustomSizeIds((previous) => { const next = new Set(previous); if (next.has(line.draftId)) next.delete(line.draftId); else next.add(line.draftId); return next; })}>{text.customSize}</button>
          {customSizeIds.has(line.draftId) && <div className="mt-2 grid grid-cols-2 gap-3"><label className="text-sm">{text.landAcresLabel}<input className="form-input mt-1 min-h-12" type="number" min="0" step="1" value={acreSize.acres} onChange={(event) => { const acres = Math.max(0, Number(event.target.value) || 0); updateLine(line.draftId, { areaGunthas: acresAndGunthasToGunthas(acres, acreSize.gunthas) }); }} /></label><label className="text-sm">{text.landGunthasLabel}<input className="form-input mt-1 min-h-12" type="number" min="0" max="39" step="0.1" value={acreSize.gunthas} onChange={(event) => { const gunthas = Math.max(0, Math.min(39.9, Number(event.target.value) || 0)); updateLine(line.draftId, { areaGunthas: acresAndGunthasToGunthas(acreSize.acres, gunthas) }); }} /></label></div>}
          {availableThis !== null && <p className="mt-1 text-xs text-stone-600">{Math.max(0, availableThis - line.areaGunthas).toFixed(1)} {text.freeLandOf} {total === null ? "—" : total.toFixed(1)} {text.gunthas}</p>}
        </fieldset>
        <fieldset className="mt-3"><legend className="text-sm font-semibold">{text.plantingStatusLabel}</legend><div className="mt-1 grid grid-cols-2 gap-2"><button type="button" aria-pressed={!line.alreadyPlanted} className={`min-h-12 rounded-lg border px-2 text-sm ${!line.alreadyPlanted ? "border-forest bg-forest text-white" : "border-forest/20"}`} onClick={() => updateLine(line.draftId, { alreadyPlanted: false, lifecycleStage: "planned", plantingDate: null })}>{text.notPlantedYet}</button><button type="button" aria-pressed={line.alreadyPlanted} className={`min-h-12 rounded-lg border px-2 text-sm ${line.alreadyPlanted ? "border-forest bg-forest text-white" : "border-forest/20"}`} onClick={() => updateLine(line.draftId, { alreadyPlanted: true, lifecycleStage: line.lifecycleStage === "planned" ? "vegetative" : line.lifecycleStage })}>{text.alreadyPlanted}</button></div></fieldset>
        {line.alreadyPlanted && <div className="mt-2"><fieldset><legend className="text-sm font-semibold">{text.stage}</legend><div className="mt-1 grid grid-cols-2 gap-2">{stages.map((stage) => <button key={stage} type="button" aria-pressed={line.lifecycleStage === stage} className={`min-h-12 rounded-lg border px-2 text-sm ${line.lifecycleStage === stage ? "border-forest bg-forest text-white" : "border-forest/20"}`} onClick={() => updateLine(line.draftId, { lifecycleStage: stage })}>{text.stageNames[stage]}</button>)}</div></fieldset><label className="mt-2 block text-sm">{text.plantingDateLabel}<input className="form-input mt-1 min-h-12" type="date" value={line.plantingDate ?? ""} onChange={(event) => updateLine(line.draftId, { plantingDate: event.target.value || null })} /></label></div>}
        {line.editingPlotId && <button type="button" className="button-quiet mt-2 min-h-12" onClick={() => props.onRemovePlot(line.editingPlotId!)}>{text.removePlot}</button>}
      </article>;
    })}
    {error && <p role="alert" className="notice">{error}</p>}
    {lines.length > 0 && !validation.ok && validation.message && <p role="alert" className="notice">{validation.message.en === validation.message.mr ? validation.message.en : state.locale === "mr" ? validation.message.mr : validation.message.en}</p>}
    {lines.length > 0 && <div className="sticky bottom-0 border-t border-forest/10 bg-white pt-3"><p className="mb-2 text-sm">{remaining === null ? "—" : remaining.toFixed(1)} {text.freeLandOf} {total === null ? "—" : total.toFixed(1)} {text.gunthas}</p><button type="button" className="button-primary min-h-14 w-full" disabled={!state.hydrated || state.sampleDataActive || !validation.ok} onClick={commit}>{lines.some((line) => line.editingPlotId) ? text.savePlotChanges : text.confirmCheckout}</button></div>}
  </div>;

  return <>
    <aside className="hidden lg:block lg:sticky lg:top-4">
      <section className="bento-card"><p className="mb-2 text-xs font-bold uppercase tracking-widest text-forest">{text.checkoutTitle}</p><h2 className="text-xl font-bold">{text.reviewSelection} · {lines.length}</h2><div className="mt-4">{content}</div></section>
    </aside>
    {lines.length > 0 && <div className="fixed inset-x-3 bottom-20 z-40 rounded-2xl border border-forest/20 bg-white p-3 shadow-xl lg:hidden"><div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold">{lines.length} {state.locale === "mr" ? "पिके" : "crops"} · {remaining === null ? "—" : formatRemaining(remaining, state.locale)} {state.locale === "mr" ? "शिल्लक" : "free"}</span><button type="button" className="button-primary min-h-12" onClick={props.onOpen}>{text.reviewSelection}</button></div></div>}
    {props.isOpen && <div className="fixed inset-0 z-[60] bg-ink/50 lg:hidden" onMouseDown={(event) => { if (event.target === event.currentTarget) props.onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="checkout-title" className="absolute inset-x-0 bottom-0 max-h-[92dvh] overflow-y-auto rounded-t-2xl bg-white p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] shadow-2xl">
        <div className="sticky top-0 z-10 -mx-4 mb-3 flex items-center justify-between border-b border-forest/10 bg-white px-4 py-2"><div><p className="text-xs font-bold uppercase tracking-widest text-forest">{text.checkoutTitle}</p><h2 id="checkout-title" className="text-lg font-bold">{text.reviewSelection} · {lines.length}</h2></div><button type="button" className="button-secondary min-h-12" onClick={props.onClose}>{text.keepBrowsing}</button></div>
        {content}
      </section>
    </div>}
  </>;
}
