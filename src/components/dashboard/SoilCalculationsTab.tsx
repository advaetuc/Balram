import { ProvenanceBadge } from "@/components/ui/ProvenanceBadge";
import { RadioChoices } from "@/components/ui/RadioChoices";
import { t } from "@/config/i18n";
import {
  calculateAvailableNitrogen, calculateOlsenPhosphorus, evaluateTcs3200Optical,
  levelToDefaultBlueIntensity, OLSEN_PHOSPHORUS_DEFAULTS, type SoilBlueIntensity,
} from "@/lib/domain/soilChemistry";
import { formatNumber, parseNumber } from "@/lib/ui/format";
import { SoilKitReadingSchema, type Locale, type NitrogenMethod, type SoilKitReading } from "@/types/domain";
import { LcdPreview } from "./LcdPreview";

type Audit = NonNullable<SoilKitReading["labCalculation"]>;
export interface LabInputs {
  method: NitrogenMethod;
  blank: string;
  trial1: string;
  trial2: string;
  absorbance: string;
  volume: string;
  mass: string;
  factor: string;
  r: string;
  g: string;
  b: string;
  low: string;
  high: string;
}

export function labInputsFromAudit(audit: Audit | null): LabInputs {
  const input = (value?: number) => value === undefined ? "" : String(value);
  return {
    method: audit?.nitrogenMethod ?? "direct_h2so4",
    blank: input(audit?.nitrogenBlankMl), trial1: input(audit?.nitrogenSampleTrial1Ml), trial2: input(audit?.nitrogenSampleTrial2Ml),
    absorbance: input(audit?.phosphorusAbsorbance),
    volume: audit?.phosphorusExtractVolumeMl?.toString() ?? OLSEN_PHOSPHORUS_DEFAULTS.extractVolumeMl.toFixed(1),
    mass: audit?.phosphorusSoilMassG?.toString() ?? OLSEN_PHOSPHORUS_DEFAULTS.soilMassG.toFixed(3),
    factor: String(audit?.phosphorusHaFactor ?? OLSEN_PHOSPHORUS_DEFAULTS.haFactor),
    r: input(audit?.tcs3200RawUs?.r), g: input(audit?.tcs3200RawUs?.g), b: input(audit?.tcs3200RawUs?.b),
    low: input(audit?.tcs3200LowBUs), high: input(audit?.tcs3200HighBUs),
  };
}

export type LabApplication = {
  values: Partial<Pick<SoilKitReading, "nitrogenLevel" | "phosphorusLevel">> & {
    nitrogenKgPerHa?: number;
    phosphorusKgPerHa?: number;
    phosphorusBlueIntensity?: SoilBlueIntensity;
  };
  audit: Audit;
};

function LabNumber({ label, value, onChange, min }: {
  label: string; value: string; onChange: (value: string) => void; min?: number;
}) {
  return <label className="min-w-0 text-sm font-semibold leading-body">{label}
    <input type="number" inputMode="decimal" min={min} step="any" value={value}
      onChange={event => onChange(event.target.value)} className="form-input mt-1 min-h-12" />
  </label>;
}

function Readout({ rows }: { rows: readonly (readonly [string, string])[] }) {
  return <dl className="space-y-1 rounded-lg bg-forest/5 p-3 text-sm leading-body">
    {rows.map(([label, value]) => <div key={label} className="flex flex-wrap justify-between gap-x-3">
      <dt>{label}</dt><dd className="font-bold tabular-nums">{value}</dd>
    </div>)}
  </dl>;
}

