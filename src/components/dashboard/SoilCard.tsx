"use client";

import { useId, useState, type KeyboardEvent } from "react";
import { ProvenanceBadge } from "@/components/ui/ProvenanceBadge";
import { RadioChoices } from "@/components/ui/RadioChoices";
import { t } from "@/config/i18n";
import {
  blueIntensityToLevel, classifyMoisturePercent, levelToDefaultBlueIntensity,
  SOIL_DEMO_PRESETS, SOIL_PRESET_RANGES,
} from "@/lib/domain/soilChemistry";
import { classifyNitrogenKgPerHa, classifyPhosphorusKgPerHa, interpretSoilKitReading } from "@/lib/domain/soilKit";
import { formatNumber, parseNumber } from "@/lib/ui/format";
import { useNow } from "@/lib/ui/useNow";
import { useBalramStore, type BalramState } from "@/store/useBalramStore";
import { SoilKitReadingSchema, type MoistureLevel, type SoilKitReading } from "@/types/domain";
import { BlueIntensityPicker } from "./BlueIntensityPicker";
import { Card, DataCaption } from "./Card";
import { PresetRangesDisclosure } from "./PresetRangesDisclosure";
import { SoilCalculationsTab, labInputsFromAudit, type LabApplication, type LabInputs, type SoilDemo } from "./SoilCalculationsTab";
import { SoilGauges } from "./SoilGauges";

type SoilMode = SoilKitReading["kitType"] | "skip";
type Audit = NonNullable<SoilKitReading["labCalculation"]>;
const tabs = ["soil", "calculations"] as const;
type SoilTab = typeof tabs[number];

function createDraft(reading: SoilKitReading | null) {
  const intensity = reading?.phosphorusBlueIntensity;
  const phosphorusLevel = reading?.phosphorusLevel ?? "medium";
  return {
    ph: String(reading?.ph ?? 7),
    nitrogenLevel: reading?.nitrogenLevel ?? "medium",
    phosphorusLevel,
    blueIntensity: ([1, 2, 3, 4, 5] as const).find(value => value === intensity) ?? levelToDefaultBlueIntensity(phosphorusLevel),
    nitrogenKg: reading?.nitrogenKgPerHa?.toString() ?? "",
    phosphorusKg: reading?.phosphorusKgPerHa?.toString() ?? "",
    potassiumLevel: reading?.potassiumLevel ?? "untested",
    organicCarbon: reading?.organicCarbon ?? "untested",
    salinity: reading?.salinity ?? "untested",
    moistureLevel: reading?.moistureLevel ?? "untested",
    moisturePercent: reading?.moisturePercent?.toString() ?? "",
    dataStatus: reading?.dataStatus ?? "screening",
    audit: reading?.labCalculation ?? null,
  };
}

type SoilDraft = ReturnType<typeof createDraft>;

function demoDraft(name: SoilDemo): SoilDraft {
  const preset = SOIL_DEMO_PRESETS[name];
  const audit: Audit = {};
  const draft: SoilDraft = {
    ...createDraft(null), dataStatus: preset.dataStatus, ph: String(preset.ph),
    moisturePercent: String(preset.moisturePercent), moistureLevel: preset.moistureLevel,
    blueIntensity: preset.phosphorusBlueIntensity, phosphorusLevel: blueIntensityToLevel(preset.phosphorusBlueIntensity),
    audit,
  };
  if ("nitrogen" in preset && preset.nitrogen.result.ok) {
    const { input, result } = preset.nitrogen;
    draft.nitrogenKg = String(result.nitrogenKgPerHaExact);
    draft.nitrogenLevel = result.level;
    audit.nitrogenMethod = input.method;
    audit.nitrogenBlankMl = input.blankMl;
    audit.nitrogenSampleTrial1Ml = input.sampleTrial1Ml;
    audit.nitrogenSampleTrial2Ml = "sampleTrial2Ml" in input ? input.sampleTrial2Ml : undefined;
  }
  if ("phosphorus" in preset && preset.phosphorus.result.ok) {
    const { input, result } = preset.phosphorus;
    draft.phosphorusKg = String(result.phosphorusKgPerHaReported);
    draft.phosphorusLevel = result.level;
    audit.phosphorusAbsorbance = input.absorbance;
    audit.phosphorusExtractVolumeMl = input.extractVolumeMl;
    audit.phosphorusSoilMassG = input.soilMassG;
    audit.phosphorusHaFactor = input.haFactor;
    audit.phosphorusConcentrationMgPerL = result.concentrationMgPerL;
    audit.phosphorusMgPerKg = result.phosphorusMgPerKg;
  }
  if ("optical" in preset && preset.optical.result.status === "calibrated") {
    const { pulses, calibration, result } = preset.optical;
    audit.tcs3200RawUs = { r: pulses.rUs, g: pulses.gUs, b: pulses.bUs };
    audit.tcs3200LowBUs = calibration.lowBUs;
    audit.tcs3200HighBUs = calibration.highBUs;
    audit.tcs3200RelativeScore = result.score0To100;
  }
  return draft;
}

