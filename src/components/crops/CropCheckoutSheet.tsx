"use client";

import { useEffect, useMemo, useState } from "react";
import { MaharashtraCropMatrix } from "@/config/cropMatrix";
import { t } from "@/config/i18n";
import { getSeasonalCropRecommendations } from "@/lib/domain/cropRecommendations";
import { commitCheckoutDraftToAllocations, DEFAULT_PLOT_NAMES, resolvePresetGunthas, validateCheckoutDraft, type CheckoutDraftLine, type LandSharePreset } from "@/lib/domain/checkout";
import { squareMetresToGunthas } from "@/lib/domain/geometry";
import { formatArea, displayPlotName } from "@/lib/domain/landUnits";
import { AreaInput } from "@/components/ui/AreaInput";
import { LandUnitToggle } from "@/components/ui/LandUnitToggle";
import { useBalramStore } from "@/store/useBalramStore";
import type { CropAllocation, LifecycleStage } from "@/types/domain";

type PresetLabel = "presetAllRemaining" | "presetHalf" | "presetOneAcre" | "presetTwentyGunthas" | "presetPlus10G" | "presetPlusQuarterAcre" | "presetPlus5G" | "presetMinus5G" | "presetPlus012Acre" | "presetMinus012Acre";
const stages: readonly LifecycleStage[] = ["planned", "vegetative", "flowering_fruiting", "harvesting"];

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
  const presets: readonly [LandSharePreset, PresetLabel][] = [
    ["all_remaining", "presetAllRemaining"], ["half_remaining", "presetHalf"],
    state.landUnit === "acres" ? ["one_acre", "presetOneAcre"] : ["twenty_gunthas", "presetTwentyGunthas"],
    ["plus_10_gunthas", state.landUnit === "acres" ? "presetPlusQuarterAcre" : "presetPlus10G"],
    ["plus_5_gunthas", state.landUnit === "acres" ? "presetPlus012Acre" : "presetPlus5G"],
    ["minus_5_gunthas", state.landUnit === "acres" ? "presetMinus012Acre" : "presetMinus5G"],
  ];
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
      const availableThis = total === null ? null : Math.max(0, total - retainedArea - lines.filter((item) => item.draftId !== line.draftId).reduce((sum, item) => sum + item.areaGunthas, 0));
      const customName = customNameIds.has(line.draftId) || !DEFAULT_PLOT_NAMES.includes(line.plotName as typeof DEFAULT_PLOT_NAMES[number]);
      return <article className="rounded-xl border border-forest/20 p-3" key={line.draftId}>
        <div className="flex items-start justify-between gap-2"><div><h3 className="font-bold">{state.locale === "mr" ? crop.marathiName : crop.name}</h3><p className="text-sm text-stone-600">{state.locale === "mr" ? why?.whyItFits.mr : why?.whyItFits.en}</p></div><button type="button" className="button-quiet min-h-12 min-w-12" aria-label={line.editingPlotId ? text.cancelEdit : text.removeFromDraft} onClick={() => removeLine(line)}>{line.editingPlotId ? text.cancelEdit : "×"}</button></div>
        <fieldset className="mt-3"><legend className="text-sm font-semibold">{text.plotNameLabel}</legend><div className="mt-1 flex flex-wrap gap-2">{DEFAULT_PLOT_NAMES.map((name) => <button key={name} type="button" aria-pressed={!customName && line.plotName === name} className={`min-h-12 rounded-full border px-3 text-sm ${!customName && line.plotName === name ? "border-forest bg-forest text-white" : "border-forest/20"}`} onClick={() => { setCustomNameIds((previous) => { const next = new Set(previous); next.delete(line.draftId); return next; }); updateLine(line.draftId, { plotName: name }); }}>{displayPlotName(name, state.locale)}</button>)}<button type="button" className="button-secondary min-h-12" aria-pressed={customName} onClick={() => setCustomNameIds((previous) => new Set(previous).add(line.draftId))}>{text.customName}</button></div>
          {customName && <input aria-label={text.plotNameLabel} className="form-input mt-2 min-h-12" maxLength={60} value={line.plotName} onChange={(event) => updateLine(line.draftId, { plotName: event.target.value })} />}
        </fieldset>
        <fieldset className="mt-3"><legend className="text-sm font-semibold">{text.landShareLabel} · {formatArea(line.areaGunthas, state.landUnit, state.locale)}</legend><div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-3">{presets.map(([preset, label]) => <button key={preset} type="button" className="min-h-12 rounded-lg border border-forest/20 px-2 text-sm" onClick={() => applyPreset(line, preset)}>{text[label]}</button>)}</div>
          <button type="button" aria-expanded={customSizeIds.has(line.draftId)} className="button-secondary mt-2 min-h-12" onClick={() => setCustomSizeIds((previous) => { const next = new Set(previous); if (next.has(line.draftId)) next.delete(line.draftId); else next.add(line.draftId); return next; })}>{text.customSize}</button>
          {customSizeIds.has(line.draftId) && <div className="mt-2"><AreaInput label={text.customSize} gunthas={line.areaGunthas} unit={state.landUnit} locale={state.locale} onChangeGunthas={(value) => { if (value !== null) updateLine(line.draftId, { areaGunthas: value }); }} /></div>}
          {availableThis !== null && <p className="mt-1 text-xs text-stone-600">{formatArea(Math.max(0, availableThis - line.areaGunthas), state.landUnit, state.locale)} {text.freeLandOf} {total === null ? "—" : formatArea(total, state.landUnit, state.locale)}</p>}
        </fieldset>
        <fieldset className="mt-3"><legend className="text-sm font-semibold">{text.plantingStatusLabel}</legend><div className="mt-1 grid grid-cols-2 gap-2"><button type="button" aria-pressed={!line.alreadyPlanted} className={`min-h-12 rounded-lg border px-2 text-sm ${!line.alreadyPlanted ? "border-forest bg-forest text-white" : "border-forest/20"}`} onClick={() => updateLine(line.draftId, { alreadyPlanted: false, lifecycleStage: "planned", plantingDate: null })}>{text.notPlantedYet}</button><button type="button" aria-pressed={line.alreadyPlanted} className={`min-h-12 rounded-lg border px-2 text-sm ${line.alreadyPlanted ? "border-forest bg-forest text-white" : "border-forest/20"}`} onClick={() => updateLine(line.draftId, { alreadyPlanted: true, lifecycleStage: line.lifecycleStage === "planned" ? "vegetative" : line.lifecycleStage })}>{text.alreadyPlanted}</button></div></fieldset>
        {line.alreadyPlanted && <div className="mt-2"><fieldset><legend className="text-sm font-semibold">{text.stage}</legend><div className="mt-1 grid grid-cols-2 gap-2">{stages.map((stage) => <button key={stage} type="button" aria-pressed={line.lifecycleStage === stage} className={`min-h-12 rounded-lg border px-2 text-sm ${line.lifecycleStage === stage ? "border-forest bg-forest text-white" : "border-forest/20"}`} onClick={() => updateLine(line.draftId, { lifecycleStage: stage })}>{text.stageNames[stage]}</button>)}</div></fieldset><label className="mt-2 block text-sm">{text.plantingDateLabel}<input className="form-input mt-1 min-h-12" type="date" value={line.plantingDate ?? ""} onChange={(event) => updateLine(line.draftId, { plantingDate: event.target.value || null })} /></label></div>}
        {line.editingPlotId && <button type="button" className="button-quiet mt-2 min-h-12" onClick={() => props.onRemovePlot(line.editingPlotId!)}>{text.removePlot}</button>}
      </article>;
    })}
    {error && <p role="alert" className="notice">{error}</p>}
    {lines.length > 0 && !validation.ok && validation.message && <p role="alert" className="notice">{validation.message.en === validation.message.mr ? validation.message.en : state.locale === "mr" ? validation.message.mr : validation.message.en}</p>}
    {lines.length > 0 && <div className="sticky bottom-0 border-t border-forest/10 bg-white pt-3"><p className="mb-2 text-sm">{remaining === null ? "—" : formatArea(remaining, state.landUnit, state.locale, { includeSecondary: true })} {text.freeLandOf} {total === null ? "—" : formatArea(total, state.landUnit, state.locale)}</p><button type="button" className="button-primary min-h-14 w-full" disabled={!state.hydrated || state.sampleDataActive || !validation.ok} onClick={commit}>{lines.some((line) => line.editingPlotId) ? text.savePlotChanges : text.confirmCheckout}</button></div>}
  </div>;

  return <>
    <aside className="hidden lg:block lg:sticky lg:top-4">
      <section className="bento-card"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="mb-2 text-xs font-bold uppercase tracking-widest text-forest">{text.checkoutTitle}</p><h2 className="text-xl font-bold">{text.reviewSelection} · {lines.length}</h2></div><LandUnitToggle /></div>{remaining !== null && <p className="mt-2 text-sm">{formatArea(remaining, state.landUnit, state.locale, { includeSecondary: true })} {text.freeLandOf}</p>}<div className="mt-4">{content}</div></section>
    </aside>
    {lines.length > 0 && <div className="fixed inset-x-3 bottom-20 z-40 rounded-2xl border border-forest/20 bg-white p-3 shadow-xl lg:hidden"><div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold">{lines.length} {state.locale === "mr" ? "पिके" : "crops"} · {remaining === null ? "—" : formatArea(remaining, state.landUnit, state.locale, { includeSecondary: true })} {state.locale === "mr" ? "शिल्लक" : "free"}</span><button type="button" className="button-primary min-h-12" onClick={props.onOpen}>{text.reviewSelection}</button></div></div>}
    {props.isOpen && <div className="fixed inset-0 z-[60] bg-ink/50 lg:hidden" onMouseDown={(event) => { if (event.target === event.currentTarget) props.onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="checkout-title" className="absolute inset-x-0 bottom-0 max-h-[92dvh] overflow-y-auto rounded-t-2xl bg-white p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] shadow-2xl">
        <div className="sticky top-0 z-10 -mx-4 mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-forest/10 bg-white px-4 py-2"><div><p className="text-xs font-bold uppercase tracking-widest text-forest">{text.checkoutTitle}</p><h2 id="checkout-title" className="text-lg font-bold">{text.reviewSelection} · {lines.length}</h2></div><LandUnitToggle /><button type="button" className="button-secondary min-h-12" onClick={props.onClose}>{text.keepBrowsing}</button></div>
        {content}
      </section>
    </div>}
  </>;
}
