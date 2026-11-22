"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { getCropStageKc, MaharashtraCropMatrix, type CropId } from "@/config/cropMatrix";
import { cropLabel, t } from "@/config/i18n";
import { ProvenanceBadge } from "@/components/ui/ProvenanceBadge";
import { RadioChoices } from "@/components/ui/RadioChoices";
import { VizCaption } from "@/components/viz/VizCaption";
import { VizTable } from "@/components/viz/VizTable";
import { WaterDayColumn, type WaterRibbonDay } from "@/components/viz/WaterDayColumn";
import { allocatePlotsByGunthas } from "@/lib/domain/allocation";
import { GUNTHAS_PER_ACRE } from "@/lib/domain/geometry";
import { calculatePhaseWaterBreakdown, calculateSystemRuntime, resolveDailyEt0 } from "@/lib/domain/irrigation";
import { buildWaterRibbon } from "@/lib/domain/viz/waterRibbon";
import { displayPlotName, formatArea } from "@/lib/domain/landUnits";
import { formatNumber } from "@/lib/ui/format";
import { useBalramStore } from "@/store/useBalramStore";
import { growthToLifecycleStage, type CropAllocation, type IrrigationSetup, type WeatherSnapshot } from "@/types/domain";

type RainScale = NonNullable<Parameters<typeof buildWaterRibbon>[0]["rainScalePercent"]>;
const RAIN_SCALES = [100, 75, 50, 25] as const;
const EM_DASH = "—";

function estimateDayRuntime(day: WaterRibbonDay, snapshot: WeatherSnapshot, plot: CropAllocation,
  areaGunthas: number | null, latitudeDeg: number, setup: IrrigationSetup | null) {
  if (day.netNeedMm === null || day.scaledRainMm === null || setup?.method === "rainfed") return null;
  if (!areaGunthas || !Object.hasOwn(MaharashtraCropMatrix, plot.cropId)) return null;
  const inputDay = snapshot.daily.find(entry => entry.date === day.date);
  const et0 = resolveDailyEt0(inputDay ?? null, latitudeDeg, snapshot.source)?.et0MmPerDay;
  if (et0 === undefined) return null;

  const cropId = plot.cropId as CropId;
  if (setup?.flowConfirmedByFarmer && setup.systemFlowLitresPerHour !== null && setup.applicationEfficiency !== null) {
    return {
      minutes: calculateSystemRuntime({
        et0, cropKc: getCropStageKc(cropId, plot.lifecycleStage ?? plot.growthStage),
        areaAcres: areaGunthas / GUNTHAS_PER_ACRE, effectiveRainfallMm: day.scaledRainMm,
        systemFlowLitresPerHour: setup.systemFlowLitresPerHour, applicationEfficiency: setup.applicationEfficiency,
        inputsConfirmedByFarmer: true,
      }).runtimeMinutes,
      basis: "savedSystem" as const,
    };
  }

  // Legacy plots without a known stage can show a depth estimate with their base Kc.
  // A delivery-preset runtime needs a phase with an explicit coefficient.
  if (!plot.lifecycleStage && plot.growthStage === "unknown") return null;
  const stage = plot.lifecycleStage ?? growthToLifecycleStage(plot.growthStage);
  const deliveryMethod = setup?.method === "sprinkler" ? "sprinkler" : setup?.method === "surface" ? "canal_flood" : "drip";
  const phase = calculatePhaseWaterBreakdown({
    cropId, areaGunthas, baseEt0MmPerDay: et0, effectiveRainfallMmPerDay: day.scaledRainMm, deliveryMethod,
  }).find(entry => entry.stage === stage);
  return phase ? { minutes: phase.dailyRuntimeMinutes, basis: deliveryMethod } : null;
}