const clearNitrogen: Audit = {
  nitrogenMethod: undefined, nitrogenBlankMl: undefined, nitrogenSampleTrial1Ml: undefined, nitrogenSampleTrial2Ml: undefined,
};
const clearOlsen: Audit = {
  phosphorusAbsorbance: undefined, phosphorusConcentrationMgPerL: undefined, phosphorusMgPerKg: undefined,
  phosphorusExtractVolumeMl: undefined, phosphorusSoilMassG: undefined, phosphorusHaFactor: undefined,
};
const clearOptical: Audit = {
  tcs3200RawUs: undefined, tcs3200LowBUs: undefined, tcs3200HighBUs: undefined, tcs3200RelativeScore: undefined,
};

export function SoilCard() {
  const state = useBalramStore(s => s);
  return <SoilCardForm key={JSON.stringify([state.hydrated, state.activeProfileId, state.sampleDataActive])} state={state} />;
}

function SoilCardForm({ state }: { state: BalramState }) {
  const { locale, soilKitReading: saved } = state;
  const { todayIso } = useNow();
  const text = t(locale);
  const copy = text.soilLab;
  const mr = locale === "mr";
  const id = useId();
  const phId = `${id}-ph`;
  const moistureHintId = `${id}-moisture-hint`;
  const [mode, setMode] = useState<SoilMode>(state.soilSkipped ? "skip" : saved?.kitType ?? "balram_inhouse");
  const [tab, setTab] = useState<SoilTab>("soil");
  const [realDraft, setRealDraft] = useState(() => createDraft(saved?.dataStatus === "simulated" ? null : saved));
  const [demo, setDemo] = useState(() => saved?.dataStatus === "simulated" ? createDraft(saved) : null);
  const [labEdits, setLabEdits] = useState<Partial<LabInputs>>({});
  const [phDirection, setPhDirection] = useState<"up" | "down" | "none">("none");
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [resultAnimationKey, setResultAnimationKey] = useState(0);
  const draft = demo ?? realDraft;
  const disabled = !state.hydrated || state.sampleDataActive;
  const currentMode = demo && mode !== "skip" ? "balram_inhouse" : mode;
  const { ph, nitrogenLevel, phosphorusLevel, moistureLevel, moisturePercent } = draft;
  const parsedMoisture = parseNumber(moisturePercent);
  const moistureInvalid = moisturePercent !== "" && (parsedMoisture === null || classifyMoisturePercent(parsedMoisture) === "untested");
  const labInputs = demo ? labInputsFromAudit(demo.audit) : { ...labInputsFromAudit(realDraft.audit), ...labEdits };
  const choiceName = (value: string) => ({
    low: text.low, medium: text.medium, high: text.high, untested: copy.moisture.levels.untested,
    normal: mr ? "सामान्य" : "Normal", elevated: mr ? "वाढलेली" : "Elevated",
  } as Record<string, string>)[value] ?? value;
  const choose = <T extends string,>(label: string, value: T, values: readonly T[], set: (next: T) => void) => (
    <fieldset className="min-w-0">
      <legend className="mb-1 text-sm font-semibold leading-body">{label}</legend>
      <RadioChoices label={label} value={value} options={values.map(option => ({ value: option, label: choiceName(option) }))}
        onChange={set} disabled={disabled} />
    </fieldset>
  );

  function discardDemo() {
    if (!demo) return;
    setDemo(null);
    setAnnouncement(copy.demos.resetDone);
    setError("");
  }

  function edit(patch: Partial<SoilDraft>, auditPatch?: Audit) {
    discardDemo();
    setRealDraft(current => ({
      ...current, ...patch, dataStatus: "screening",
      audit: auditPatch ? { ...current.audit, ...auditPatch } : current.audit,
    }));
    setError("");
  }

  function changeMode(next: SoilMode) {
    discardDemo();
    setError("");
    setMode(next);
    if (next === "skip") {
      setTab("soil");
      state.setSoilSkipped(true);
    }
  }

  function changePh(value: string) {
    const previous = Number(realDraft.ph);
    setPhDirection(Number(value) > previous ? "up" : Number(value) < previous ? "down" : "none");
    edit({ ph: value });
  }

  function changeMoisture(value: string) {
    const reading = parseNumber(value);
    edit({ moisturePercent: value, moistureLevel: reading === null ? realDraft.moistureLevel : classifyMoisturePercent(reading) });
  }

  function changeCardPhosphorus(value: string) {
    const reading = parseNumber(value);
    const level = reading !== null && reading >= 0 ? classifyPhosphorusKgPerHa(reading) : realDraft.phosphorusLevel;
    edit({ phosphorusKg: value, phosphorusLevel: level, blueIntensity: levelToDefaultBlueIntensity(level) }, { ...clearOlsen, ...clearOptical });
  }

  function loadDemo(name: SoilDemo) {
    setDemo(demoDraft(name));
    setPhDirection("none");
    setError("");
    setAnnouncement(copy.demos.applied.replace("{0}", copy.demos[name]));
  }

  function applyLab({ values, audit }: LabApplication, message: string) {
    const next = (current: SoilDraft): SoilDraft => {
      const intensity = values.phosphorusBlueIntensity ?? current.blueIntensity;
      const visualLevel = current.phosphorusKg === "" && values.phosphorusBlueIntensity !== undefined
        ? blueIntensityToLevel(intensity) : current.phosphorusLevel;
      return {
        ...current,
        nitrogenKg: values.nitrogenKgPerHa?.toString() ?? current.nitrogenKg,
        phosphorusKg: values.phosphorusKgPerHa?.toString() ?? current.phosphorusKg,
        nitrogenLevel: values.nitrogenLevel ?? current.nitrogenLevel,
        phosphorusLevel: values.phosphorusLevel ?? visualLevel,
        blueIntensity: intensity,
        dataStatus: current.dataStatus === "simulated" ? "simulated" : "screening",
        audit: { ...current.audit, ...audit },
      };
    };
    if (demo) setDemo(next(demo));
    else setRealDraft(next);
    setAnnouncement(message);
    setError("");
  }

  function save() {
    if (currentMode === "skip" || disabled) return;
    const nitrogen = parseNumber(draft.nitrogenKg);
    const phosphorus = parseNumber(draft.phosphorusKg);
    if (moistureInvalid) {
      setError(copy.moisture.invalid);
      return;
    }
    try {
      if (currentMode === "soil_health_card" && (nitrogen === null || phosphorus === null)) throw new Error();
      const rapid = currentMode === "commercial_rapid";
      const audit = draft.audit && Object.fromEntries(Object.entries(draft.audit).filter(([, value]) => value !== undefined));
      const value = SoilKitReadingSchema.parse({
        kitType: currentMode, ph: Number(ph), testedAt: todayIso ?? "2026-11-16",
        nitrogenLevel: nitrogen === null ? nitrogenLevel : classifyNitrogenKgPerHa(nitrogen),
        phosphorusLevel: phosphorus === null ? phosphorusLevel : classifyPhosphorusKgPerHa(phosphorus),
        nitrogenKgPerHa: nitrogen, phosphorusKgPerHa: phosphorus,
        potassiumLevel: rapid ? draft.potassiumLevel : "untested",
        organicCarbon: rapid ? draft.organicCarbon : "untested",
        salinity: rapid ? draft.salinity : "untested",
        moistureLevel, moisturePercent: parsedMoisture,
        phosphorusBlueIntensity: currentMode === "balram_inhouse" || draft.audit?.tcs3200RawUs || draft.audit?.phosphorusAbsorbance !== undefined
          ? draft.blueIntensity : null,
        dataStatus: draft.dataStatus, labCalculation: audit && Object.keys(audit).length ? audit : null,
      });
      state.setSoilKitReading(value);
      setError("");
      setResultAnimationKey(current => current + 1);
    } catch {
      setError(copy.invalidReading);
    }
  }

  function navigateTabs(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const target = event.key === "Home" ? 0 : event.key === "End" ? 1
      : event.key === "ArrowLeft" || event.key === "ArrowRight" ? 1 - index : null;
    if (target === null) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[target]?.focus();
  }

  const interpretation = saved ? interpretSoilKitReading(saved) : null;
  const opticalSaved = saved?.labCalculation?.tcs3200RawUs != null;
  const phValue = Number(ph).toFixed(1);
  const { min, max, neutralMin, neutralMax } = SOIL_PRESET_RANGES.ph;
  const nutrientPill = (value: string) => value !== "" && <span className="rounded-full bg-info-subtle px-3 py-1 text-sm font-semibold text-on-info-subtle">
    {copy.units.kgPerHa.replace("{0}", formatNumber(parseNumber(value), 2, locale))}
  </span>;

  return <Card id="soil" title={text.soil} eyebrow={text.kit}>
    <p className="mt-2 text-sm leading-body">{mr ? "चाचणीचे निकाल या ब्राउझरमध्ये राहतात; बाहेरील सेवेकडे पाठवले जात नाहीत." : "Test results stay in this browser and are not sent to a provider."}</p>
    {state.sampleDataActive && <p className="notice mt-3">{text.sampleReadOnly}</p>}
    {currentMode !== "skip" && <div role="tablist" aria-label={text.soil} data-active={tabs.indexOf(tab)}
      className="seg seg-2 mt-4 rounded-xl border border-border-strong bg-white">
      {tabs.map((item, index) => <button key={item} type="button" role="tab"
        id={`${id}-tab-${item}`} aria-controls={`${id}-panel-${item}`}
        aria-selected={tab === item} tabIndex={tab === item ? 0 : -1}
        onKeyDown={event => navigateTabs(event, index)} onClick={() => setTab(item)}
        className="min-h-12 min-w-12 break-words rounded-lg px-2 text-sm font-bold leading-body">
        {copy.tabs[item]}
      </button>)}
    </div>}
    <p role="status" className="sr-only">{announcement}</p>
    {demo && <div className="mt-3 flex flex-wrap items-center gap-2">
      <ProvenanceBadge provenance="sample" locale={locale} />
      <span className="rounded-full bg-warning-subtle px-3 py-1 text-sm font-bold text-on-warning-subtle">{copy.demos.badge}</span>
      <button type="button" disabled={disabled} className="button-secondary press min-h-12 min-w-12" onClick={discardDemo}>{copy.demos.reset}</button>
    </div>}
    <div id={`${id}-panel-soil`} role={currentMode !== "skip" ? "tabpanel" : undefined}
      aria-labelledby={currentMode !== "skip" ? `${id}-tab-soil` : undefined} hidden={tab !== "soil"}
      className={tab === "soil" ? "panel-tab mt-4 space-y-4" : undefined}>
      <fieldset className="min-w-0">
        <legend className="mb-2 text-sm font-bold leading-body">{mr ? "चाचणी पद्धत" : "Test method"}</legend>
        <RadioChoices<SoilMode> label={mr ? "चाचणी पद्धत" : "Test method"} value={currentMode} disabled={disabled}
          className="grid gap-2 sm:grid-cols-2"
          options={[
            { value: "balram_inhouse", label: text.soilModeHouse, className: "sm:col-span-2 [&>label]:min-h-14" },
            { value: "soil_health_card", label: text.soilModeCard },
            { value: "commercial_rapid", label: text.soilModeRapid },
            { value: "skip", label: text.soilSkip, className: "sm:col-span-2" },
          ]} onChange={changeMode} />
      </fieldset>
      {currentMode === "skip" ? <p className="notice">{text.soilSkipped}</p> : <>
        <div>
          <label htmlFor={phId} className="block text-sm font-semibold leading-body">{copy.ranges.ph}</label>
          <div className="mt-1 flex items-center gap-3">
            <button type="button" className="button-secondary press min-h-12 min-w-12" aria-label={text.phDecrease}
              disabled={disabled || Number(ph) <= min} onClick={() => changePh(Math.max(min, Number(ph) - 0.1).toFixed(1))}>−0.1</button>
            <output htmlFor={phId} className="text-3xl font-bold leading-heading">
              <span key={phValue} className="ph-readout tabular-nums" data-dir={phDirection}>{phValue}</span>
            </output>
            <button type="button" className="button-secondary press min-h-12 min-w-12" aria-label={text.phIncrease}
              disabled={disabled || Number(ph) >= max} onClick={() => changePh(Math.min(max, Number(ph) + 0.1).toFixed(1))}>+0.1</button>
          </div>
          <input id={phId} disabled={disabled} className="form-input mt-2 min-h-12 accent-forest" type="range"
            min={min} max={max} step="0.1" value={ph} onChange={event => changePh(event.target.value)} />
          <div className="mt-2 flex flex-wrap gap-2 text-sm leading-body">
            <span className="rounded-full bg-warning-subtle px-3 py-1 text-on-warning-subtle">{copy.ranges.acidic} &lt; {formatNumber(neutralMin, 1, locale)}</span>
            <span className="rounded-full bg-success-subtle px-3 py-1 text-on-success-subtle">{copy.ranges.neutral} {formatNumber(neutralMin, 1, locale)}–{formatNumber(neutralMax, 1, locale)}</span>
            <span className="rounded-full bg-info-subtle px-3 py-1 text-on-info-subtle">{copy.ranges.alkaline} &gt; {formatNumber(neutralMax, 1, locale)}</span>
          </div>
        </div>
        <fieldset className="min-w-0 space-y-2">
          <legend className="mb-1 text-sm font-semibold">{copy.moisture.label}</legend>
          <RadioChoices label={copy.moisture.label} value={moistureLevel} disabled={disabled}
            options={(Object.keys(copy.moisture.levels) as MoistureLevel[]).map(value => ({ value, label: copy.moisture.levels[value] }))}
            onChange={value => edit({ moistureLevel: value, moisturePercent: "" })} />
          <label className="block max-w-52 text-sm font-semibold">{copy.moisture.percent}
            <input className="form-input mt-1 min-h-12" type="number" inputMode="decimal" min="0" max="100" step="any"
              value={moisturePercent} disabled={disabled} aria-invalid={moistureInvalid || undefined}
              aria-describedby={moistureHintId} onChange={event => changeMoisture(event.target.value)} />
          </label>
          <p id={moistureHintId} className="text-sm leading-body text-muted-foreground">{moistureInvalid ? copy.moisture.invalid : copy.moisture.hint}</p>
        </fieldset>
        {currentMode === "soil_health_card" ? <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-semibold">{text.soilNitrogenKg}
            <input disabled={disabled} className="form-input mt-1 min-h-12" type="number" inputMode="decimal" min="0" max="2000" step="any"
              value={draft.nitrogenKg} onChange={event => edit({ nitrogenKg: event.target.value }, clearNitrogen)} />
          </label>
          <label className="text-sm font-semibold">{text.soilPhosphorusKg}
            <input disabled={disabled} className="form-input mt-1 min-h-12" type="number" inputMode="decimal" min="0" max="500" step="any"
              value={draft.phosphorusKg} onChange={event => changeCardPhosphorus(event.target.value)} />
          </label>
        </div> : <>
          <div className="flex flex-wrap items-end gap-2">
            {choose(copy.nitrogen.result, nitrogenLevel, ["low", "medium", "high"], level => edit({ nitrogenLevel: level, nitrogenKg: "" }, clearNitrogen))}
            {nutrientPill(draft.nitrogenKg)}
          </div>
          {currentMode === "balram_inhouse" ? <div className="space-y-2">
            <BlueIntensityPicker locale={locale} value={draft.blueIntensity} disabled={disabled}
              onChange={intensity => edit({
                blueIntensity: intensity, phosphorusLevel: blueIntensityToLevel(intensity), phosphorusKg: "",
              }, { ...clearOlsen, ...clearOptical })} />
            {nutrientPill(draft.phosphorusKg)}
            {draft.audit?.tcs3200RawUs && <p className="text-sm font-semibold text-on-warning-subtle">{copy.optical.badge}</p>}
          </div> : choose(copy.ranges.phosphorus, phosphorusLevel, ["low", "medium", "high"], level => edit({
            phosphorusLevel: level, phosphorusKg: "", blueIntensity: levelToDefaultBlueIntensity(level),
          }, { ...clearOlsen, ...clearOptical }))}
        </>}
        <PresetRangesDisclosure locale={locale} />
        {currentMode === "commercial_rapid" && <>
          {choose(mr ? "पालाश" : "Potassium", draft.potassiumLevel, ["low", "medium", "high", "untested"], level => edit({ potassiumLevel: level }))}
          {choose(mr ? "सेंद्रिय कर्ब" : "Organic carbon", draft.organicCarbon, ["low", "medium", "high", "untested"], level => edit({ organicCarbon: level }))}
          {choose(mr ? "क्षारता" : "Salinity", draft.salinity, ["normal", "elevated", "high", "untested"], level => edit({ salinity: level }))}
        </>}
        <div className="flex flex-wrap gap-2">
          <button type="button" className="button-primary press min-h-12 flex-1" disabled={disabled} onClick={save}>{text.soilSave}</button>
          <button type="button" className="button-secondary min-h-12" disabled={disabled || !saved} onClick={() => {
            state.setSoilKitReading(null);
            discardDemo();
            setRealDraft(createDraft(null));
            setLabEdits({});
          }}>{mr ? "चाचणी काढा" : "Clear kit reading"}</button>
        </div>
      </>}
    </div>
    {currentMode !== "skip" && <div id={`${id}-panel-calculations`} role="tabpanel" aria-labelledby={`${id}-tab-calculations`}
      hidden={tab !== "calculations"} className={tab === "calculations" ? "panel-tab mt-4" : undefined}>
      {tab === "calculations" && <SoilCalculationsTab locale={locale} disabled={disabled} simulated={demo !== null}
        inputs={labInputs} onDemo={loadDemo} onApply={applyLab} onChange={patch => {
          discardDemo();
          setLabEdits(current => ({ ...current, ...patch }));
        }} />}
    </div>}
    {error && tab === "soil" && <p role="alert" className="notice mt-2">{error}</p>}
    {saved?.dataStatus === "simulated" && <p className="notice mt-4 font-bold">{copy.demos.badge}</p>}
    {opticalSaved && <p className="notice mt-4">{copy.savedOpticalNote}</p>}
    {interpretation&&<><SoilGauges key={resultAnimationKey} />
    <section className="mt-5 rounded-xl bg-forest/5 p-4"><h3 className="font-bold">{mr?"लागवडीपूर्वी मातीला काय हवे":"What Your Soil Needs Before Planting"}</h3><p className="mt-1">{mr?interpretation.headline.mr:interpretation.headline.en}</p><p className="inline-flex rounded-full px-3 py-1 text-sm leading-body mt-2 bg-sky/10">{mr?({optimal:"संतुलित",needs_enrichment:"सुधारणा आवश्यक",critical_amendment:"महत्त्वाची सुधारणा आवश्यक"} as const)[interpretation.overallHealth]:interpretation.overallHealth.replaceAll("_"," ")}</p><p className="mt-2 text-sm leading-body">{mr?interpretation.assayNotes.mr:interpretation.assayNotes.en}</p><ul key={resultAnimationKey} className={`mt-3 space-y-3 ${resultAnimationKey > 0 ? "stagger" : ""}`}>{interpretation.steps.map(step=><li key={step.id} className="rounded-lg border border-forest/15 bg-white p-3"><b>{mr?step.badgeLabel.mr:step.badgeLabel.en}</b><p className="text-sm leading-body">{mr?step.plainExplanation.mr:step.plainExplanation.en}</p><p className="mt-1 text-sm font-medium">{mr?step.actionStep.mr:step.actionStep.en}</p></li>)}</ul></section></>}
    <DataCaption source={saved?.dataStatus === "simulated" ? copy.demos.badge
      : opticalSaved && saved?.phosphorusKgPerHa == null ? copy.savedOptical
      : saved ? (mr ? "शेतकऱ्याने नोंदवलेली माती किट" : "Farmer-entered physical soil kit")
      : (mr ? "माती किटचा निकाल जतन नाही" : "No physical kit reading saved")}
      validAt={saved?.testedAt ?? null} sample={state.sampleDataActive || saved?.dataStatus === "simulated"} />
  </Card>;
}
