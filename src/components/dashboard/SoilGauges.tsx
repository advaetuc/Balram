"use client";

import { useId, useRef, useState } from "react";
import { BulletGauge, type BulletGaugeZone } from "@/components/viz/BulletGauge";
import { VizCaption } from "@/components/viz/VizCaption";
import { VizTable } from "@/components/viz/VizTable";
import { cropLabel, t } from "@/config/i18n";
import { indiaDate } from "@/lib/domain/calendar";
import { getSeasonalCropRecommendations } from "@/lib/domain/cropRecommendations";
import { buildSoilGauges } from "@/lib/domain/viz/gaugeZones";
import { formatNumber } from "@/lib/ui/format";
import { describeSoilReadout, formatSoilNutrient } from "@/lib/ui/soilReadout";
import { useBalramStore } from "@/store/useBalramStore";
import type { Locale, SoilKitReading, WeatherSnapshot } from "@/types/domain";

type GaugeGeometry = ReturnType<typeof buildSoilGauges>["ph" | "nitrogen" | "phosphorus"];
type Band = GaugeGeometry["zones"][number]["band"];

const statusByBand: Record<Band, BulletGaugeZone["status"]> = {
  strongly_acidic: "needs_help",
  slightly_acidic: "fair",
  optimal_neutral: "good",
  moderately_alkaline: "fair",
  strongly_alkaline: "needs_help",
  low: "fair",
  medium: "good",
  high: "good",
};

export function describeGauge(
  gauge: GaugeGeometry, value: number | null, locale: Locale, label: string, unit?: string,
) {
  const text = t(locale).viz.soilGauges;
  const zones = gauge.zones.map(({ min, max, band }) => {
    const from = formatNumber(min, 1, locale);
    const to = formatNumber(max, 1, locale);
    // Use the same strict/inclusive boundaries as the soil interpretation and lab classifiers.
    const threshold = {
      strongly_acidic: `${from} ≤ pH < ${to}`,
      slightly_acidic: `${from} ≤ pH < ${to}`,
      optimal_neutral: `${from} ≤ pH ≤ ${to}`,
      moderately_alkaline: `${from} < pH ≤ ${to}`,
      strongly_alkaline: `${from} < pH ≤ ${to}`,
      low: `< ${to} ${unit}`,
      medium: `${from}–${to} ${unit}`,
      high: `> ${from} ${unit}`,
    }[band];
    return { min, max, threshold, label: text.bands[band], status: statusByBand[band] };
  });
  const pinLabel = value === null ? null : formatSoilNutrient(value, locale);
  return {
    ...gauge, locale, label, unit, zones, pinLabel,
    aboveScale: value !== null && value > gauge.max,
  };
}