export function WaterRibbon({ compact = false, selectedPlotId }: { compact?: boolean; selectedPlotId?: string }) {
  const { weatherSnapshot, cropAllocations, fieldGeometry, connection, locale, landUnit, sampleDataActive, irrigationSetup, now } =
    useBalramStore(state => state);
  const [rainScale, setRainScale] = useState<RainScale>(100);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const dialogId = useId();
  const titleId = useId();
  const dictionary = t(locale);
  const text = dictionary.viz.waterRibbon;
  const dateLocale = locale === "mr" ? "mr-IN" : "en-IN";
  const formatters = useMemo(() => ({
    full: new Intl.DateTimeFormat(dateLocale, { dateStyle: "full", timeZone: "Asia/Kolkata" }),
    weekday: new Intl.DateTimeFormat(dateLocale, { weekday: "short", timeZone: "Asia/Kolkata" }),
    day: new Intl.DateTimeFormat(dateLocale, { day: "numeric", timeZone: "Asia/Kolkata" }),
    saved: new Intl.DateTimeFormat(dateLocale, { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }),
    relative: new Intl.RelativeTimeFormat(dateLocale, { numeric: "auto" }),
    percent: new Intl.NumberFormat(dateLocale, { style: "percent" }),
  }), [dateLocale]);

  const index = Math.max(0, cropAllocations.findIndex((plot, index) =>
    (plot.plotId ?? `${plot.cropId}-${index}`) === selectedPlotId));
  const plot = cropAllocations[index];
  const latitudeDeg = fieldGeometry?.center[1] ?? weatherSnapshot?.coordinate[1] ?? 18.5204;
  const rainScalePercent = compact ? 100 : rainScale;
  const days = useMemo(() => weatherSnapshot && plot
    ? buildWaterRibbon({ weatherSnapshot, plot, latitudeDeg, rainScalePercent })
    : [], [weatherSnapshot, plot, latitudeDeg, rainScalePercent]);
  const selectedDay = days.find(day => day.date === selectedDate);

  useEffect(() => {
    const element = dialog.current;
    if (!element) {
      if (selectedDate !== null) setSelectedDate(null);
      trigger.current = null;
      return;
    }
    if (selectedDay && !element.open) {
      element.showModal();
      closeButton.current?.focus();
    } else if (!selectedDay && element.open) {
      element.close();
    }
  }, [selectedDate, selectedDay]);

  function openDay(date: string, button: HTMLButtonElement) {
    trigger.current = button;
    setSelectedDate(date);
  }

  function restoreFocus() {
    setSelectedDate(null);
    if (trigger.current?.isConnected) trigger.current.focus({ preventScroll: true });
    trigger.current = null;
  }

  if (!plot) return null;
  if (!weatherSnapshot || days.length === 0) return <p className="mt-3 text-sm leading-body">{text.noWeather}</p>;

  const provenance = days[0].provenance;
  const typical = provenance === "typical_season";
  const sampled = sampleDataActive || provenance === "sample";
  const badge = sampled ? "sample" : typical ? "estimated" : "forecast";
  const sourceLabel = dictionary.viz.weatherProvenance[provenance];
  const sourceRain = sampled ? text.sampleRain : typical ? text.typicalRain : text.forecastRain;
  const originalRainOption = sampled ? text.rainAsSample : typical ? text.rainAsTypical : text.rainAsForecast;
  const illustrative = days.some(day => day.illustrative);
  const rainLabel = illustrative ? text.scaledRain : text.rain;
  const scaleMaxMm = Math.max(1, ...days.flatMap(day => [day.rainMm ?? 0, day.cropNeedMm ?? 0]));
  const areaGunthas = allocatePlotsByGunthas(cropAllocations, fieldGeometry?.areaSquareMetres ?? null).plots[index].areaGunthas;
  const name = displayPlotName(plot.plotName, locale, index + 1);
  const crop = Object.hasOwn(dictionary.cropNames, plot.cropId) ? cropLabel(locale, plot.cropId as CropId) : dictionary.crop;
  const plotLabel = [name, crop, areaGunthas === null ? null : formatArea(areaGunthas, landUnit, locale)].filter(Boolean).join(" · ");
  const date = (iso: string) => new Date(`${iso}T00:00:00Z`);
  const depth = (value: number | null) => value === null ? EM_DASH : `${formatNumber(value, 1, locale)} mm`;
  const temperature = (value: number | null) => value === null ? EM_DASH : `${formatNumber(value, 1, locale)}°C`;
  const irrigation = (day: WaterRibbonDay) => day.netNeedMm === null ? text.unavailable : day.irrigate ? text.irrigate : text.noIrrigation;
  const runtime = selectedDay ? estimateDayRuntime(selectedDay, weatherSnapshot, plot, areaGunthas, latitudeDeg, irrigationSetup) : null;
  const runtimeBasis = runtime ? {
    savedSystem: text.savedSystem, drip: text.dripPreset, sprinkler: text.sprinklerPreset, canal_flood: text.surfacePreset,
  }[runtime.basis] : irrigationSetup?.method === "rainfed" ? text.rainfed : null;
  const elapsedHours = now === null ? null : (now - Date.parse(weatherSnapshot.fetchedAt)) / 3_600_000;
  const age = elapsedHours === null || elapsedHours < 0 ? null :
    elapsedHours >= 24 ? formatters.relative.format(-Math.floor(elapsedHours / 24), "day")
      : formatters.relative.format(-Math.floor(elapsedHours), "hour");

  return <figure className="mt-3 min-w-0 space-y-3">
    <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <h3 className="text-base font-bold leading-heading text-forest">{text.title}</h3>
      <p className="text-sm leading-body [overflow-wrap:anywhere]">{plotLabel}</p>
    </div>
    {connection === "offline" && <p className="text-sm leading-body">
      {text.offlineSaved} · {formatters.saved.format(new Date(weatherSnapshot.fetchedAt))}{age ? ` · ${age}` : ""}
    </p>}
    {!compact && <RadioChoices<RainScale> label={text.rainScenario} value={rainScalePercent} onChange={setRainScale}
      segmented
      className="grid grid-cols-3 gap-1 rounded-xl border border-border-strong bg-surface-muted p-1 print:hidden sm:grid-cols-4 [&>div:first-child]:col-span-3 sm:[&>div:first-child]:col-span-1 [&_input:checked+label]:bg-forest [&_input:checked+label]:text-white"
      options={RAIN_SCALES.map(value => ({
        value, label: value === 100 ? `${originalRainOption} · ${formatters.percent.format(1)}` : formatters.percent.format(value / 100),
      }))} />}
    {illustrative && <p role="status" className="rounded-lg bg-amber px-3 py-2 text-sm font-bold leading-body text-ink">
      {text.illustrative} · {formatters.percent.format(rainScalePercent / 100)}
    </p>}
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm leading-body">
      <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="size-3 rounded-sm bg-info" />{rainLabel}</span>
      <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-0.5 w-4 bg-forest" />{text.cropNeed}</span>
    </div>
    <div className={`grid gap-2 print:hidden ${compact ? "grid-cols-4 sm:grid-cols-7" : "grid-cols-2 sm:grid-cols-4 lg:grid-cols-7"}`}>
      {days.map(day => {
        const dayDate = date(day.date);
        const label = [formatters.full.format(dayDate), sourceLabel, day.illustrative ? text.illustrative : null,
          `${text.maxTemp} ${temperature(day.tempMax)}`, `${day.illustrative ? text.scaledRain : text.rain} ${depth(day.scaledRainMm)}`,
          `${text.cropNeed} ${depth(day.cropNeedMm)}`, irrigation(day), day.heavyRainCaution ? text.fertiliser : null].filter(Boolean).join(" · ");
        return <WaterDayColumn key={day.date} day={day} locale={locale} scaleMaxMm={scaleMaxMm} label={label}
          weekday={formatters.weekday.format(dayDate)} dateLabel={formatters.day.format(dayDate)}
          temperatureLabel={temperature(day.tempMax)} rainLabel={depth(day.scaledRainMm)} dialogId={dialogId} onOpen={openDay} />;
      })}
    </div>
    {!compact && <VizTable locale={locale} caption={text.title}
      columns={[text.day, `${rainLabel} (mm)`, `${text.cropNeed} (mm)`, text.irrigationQuestion]}
      rows={days.map(day => [formatters.full.format(date(day.date)), day.scaledRainMm === null ? EM_DASH : formatNumber(day.scaledRainMm, 1, locale),
        day.cropNeedMm === null ? EM_DASH : formatNumber(day.cropNeedMm, 1, locale),
        day.heavyRainCaution ? `${irrigation(day)} · ${text.fertiliser}` : irrigation(day)])} />}
    <VizCaption summary={typical ? text.typicalSeason : text.planning} provenance={badge} locale={locale} />

    <dialog ref={dialog} id={dialogId} aria-labelledby={titleId} onClose={restoreFocus}
      className="sheet fixed inset-x-0 bottom-0 top-auto mx-auto mb-0 mt-auto max-h-[90dvh] w-full max-w-[560px] flex-col overflow-hidden rounded-t-2xl bg-white text-ink shadow-sheet open:flex print:hidden">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-forest/15 p-3">
        <h4 id={titleId} className="text-lg font-bold leading-heading text-forest">{selectedDay ? formatters.full.format(date(selectedDay.date)) : text.title}</h4>
        <form method="dialog"><button type="submit" ref={closeButton} className="button-secondary">{dictionary.close}</button></form>
      </div>
      {selectedDay && <div className="min-h-0 space-y-3 overflow-y-auto overscroll-contain p-3 pb-[max(1rem,env(safe-area-inset-bottom))] text-sm leading-body">
        <p className="[overflow-wrap:anywhere]">{plotLabel}</p>
        <div className="flex flex-wrap items-center gap-2">
          <ProvenanceBadge provenance={badge} locale={locale} />
          {typical && <span>{text.typicalSeason}</span>}
        </div>
        {selectedDay.illustrative && <p className="rounded-lg bg-amber px-3 py-2 font-bold text-ink">{text.illustrative}</p>}
        <dl className="divide-y divide-forest/15">
          {[
            [text.minTemp, temperature(selectedDay.tempMin)], [text.maxTemp, temperature(selectedDay.tempMax)],
            [sourceRain, depth(selectedDay.rainMm)],
            ...(selectedDay.illustrative ? [[text.scaledRain, depth(selectedDay.scaledRainMm)]] : []),
            [text.cropNeed, depth(selectedDay.cropNeedMm)], [text.netDepth, depth(selectedDay.netNeedMm)],
            [text.runtime, runtime ? `${formatNumber(runtime.minutes, 1, locale)} ${text.minutes}` : EM_DASH],
          ].map(([label, value]) => <div key={label} className="flex flex-wrap items-baseline justify-between gap-x-2 py-1.5">
            <dt>{label}</dt><dd className="font-semibold tabular-nums">{value}</dd>
          </div>)}
        </dl>
        {runtimeBasis && <p>{runtimeBasis}</p>}
        {selectedDay.heavyRainCaution && <p className="notice"><strong>{text.fertiliser}</strong> · {text.fertiliserAdvice}</p>}
        <p>{text.planning}</p>
      </div>}
    </dialog>
  </figure>;
}
