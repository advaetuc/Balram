"use client";

import { z } from "zod";
import { useLayoutEffect, useRef, useState } from "react";
import { useBalramStore } from "@/store/useBalramStore";
import { WeatherSnapshotSchema } from "@/types/domain";
import { submitProvider, providerErrorMessage } from "@/lib/api/client";
import { formatNumber, resolvedWeatherMetrics, selectedWeatherDay } from "@/lib/ui/format";
import { ProvenanceBadge } from "@/components/ui/ProvenanceBadge";
import { Card, DataCaption } from "./Card";
import { t } from "@/config/i18n";
import { createRegionalBaselineWeatherSnapshot, resolveDailyEt0 } from "@/lib/domain/irrigation";

export function WeatherCard() {
  const state = useBalramStore((value) => value);
  const text=t(state.locale);
  const snapshot = state.weatherSnapshot;
  const day = selectedWeatherDay(state);
  const metrics = resolvedWeatherMetrics(state);
  const loading = state.weatherStatus.state === "loading";
  const weatherState = state.weatherStatus.state;
  const previousWeatherState = useRef(weatherState);
  const sawInSessionLoading = useRef(loading);
  const [crossfadeActive, setCrossfadeActive] = useState(false);
  const [skeletonLeaving, setSkeletonLeaving] = useState(false);
  useLayoutEffect(() => {
    const previous = previousWeatherState.current;
    previousWeatherState.current = weatherState;
    if (weatherState === "loading") {
      sawInSessionLoading.current = true;
      setCrossfadeActive(false);
      setSkeletonLeaving(false);
      return;
    }
    if (previous !== "loading" || !sawInSessionLoading.current || !["success", "stale"].includes(weatherState)) return;
    sawInSessionLoading.current = false;
    setCrossfadeActive(true);
    setSkeletonLeaving(true);
    const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 200;
    const timeout = window.setTimeout(() => {
      setSkeletonLeaving(false);
      setCrossfadeActive(false);
    }, delay);
    return () => window.clearTimeout(timeout);
  }, [weatherState]);
  const mr = state.locale === "mr";
  const baseline = snapshot?.source.includes("seasonal baseline");
  const precipitation = baseline ? null : day?.precipitation ?? null;
  const rainfallSummary = precipitation === null
    ? (mr ? "निवडलेल्या दिवसाचा पावसाचा अंदाज उपलब्ध नाही." : "Rainfall forecast is unavailable for this day.")
    : precipitation === 0
      ? (mr ? "निवडलेल्या दिवशी पाऊस अपेक्षित नाही." : "No rain is expected on this day.")
      : (mr ? "हा निवडलेल्या दिवशी पडू शकणाऱ्या पावसाचा अंदाज आहे." : "This is how much rain is expected on this day.");
  const provenance = snapshot?.provenance === "sample" ? "sample"
    : metrics.et0Provenance === "open-meteo" ? "forecast" : "estimated";
  const source = snapshot?.source ?? "Open-Meteo · not yet fetched";
  const sourceLabel = state.locale === "mr"
    ? source.includes("seasonal baseline") ? "बलराम · महाराष्ट्राचा हंगामी आधार" : source.includes("Open-Meteo") ? "ओपन-मेटिओ" : "हवामान सेवा"
    : source;
  const metricsContent = <div className="space-y-3 rounded-xl bg-surface-muted p-4">
    <ProvenanceBadge locale={state.locale} provenance={provenance} />
    <dl className="grid gap-4 sm:grid-cols-2">
      <div>
        <dt className="text-sm font-semibold leading-body">{mr ? "संदर्भ बाष्पोत्सर्जन (ET₀)" : "Reference ET₀"}</dt>
        <dd className="mt-1 text-3xl font-semibold leading-heading tabular-nums">{formatNumber(metrics.et0MmPerDay, 1, state.locale)}
          <span className="ml-2 text-sm leading-body">{mr ? "मिमी/दिवस" : "mm/day"}</span></dd>
        <dd className="mt-1 text-sm leading-body">{mr ? "हवेमुळे दररोज किती पाणी कमी होऊ शकते याचा हा संदर्भ आहे." : "This is a reference for how much water the weather can draw from soil and plants each day."}</dd>
      </div>
      <div>
        <dt className="text-sm font-semibold leading-body">{mr ? "अंदाजित पाऊस" : "Forecast rainfall"}</dt>
        <dd className="mt-1 text-3xl font-semibold leading-heading tabular-nums">{precipitation === null ? "—" : formatNumber(precipitation, 1, state.locale)}
          {precipitation !== null && <span className="ml-2 text-sm leading-body">{mr ? "मिमी" : "mm"}</span>}</dd>
        <dd className="mt-1 text-sm leading-body">{rainfallSummary}</dd>
      </div>
    </dl>
  </div>;
  async function update() {
    const field = state.fieldGeometry;
    if (!field) return;
    const request = state.beginWeatherRequest();
    try {
      const result = await submitProvider("/api/weather", { intent: "forecast", fieldId: field.fieldId,
        latitude: field.center[1], longitude: field.center[0] }, z.object({ snapshot: WeatherSnapshotSchema }), request.signal);
      state.commitWeatherRequest(request, result.data.snapshot, result.cached);
    } catch (error) {
      if (!request.signal.aborted) {
        if (state.weatherSnapshot === null) {
          const baseline=createRegionalBaselineWeatherSnapshot({fieldId:field.fieldId,coordinate:field.center,nowMs:state.now});
          if (state.commitWeatherRequest(request,baseline,false)) return;
        }
        state.failWeatherRequest(request, providerErrorMessage(error, "Weather", state.locale));
      }
    }
  }
  return <Card id="weather" title={text.weather} eyebrow={text.conditions}>
    <div aria-busy={loading} className={`mt-4 ${crossfadeActive && !loading ? "crossfade-stack" : ""}`}>
      {!loading && <div key="weather-metrics" className={crossfadeActive ? "rise-in" : ""}>{metricsContent}</div>}
      {(loading || skeletonLeaving) && <div key="weather-skeleton" aria-hidden="true" data-state={loading ? undefined : "leaving"} className="skeleton rounded-xl bg-surface-muted p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="h-20 rounded-lg bg-forest/5" />
          <div className="h-20 rounded-lg bg-forest/5" />
        </div>
      </div>}
    </div>
    {day && <p className="mt-4 text-sm leading-body">{day.date} · {day.temperatureMin === null ? "—" : formatNumber(day.temperatureMin, 1, state.locale)} {mr ? "ते" : "to"} {day.temperatureMax === null ? "—" : formatNumber(day.temperatureMax, 1, state.locale)} °C</p>}
    <p className="mt-1 text-sm leading-body text-stone-600">{snapshot?.provenance === "sample"
      ? (mr ? "नमुना हवामान माहिती · केवळ उदाहरण." : "Sample weather values · illustrative only.")
      : metrics.et0Provenance === "hargreaves-fallback"
        ? (mr ? "किमान व कमाल तापमानावरून हर्ग्रीव्ह्ज पद्धतीने ET₀ गणना." : "ET₀ calculated from minimum and maximum temperatures using Hargreaves.")
        : metrics.et0Provenance === "maharashtra-baseline"
          ? (mr ? "महाराष्ट्राच्या हंगामी सरासरीवर आधारित नियोजन अंदाज." : "Planning reference from Maharashtra seasonal norms.")
          : (mr ? "प्रादेशिक हवामान अंदाज." : "Regional weather forecast.")}</p>
    {state.weatherStatus.error && <p role="status" className="notice mt-4">{state.weatherSnapshot
      ? (state.locale === "mr" ? "ताजा अंदाज मिळाला नाही; जतन केलेला अंदाज वापरत आहोत." : `Live refresh failed; continuing with the saved weather snapshot. ${state.weatherStatus.error}`)
      : (state.locale === "mr" ? text.weatherError : state.weatherStatus.error)}</p>}
    <button className="button-secondary mt-5 min-h-12 w-full" disabled={!state.hydrated || !state.fieldGeometry || loading || state.sampleDataActive}
      onClick={() => void update()}>{loading ? text.weatherLoading : (state.locale === "mr" ? "ताजा हवामान अंदाज घ्या" : "Refresh live weather")}</button>
    <p className="mt-2 text-sm leading-body text-stone-600">{state.locale === "mr" ? "अंदाज मागवल्यावर शेताच्या केंद्राचे अंदाजे निर्देशांक ओपन-मेटिओकडे पाठवले जातात." : "This sends your field&apos;s approximate center to Open-Meteo when you request an update."}</p>
    {snapshot && <details className="mt-3"><summary>{state.locale === "mr" ? "७ दिवसांचा सविस्तर अंदाज" : "Forecast details"}</summary>
      <ul className="divide-y divide-forest/10 text-sm leading-body">{snapshot.daily.map((item) => {const itemEt0=resolveDailyEt0(item,state.fieldGeometry?.center[1]??18.5204,snapshot.source)?.et0MmPerDay??4.5;return <li key={item.date} className="py-3">
        <strong>{item.date}</strong><p>ET₀: {formatNumber(itemEt0,1,state.locale)} {state.locale==="mr"?"मिमी/दिवस":"mm/day"}
          {" · "}{state.locale==="mr"?"पाऊस":"Rain"}: {(baseline || item.precipitation === null ? "—" : formatNumber(item.precipitation, 1, state.locale))} {state.locale==="mr"?"मिमी":"mm"}</p>
      </li>})}</ul><p className="text-sm leading-body">{state.locale==="mr"?"हा प्रादेशिक हवामान नमुना आहे; शेतातील मोजमाप नाही. तापमान उपलब्ध असल्यास दैनिक ET₀ साठी हर्ग्रीव्ह्ज गणना वापरली जाते; उर्वरित त्रुटींसाठी महाराष्ट्राचा नियोजन आधार वापरला जातो. या सेवेकडून नमुना चालवण्याची वेळ दिली जात नाही.":"Regional weather model, not a field sensor. Missing daily ET₀ uses Hargreaves when temperatures are present; remaining gaps use the Maharashtra planning reference. Model-run time is not supplied by this provider."}</p>
    </details>}
    <DataCaption source={sourceLabel} validAt={day ? `${day.date}T00:00:00+05:30` : snapshot?.validFrom ?? null}
      fetchedAt={snapshot?.fetchedAt ?? null}
      stale={state.weatherStale} offline={state.connection === "offline"} />
  </Card>;
}
