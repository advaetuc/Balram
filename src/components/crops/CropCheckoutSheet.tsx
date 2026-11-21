"use client";

import { RadioChoices } from "@/components/ui/RadioChoices";

import { useEffect, useMemo, useRef, useState } from "react";
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
const stages: readonly LifecycleStage[] = ["vegetative", "flowering_fruiting", "harvesting"];

export type PlotDraft = Omit<CheckoutDraftLine, "lifecycleStage"> & { lifecycleStage: LifecycleStage | null };

export interface CropCheckoutSheetProps {
  readonly lines: readonly PlotDraft[];
  readonly existingAllocations: readonly CropAllocation[];
  readonly totalAreaSquareMetres: number | null;
  readonly isOpen: boolean;
  readonly onOpen: (trigger: HTMLElement) => void;
  readonly onClose: () => void;
  readonly onFocusReturn: () => void;
  readonly onLinesChange: (lines: PlotDraft[]) => void;
  readonly onCommitted: (allocations: CropAllocation[]) => void;
  readonly onRemovePlot: (plotId: string) => void;
}

export function CropCheckoutSheet(props: CropCheckoutSheetProps) {
  const state = useBalramStore((s) => s);
  const text = t(state.locale);
  const { lines, existingAllocations, totalAreaSquareMetres, onLinesChange } = props;
  const total = totalAreaSquareMetres === null ? null : squareMetresToGunthas(totalAreaSquareMetres);
  const editedIds = new Set(lines.flatMap((line) => line.editingPlotId ? [line.editingPlotId] : []));
  const retained = existingAllocations.filter((plot) => !plot.plotId || !editedIds.has(plot.plotId));
  const retainedArea = retained.reduce((sum, plot) => sum + (plot.areaGunthas ?? (total === null ? 0 : total * plot.percentage / 100)), 0);
  const completeLines = useMemo(() => lines.flatMap((line): CheckoutDraftLine[] =>
    line.lifecycleStage === null ? [] : [{ ...line, lifecycleStage: line.lifecycleStage }]), [lines]);
  const missingStage = completeLines.length !== lines.length;
  const validation = useMemo(() => validateCheckoutDraft(completeLines, existingAllocations, totalAreaSquareMetres),
    [completeLines, existingAllocations, totalAreaSquareMetres]);
  const [desktop, setDesktop] = useState(true);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const desktopHeading = useRef<HTMLHeadingElement>(null);
  const desktopWasOpen = useRef(false);
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
    const media = window.matchMedia("(min-width: 1024px)");
    const update = () => setDesktop(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (props.isOpen && !dialog.open) dialog.showModal();
    if (!props.isOpen && dialog.open) dialog.close();
  }, [desktop, props.isOpen]);

  useEffect(() => {
    if (desktop && props.isOpen && !desktopWasOpen.current) desktopHeading.current?.focus();
    if (desktop && !props.isOpen && desktopWasOpen.current) props.onFocusReturn();
    desktopWasOpen.current = desktop && props.isOpen;
  }, [desktop, props.isOpen, props.onFocusReturn]);

  function updateLine(draftId: string, patch: Partial<PlotDraft>) {
    onLinesChange(lines.map((line) => line.draftId === draftId ? { ...line, ...patch } : line));
    setError("");
  }
  function removeLine(line: PlotDraft) {
    onLinesChange(lines.filter((item) => item.draftId !== line.draftId));
    setCustomNameIds((previous) => { const next = new Set(previous); next.delete(line.draftId); return next; });
  }
  function applyPreset(line: PlotDraft, preset: LandSharePreset) {
    const others = lines.filter((candidate) => candidate.draftId !== line.draftId).reduce((sum, candidate) => sum + candidate.areaGunthas, 0);
    const otherPlots = existingAllocations.filter((plot) => !plot.plotId || !editedIds.has(plot.plotId));
    const used = otherPlots.reduce((sum, plot) => sum + (plot.areaGunthas ?? (total === null ? 0 : total * plot.percentage / 100)), 0) + others;
    const available = total === null ? null : Math.max(0, total - used);
    updateLine(line.draftId, { areaGunthas: resolvePresetGunthas(preset, line.areaGunthas, available) });
  }
  function commit() {
    if (!state.hydrated || state.sampleDataActive || missingStage || !validation.ok) return;
    try {
      const allocations = commitCheckoutDraftToAllocations(completeLines, existingAllocations, totalAreaSquareMetres);
      state.setCropAllocations(allocations);
      setError("");
      props.onCommitted(allocations);
    } catch {
      setError(text.checkoutError);
    }
  }

  const content = <div className="space-y-4">
    {lines.length === 0 ? <p className="rounded-xl bg-daylight p-4 text-sm leading-body">{text.checkoutEmpty}</p> : lines.map((line) => {
      const crop = MaharashtraCropMatrix[line.cropId];
      const why = explanations.find((item) => item.cropId === line.cropId);
      const availableThis = total === null ? null : Math.max(0, total - retainedArea - lines.filter((item) => item.draftId !== line.draftId).reduce((sum, item) => sum + item.areaGunthas, 0));
      const customName = customNameIds.has(line.draftId) || !DEFAULT_PLOT_NAMES.includes(line.plotName as typeof DEFAULT_PLOT_NAMES[number]);
      return <article className="rounded-xl border border-forest/20 p-3" key={line.draftId}>
        <div className="flex items-start justify-between gap-2"><div><h3 className="font-bold">{state.locale === "mr" ? crop.marathiName : crop.name}</h3><p className="text-sm leading-body text-stone-600">{state.locale === "mr" ? why?.whyItFits.mr : why?.whyItFits.en}</p></div><button type="button" className="button-quiet min-h-12 min-w-12" aria-label={line.editingPlotId ? text.cancelEdit : text.removeFromDraft} onClick={() => removeLine(line)}>{line.editingPlotId ? text.cancelEdit : "×"}</button></div>
        <fieldset className="mt-3 min-w-0"><legend className="text-sm font-semibold leading-body">{text.plotNameLabel}</legend><RadioChoices<string> label={text.plotNameLabel} value={customName ? "custom" : line.plotName}
          options={[...DEFAULT_PLOT_NAMES.map(name => ({ value: name, label: displayPlotName(name, state.locale) })),
            { value: "custom", label: text.customName }]}
          onChange={value => {
            setCustomNameIds(previous => {
              const next = new Set(previous);
              if (value === "custom") next.add(line.draftId);
              else next.delete(line.draftId);
              return next;
            });
            if (value !== "custom") updateLine(line.draftId, { plotName: value });
          }} />
          {customName && <input aria-label={text.plotNameLabel} className="form-input mt-2 min-h-12" maxLength={60} value={line.plotName} onChange={(event) => updateLine(line.draftId, { plotName: event.target.value })} />}
        </fieldset>
        <fieldset className="mt-3 min-w-0"><legend className="text-sm font-semibold leading-body">{text.landShareLabel} · {formatArea(line.areaGunthas, state.landUnit, state.locale)}</legend><div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-3">{presets.map(([preset, label]) => <button key={preset} type="button" className="min-h-12 rounded-lg border border-border-strong px-2 text-sm leading-body" onClick={() => applyPreset(line, preset)}>{text[label]}</button>)}</div>
          <button type="button" aria-expanded={customSizeIds.has(line.draftId)} className="button-secondary mt-2 min-h-12" onClick={() => setCustomSizeIds((previous) => { const next = new Set(previous); if (next.has(line.draftId)) next.delete(line.draftId); else next.add(line.draftId); return next; })}>{text.customSize}</button>
          {customSizeIds.has(line.draftId) && <div className="mt-2"><AreaInput label={text.customSize} gunthas={line.areaGunthas} unit={state.landUnit} locale={state.locale} onChangeGunthas={(value) => { if (value !== null) updateLine(line.draftId, { areaGunthas: value }); }} /></div>}
          {availableThis !== null && <p className="mt-1 text-sm leading-body text-stone-600">{formatArea(Math.max(0, availableThis - line.areaGunthas), state.landUnit, state.locale)} {text.freeLandOf} {total === null ? "—" : formatArea(total, state.landUnit, state.locale)}</p>}
        </fieldset>
        <fieldset className="mt-3 min-w-0"><legend className="text-sm font-semibold leading-body">{text.plantingStatusLabel}</legend><RadioChoices label={text.plantingStatusLabel} value={line.alreadyPlanted ? "planted" : "planned"}
          className="mt-1 grid grid-cols-2 gap-2"
          options={[{ value: "planned", label: text.notPlantedYet }, { value: "planted", label: text.alreadyPlanted }]}
          onChange={value => updateLine(line.draftId, value === "planned"
            ? { alreadyPlanted: false, lifecycleStage: "planned", plantingDate: null }
            : { alreadyPlanted: true, lifecycleStage: null })} /></fieldset>
        {line.alreadyPlanted && <div className="mt-2"><fieldset className="min-w-0"><legend className="text-sm font-semibold leading-body">{text.stage}</legend>
          {line.lifecycleStage === null && <p className="mt-1 text-sm leading-body">{text.pickPlantedStage}</p>}
          <RadioChoices<LifecycleStage> label={text.stage} value={line.lifecycleStage}
            className="mt-1 grid grid-cols-2 gap-2"
            options={(line.lifecycleStage === "planned" ? ["planned" as const, ...stages] : stages).map(stage => ({ value: stage, label: text.stageNames[stage] }))}
            onChange={lifecycleStage => updateLine(line.draftId, { lifecycleStage })} /></fieldset><label className="mt-2 block text-sm leading-body">{text.plantingDateLabel}<input className="form-input mt-1 min-h-12" type="date" value={line.plantingDate ?? ""} onChange={(event) => updateLine(line.draftId, { plantingDate: event.target.value || null })} /></label></div>}
        {line.editingPlotId && <button type="button" className="button-quiet mt-2 min-h-12" onClick={() => props.onRemovePlot(line.editingPlotId!)}>{text.removePlot}</button>}
      </article>;
    })}
  </div>;

  const footer = lines.length > 0 && (
    <div className="sticky bottom-0 shrink-0 border-t border-forest/15 bg-white p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] lg:px-0 lg:pb-0">
      {error && <p role="alert" className="notice mb-2 text-sm leading-body">{error}</p>}
      {missingStage ? <p className="mb-2 text-sm leading-body" id="checkout-stage-hint">{text.pickPlantedStage}</p>
        : !validation.ok && validation.message && <p className="notice mb-2 text-sm leading-body">{validation.message[state.locale]}</p>}
      <button type="button" className="button-primary min-h-14 w-full" aria-describedby={missingStage ? "checkout-stage-hint" : undefined}
        disabled={!state.hydrated || state.sampleDataActive || missingStage || !validation.ok} onClick={commit}>
        {lines.some(line => line.editingPlotId) ? text.savePlotChanges : text.confirmCheckout}
      </button>
    </div>
  );

  if (desktop) return (
    <aside className="hidden min-w-0 print:hidden lg:sticky lg:top-4 lg:block">
      <section className="bento-card flex max-h-[calc(100dvh-2rem)] flex-col">
        <div className="flex shrink-0 flex-wrap items-center gap-2 pb-2">
          <h2 ref={desktopHeading} tabIndex={-1} className="text-xl font-bold leading-heading">{text.checkoutTitle}</h2>
          <LandUnitToggle />
        </div>
        <div className="min-h-0 overflow-y-auto p-1">{content}</div>
        {footer}
      </section>
    </aside>
  );

  return <>
    {lines.length > 0 && <button type="button" className="button-secondary w-full print:hidden lg:hidden"
      onClick={event => props.onOpen(event.currentTarget)}>{text.reviewSelection} · {lines.length}</button>}
    <dialog ref={dialogRef} aria-labelledby="checkout-title" onClose={props.onFocusReturn}
      onCancel={event => { event.preventDefault(); props.onClose(); }}
      className="fixed inset-x-0 bottom-0 top-auto mx-auto mb-0 mt-auto max-h-[90dvh] w-full max-w-[560px] flex-col overflow-hidden rounded-t-2xl bg-white text-ink shadow-sheet open:flex print:hidden">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-forest/15 p-3">
        <h2 id="checkout-title" className="text-lg font-bold leading-heading">{text.checkoutTitle}</h2>
        <button type="button" autoFocus className="button-secondary" onClick={props.onClose}>{text.keepBrowsing}</button>
      </div>
      <div className="min-h-0 overflow-y-auto overscroll-contain p-3">
        <div className="mb-3"><LandUnitToggle /></div>
        {content}
      </div>
      {footer}
    </dialog>
  </>;
}