function SoilGaugeResult({ saved, weatherSnapshot, now, locale, sampleDataActive }: {
  saved: SoilKitReading;
  weatherSnapshot: WeatherSnapshot | null;
  now: number | null;
  locale: Locale;
  sampleDataActive: boolean;
}) {
  const [whatIfPh, setWhatIfPh] = useState<number | null>(null);
  const controlsTitle = useRef<HTMLHeadingElement>(null);
  const headingId = useId();
  const controlsId = useId();
  const dictionary = t(locale);
  const text = dictionary.viz.soilGauges;
  const { moisture, blue, optical } = describeSoilReadout(saved, locale);
  const savedGauges = buildSoilGauges(saved);
  const activeReading = whatIfPh === null ? saved : { ...saved, ph: whatIfPh };
  const ph = describeGauge(savedGauges.ph, saved.ph, locale, text.ph);
  const nitrogen = describeGauge(savedGauges.nitrogen, saved.nitrogenKgPerHa, locale, text.nitrogen, "kg/ha");
  const phosphorus = describeGauge(savedGauges.phosphorus, saved.phosphorusKgPerHa, locale, text.phosphorus, "kg/ha");
  const trialPh = whatIfPh === null ? null
    : describeGauge(buildSoilGauges(activeReading).ph, activeReading.ph, locale, text.ph);
  const today = indiaDate(now);
  const monthZeroIndexed = today === null ? 9 : Number(today.slice(5, 7)) - 1;
  const recommendations = whatIfPh === null ? [] : getSeasonalCropRecommendations({
    monthZeroIndexed, soilKitReading: activeReading, weatherSnapshot,
  }).slice(0, 3);

  function adjustPh(step: -1 | 1) {
    const bound = step === -1 ? savedGauges.ph.min : savedGauges.ph.max;
    if (activeReading.ph === bound) return;
    setWhatIfPh(current => Math.min(savedGauges.ph.max, Math.max(savedGauges.ph.min,
      Number(((current ?? saved.ph) + step / 10).toFixed(10)))));
  }

  function resetPh() {
    setWhatIfPh(null);
    controlsTitle.current?.focus({ preventScroll: true });
  }

  const rows = [ph, nitrogen, phosphorus].map(gauge => {
    const zone = gauge.zones[gauge.highlightedBandIndex];
    const reading = gauge.pinLabel === null ? text.chosen.replace("{0}", zone.label)
      : gauge.unit ? `${gauge.pinLabel} ${gauge.unit}` : gauge.pinLabel;
    const details = gauge === phosphorus && blue ? `${reading} · ${blue.label} ${blue.result}` : reading;
    return [gauge.label, details, `${zone.label} · ${dictionary.viz.status[zone.status]}`, zone.threshold];
  });
  if (moisture) rows.push([moisture.label, moisture.result, moisture.band, moisture.threshold]);

  return <figure aria-labelledby={headingId} className="mt-5 min-w-0 space-y-3">
    <h3 id={headingId} className="text-xl font-bold leading-heading text-forest">{text.title}</h3>
    {saved.regionalPreset && <p className="text-sm font-semibold text-forest">{dictionary.soilLab.regionalPreset.source}</p>}
    {moisture && <p className="flex flex-wrap gap-x-2 rounded-lg border border-border-strong bg-daylight px-3 py-2 text-sm">
      <span className="font-semibold">{moisture.label}</span>
      <span className="tabular-nums">{moisture.result}</span>
    </p>}
    <div className={trialPh ? "hidden print:block" : undefined}>
      <BulletGauge {...ph} sample={sampleDataActive} />
    </div>
    <section aria-labelledby={controlsId} className="space-y-3 rounded-xl border border-border-strong bg-surface-bg p-3 print:hidden">
      <h4 id={controlsId} ref={controlsTitle} tabIndex={-1} className="font-bold text-forest">{text.tryPh}</h4>
      <div role="group" aria-label={text.tryPh} className="flex flex-wrap items-center gap-2">
        <button type="button" className="button-secondary min-h-12 min-w-12" aria-label={dictionary.phDecrease}
          aria-disabled={activeReading.ph <= savedGauges.ph.min} onClick={() => adjustPh(-1)}>{text.decrease}</button>
        <output className="min-w-12 text-center text-lg font-bold tabular-nums text-ink">
          {formatNumber(activeReading.ph, 2, locale)}
        </output>
        <button type="button" className="button-secondary min-h-12 min-w-12" aria-label={dictionary.phIncrease}
          aria-disabled={activeReading.ph >= savedGauges.ph.max} onClick={() => adjustPh(1)}>{text.increase}</button>
        {whatIfPh !== null && <button type="button" className="button-secondary min-h-12 min-w-12"
          onClick={resetPh}>{text.reset}</button>}
      </div>
      {trialPh && <div className="space-y-3">
        <p className="inline-flex rounded-lg bg-amber px-3 py-2 text-sm font-bold leading-body text-ink">{text.whatIf}</p>
        <BulletGauge {...trialPh} sample={sampleDataActive} />
        <div>
          <h5 className="font-bold leading-heading text-forest">{text.topCrops}</h5>
          <ol className="mt-2 list-decimal space-y-2 pl-6 text-sm leading-body">
            {recommendations.map(({ cropId, badgeLabel, tier }) => <li key={cropId}>
              <span className="inline-flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <b>{cropLabel(locale, cropId)}</b>
                <span className={`rounded-lg px-2 py-0.5 font-semibold ${tier === "best_match"
                  ? "bg-success-subtle text-on-success-subtle" : "bg-warning-subtle text-on-warning-subtle"}`}>{badgeLabel[locale]}</span>
              </span>
            </li>)}
          </ol>
        </div>
      </div>}
    </section>
    <BulletGauge {...nitrogen} sample={sampleDataActive} />
    <BulletGauge {...phosphorus} sample={sampleDataActive} />
    {blue && saved.phosphorusKgPerHa === null && <p className="text-sm">
      <b>{blue.label}</b> · {blue.result}
    </p>}
    {optical && <p className="text-sm">{dictionary.soilLab.savedOpticalNote}</p>}
    <VizTable locale={locale} caption={text.tableCaption}
      columns={[text.parameter, text.result, text.zone, text.threshold]} rows={rows} />
    <VizCaption summary={text.caption} provenance={sampleDataActive ? "sample" : "measured_by_kit"} locale={locale} />
  </figure>;
}

export function SoilGauges() {
  const { saved, weatherSnapshot, now, locale, sampleDataActive } = useBalramStore(
    ({ soilKitReading, weatherSnapshot, now, locale, sampleDataActive }) =>
      ({ saved: soilKitReading, weatherSnapshot, now, locale, sampleDataActive }),
  );
  if (!saved) return null;
  // A replacement or restored soil test starts with its own measured pH.
  return <SoilGaugeResult key={`${sampleDataActive}:${JSON.stringify(saved)}`} saved={saved}
    weatherSnapshot={weatherSnapshot} now={now} locale={locale} sampleDataActive={sampleDataActive} />;
}