export function SoilCalculationsTab({ locale, disabled, inputs, onChange, onLoadPreset, onApply }: {
  locale: Locale;
  disabled: boolean;
  inputs: LabInputs;
  onChange: (patch: Partial<LabInputs>) => void;
  onLoadPreset: () => void;
  onApply: (application: LabApplication, message: string) => void;
}) {
  const text = t(locale);
  const copy = text.soilLab;
  const number = (value: number, digits = 2) => formatNumber(value, digits, locale);
  const fixed = (value: number) => new Intl.NumberFormat(locale === "mr" ? "mr-IN" : "en-IN", {
    minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false,
  }).format(value);
  const unit = (template: string, value: number, digits?: number) => template.replace("{0}", number(value, digits));
  const input = (key: Exclude<keyof LabInputs, "method" | "factor">, label: string, min?: number) =>
    <LabNumber label={label} value={inputs[key]} onChange={value => onChange({ [key]: value })} min={min} />;
  const nitrogenBlankMl = parseNumber(inputs.blank);
  const nitrogenSampleTrial1Ml = parseNumber(inputs.trial1);
  const nitrogenSampleTrial2Ml = parseNumber(inputs.trial2) ?? undefined;
  const nitrogen = nitrogenBlankMl === null || nitrogenSampleTrial1Ml === null ? null : calculateAvailableNitrogen({
    method: inputs.method, blankMl: nitrogenBlankMl, sampleTrial1Ml: nitrogenSampleTrial1Ml, sampleTrial2Ml: nitrogenSampleTrial2Ml,
  });
  const nitrogenValue = nitrogen?.nitrogenKgPerHaExact ?? null;
  const nitrogenFits = SoilKitReadingSchema.shape.nitrogenKgPerHa.safeParse(nitrogenValue).success;
  const phosphorusAbsorbance = parseNumber(inputs.absorbance);
  const phosphorusExtractVolumeMl = parseNumber(inputs.volume);
  const phosphorusSoilMassG = parseNumber(inputs.mass);
  const phosphorusHaFactor = Number(inputs.factor);
  const phosphorus = phosphorusAbsorbance === null ? null : calculateOlsenPhosphorus({
    absorbance: phosphorusAbsorbance, extractVolumeMl: phosphorusExtractVolumeMl ?? NaN,
    soilMassG: phosphorusSoilMassG ?? NaN, haFactor: phosphorusHaFactor,
  });
  const phosphorusValue = phosphorus?.ok ? phosphorus.phosphorusKgPerHa : null;
  const phosphorusFits = SoilKitReadingSchema.shape.phosphorusKgPerHa.safeParse(phosphorus?.ok ? phosphorus.phosphorusKgPerHa : null).success;

  const r = parseNumber(inputs.r), g = parseNumber(inputs.g), b = parseNumber(inputs.b);
  const lowBUs = parseNumber(inputs.low), highBUs = parseNumber(inputs.high);
  const pulses = r === null || g === null || b === null ? null : { rUs: r, gUs: g, bUs: b };
  const calibration = lowBUs === null || highBUs === null ? undefined : { lowBUs, highBUs };
  const optical = pulses && evaluateTcs3200Optical(pulses, calibration);
  const timeout = [r, g, b].some(value => value !== null && value <= 0);
  const lcd = copy.lcd;
  const screen1 = nitrogen?.ok
    ? [lcd.blank.replace("{0}", fixed(nitrogen.blankTitreMl)), lcd.sample.replace("{0}", fixed(nitrogen.sampleTitreMl))] as const
    : nitrogen ? [lcd.invalid, inputs.method === "direct_h2so4" ? lcd.direct : lcd.back] as const : [lcd.waiting, ""] as const;
  const screen2 = nitrogen?.ok
    ? [lcd.nitrogen.replace("{0}", fixed(nitrogen.nitrogenKgPerHa)), text[nitrogen.level].toLocaleUpperCase(locale)] as const
    : screen1;

  function applyNitrogen() {
    if (!nitrogen?.ok || !nitrogenFits || nitrogenBlankMl === null || nitrogenSampleTrial1Ml === null) return;
    onApply({
      values: { nitrogenKgPerHa: nitrogen.nitrogenKgPerHaExact, nitrogenLevel: nitrogen.level },
      audit: { nitrogenMethod: inputs.method, nitrogenBlankMl, nitrogenSampleTrial1Ml, nitrogenSampleTrial2Ml },
    }, copy.nitrogen.applied);
  }

  function applyPhosphorus() {
    if (!phosphorus?.ok || phosphorusValue === null || !phosphorusFits || phosphorusAbsorbance === null ||
        phosphorusExtractVolumeMl === null || phosphorusSoilMassG === null) return;
    onApply({
      values: {
        phosphorusKgPerHa: phosphorusValue, phosphorusLevel: phosphorus.level,
        phosphorusBlueIntensity: levelToDefaultBlueIntensity(phosphorus.level),
      },
      audit: {
        phosphorusAbsorbance, phosphorusExtractVolumeMl, phosphorusSoilMassG, phosphorusHaFactor,
        phosphorusConcentrationMgPerL: phosphorus.concentrationMgPerL, phosphorusMgPerKg: phosphorus.phosphorusMgPerKg,
        tcs3200RawUs: undefined, tcs3200LowBUs: undefined, tcs3200HighBUs: undefined, tcs3200RelativeScore: undefined,
      },
    }, copy.phosphorus.applied);
  }

  function applyOptical() {
    if (optical?.status !== "calibrated" || !pulses || !calibration) return;
    onApply({
      values: { phosphorusBlueIntensity: optical.blueIntensity1To5 },
      audit: {
        tcs3200RawUs: { r: pulses.rUs, g: pulses.gUs, b: pulses.bUs },
        tcs3200LowBUs: calibration.lowBUs, tcs3200HighBUs: calibration.highBUs, tcs3200RelativeScore: optical.score0To100,
      },
    }, copy.optical.applied);
  }

  return <div className="space-y-4">
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-forest/20 bg-forest/5 p-3 text-forest">
      <h3 className="font-bold">{copy.regionalPreset.title}</h3>
      <button type="button" className="button-secondary press min-h-12 min-w-12" disabled={disabled} onClick={onLoadPreset}>
        {copy.regionalPreset.name}
      </button>
    </section>
    <ProvenanceBadge provenance="you_entered" locale={locale} />
    <fieldset disabled={disabled} className="min-w-0 space-y-3 rounded-xl border border-border-strong p-4">
      <legend className="px-1 font-bold">{copy.nitrogen.title}</legend>
      <RadioChoices<NitrogenMethod> label={copy.nitrogen.method} value={inputs.method}
        options={[{ value: "direct_h2so4", label: copy.nitrogen.direct_h2so4 }, { value: "back_titration_naoh", label: copy.nitrogen.back_titration_naoh }]}
        onChange={method => onChange({ method })} disabled={disabled} />
      <div className="grid gap-3 sm:grid-cols-3">
        {input("blank", copy.nitrogen.blank, 0)}{input("trial1", copy.nitrogen.trial1, 0)}{input("trial2", copy.nitrogen.trial2, 0)}
      </div>
      {nitrogen?.ok && <Readout rows={[
        [copy.nitrogen.sample, unit(copy.units.ml, nitrogen.sampleTitreMl)],
        [copy.nitrogen.corrected, unit(copy.units.ml, nitrogen.correctedTitreMl)],
        [copy.nitrogen.result, `${copy.units.kgPerHa.replace("{0}", fixed(nitrogen.nitrogenKgPerHa))} · ${text[nitrogen.level]}`],
      ]} />}
      <LcdPreview locale={locale} screen1={screen1} screen2={screen2} invalid={nitrogen?.ok === false} />
      {!nitrogenFits && <p role="status" className="notice">{copy.outOfBounds.replace("{0}", number(2000))}</p>}
      <button type="button" disabled={!nitrogen?.ok || !nitrogenFits} onClick={applyNitrogen}
        className="button-primary press min-h-12 min-w-12">{copy.nitrogen.apply}</button>
    </fieldset>
    <fieldset disabled={disabled} className="min-w-0 space-y-3 rounded-xl border border-border-strong p-4">
      <legend className="px-1 font-bold">{copy.phosphorus.title}</legend>
      <div className="grid gap-3 sm:grid-cols-3">
        {input("absorbance", copy.phosphorus.absorbance)}{input("volume", copy.phosphorus.volume, 0)}{input("mass", copy.phosphorus.mass, 0)}
      </div>
      <p className="text-sm font-semibold">{copy.phosphorus.factor}</p>
      <RadioChoices label={copy.phosphorus.factor} value={inputs.factor} options={[
        { value: String(OLSEN_PHOSPHORUS_DEFAULTS.haFactor), label: copy.phosphorus.standard },
        { value: "2.24", label: copy.phosphorus.alternate },
      ]} onChange={factor => onChange({ factor })} disabled={disabled} />
      {phosphorus?.ok && phosphorusValue !== null && <Readout rows={[
        [copy.phosphorus.concentration, unit(copy.units.mgPerL, phosphorus.concentrationMgPerL, 3)],
        [copy.phosphorus.soil, unit(copy.units.mgPerKg, phosphorus.phosphorusMgPerKg)],
        [copy.phosphorus.result, `${copy.units.kgPerHa.replace("{0}", fixed(phosphorusValue))} · ${text[phosphorus.level]}`],
      ]} />}
      {phosphorus?.ok === false && <p role="status" className="notice">
        {phosphorus.error === "below_intercept"
          ? copy.phosphorus.belowIntercept.replace("{0}", number(OLSEN_PHOSPHORUS_DEFAULTS.intercept, 3)) : copy.phosphorus.invalid}
      </p>}
      {!phosphorusFits && <p role="status" className="notice">{copy.outOfBounds.replace("{0}", number(500))}</p>}
      <button type="button" disabled={!phosphorus?.ok || !phosphorusFits} onClick={applyPhosphorus}
        className="button-primary press min-h-12 min-w-12">{copy.phosphorus.apply}</button>
    </fieldset>
    <fieldset disabled={disabled} className="min-w-0 space-y-3 rounded-xl border border-border-strong p-4">
      <legend className="px-1 font-bold">{copy.optical.title}</legend>
      <p className="inline-block rounded-full bg-warning-subtle px-3 py-1 text-sm font-semibold text-on-warning-subtle">{copy.optical.badge}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        {input("r", copy.optical.r, 0)}{input("g", copy.optical.g, 0)}{input("b", copy.optical.b, 0)}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">{input("low", copy.optical.low, 0)}{input("high", copy.optical.high, 0)}</div>
      <div role="status" className="text-sm leading-body">
        {timeout ? <p className="notice">{copy.optical.timeout}</p>
          : optical?.status === "calibrated" ? <>
            <p className="font-bold">{copy.optical.score.replace("{0}", number(optical.score0To100)).replace("{1}", number(optical.blueIntensity1To5))}</p>
            {optical.outOfRange && <p>{optical.outOfRange === "low" ? copy.optical.below : copy.optical.above}</p>}
          </> : <p>{copy.optical.calibration}</p>}
      </div>
      <button type="button" disabled={optical?.status !== "calibrated"} onClick={applyOptical}
        className="button-primary press min-h-12 min-w-12">{copy.optical.apply}</button>
    </fieldset>
  </div>;
}
