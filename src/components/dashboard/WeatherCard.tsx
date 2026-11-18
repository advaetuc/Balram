"use client";

import { z } from "zod";
import { useBalramStore } from "@/store/useBalramStore";
import { WeatherSnapshotSchema } from "@/types/domain";
import { submitProvider, providerErrorMessage } from "@/lib/api/client";
import { formatNumber, resolvedWeatherMetrics, selectedWeatherDay } from "@/lib/ui/format";
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
  const plainWeatherLead = state.locale === "mr"
    ? `पिकांना दररोज सुमारे ${formatNumber(metrics.et0MmPerDay,1,state.locale)} मिमी पाण्याची गरज आहे`
    : `Crops lose about ${formatNumber(metrics.et0MmPerDay)} mm of water per day`;
  const rainfallKnown = day?.precipitation != null;
  const rainfallSummary = !rainfallKnown
    ? (state.locale === "mr" ? "आजच्या पावसाचा अंदाज उपलब्ध नाही" : "Rainfall forecast unavailable today")
    : metrics.precipitationMm === 0
      ? (state.locale === "mr" ? "आज पावसाची शक्यता नाही" : "No rain expected today")
      : (state.locale === "mr" ? `आज ${formatNumber(metrics.precipitationMm,1,state.locale)} मिमी पाऊस अपेक्षित` : `${formatNumber(metrics.precipitationMm)} mm rain expected today`);
  const source = snapshot?.source ?? "Open-Meteo · not yet fetched";
  const sourceLabel = state.locale === "mr"
    ? source.includes("seasonal baseline") ? "बलराम · महाराष्ट्राचा हंगामी आधार" : source.includes("Open-Meteo") ? "Open-Meteo" : "हवामान सेवा"
    : source;
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
    <div className="mt-4 rounded-xl bg-sky/10 p-4"><h3 className="text-xl font-bold leading-snug text-forest">{plainWeatherLead}</h3><p className="mt-1 text-sm text-stone-600">{state.locale === "mr" ? "संदर्भ बाष्पोत्सर्जन (ET₀)" : "Reference ET₀"}</p><p className="mt-2 text-sm font-semibold">{rainfallSummary}</p></div>
    <div className="mt-5 grid grid-cols-2 gap-4" aria-busy={loading}>
      <div><p className="text-xs text-stone-600">{state.locale === "mr" ? "संदर्भ बाष्पोत्सर्जन (ET₀)" : "Reference ET₀"}</p>
        <p className="mt-1 text-3xl font-semibold tabular-nums">{formatNumber(metrics.et0MmPerDay, 1, state.locale)}</p>
        <p className="text-sm text-stone-600">{state.locale === "mr" ? "मिमी/दिवस" : "mm/day"}</p></div>
      <div><p className="text-xs text-stone-600">{state.locale === "mr" ? "अंदाजित पाऊस" : "Forecast rainfall"}</p>
        <p className="mt-1 text-3xl font-semibold tabular-nums">{rainfallKnown ? formatNumber(metrics.precipitationMm, 1, state.locale) : "—"}</p>
        <p className="text-sm text-stone-600">{state.locale === "mr" ? "मिमी/दिवस" : "mm/day"}</p></div>
    </div>
    <p className="mt-4 text-sm">{metrics.date} · {formatNumber(metrics.temperatureMinC,1,state.locale)} {state.locale==="mr"?"ते":"to"} {formatNumber(metrics.temperatureMaxC,1,state.locale)} °C</p>
    <p className="mt-1 text-xs text-stone-600">{metrics.et0Provenance === "hargreaves-fallback"
      ? (state.locale === "mr" ? "किमान व कमाल तापमानावरून हर्ग्रीव्ह्ज पद्धतीने ET₀ गणना." : "ET₀ calculated from minimum and maximum temperatures using Hargreaves.")
      : metrics.et0Provenance === "maharashtra-baseline" || snapshot?.source.includes("seasonal baseline")
        ? (state.locale === "mr" ? "महाराष्ट्राच्या हंगामी सरासरीवर आधारित नियोजन अंदाज." : "Planning reference from Maharashtra seasonal norms.")
        : snapshot?.provenance === "sample"
          ? (state.locale === "mr" ? "नमुना हवामान माहिती · केवळ उदाहरण." : "Sample weather values · illustrative only.")
          : (state.locale === "mr" ? "प्रादेशिक हवामान अंदाज." : "Regional weather forecast.")}</p>
    {state.weatherStatus.error && <p role="status" className="notice mt-4">{state.weatherSnapshot
      ? (state.locale === "mr" ? "ताजा अंदाज मिळाला नाही; जतन केलेला अंदाज वापरत आहोत." : `Live refresh failed; continuing with the saved weather snapshot. ${state.weatherStatus.error}`)
      : (state.locale === "mr" ? text.weatherError : state.weatherStatus.error)}</p>}
    <button className="button-secondary mt-5 min-h-12 w-full" disabled={!state.hydrated || !state.fieldGeometry || loading || state.sampleDataActive}
      onClick={() => void update()}>{loading ? text.weatherLoading : (state.locale === "mr" ? "ताजा हवामान अंदाज घ्या" : "Refresh live weather")}</button>
    <p className="mt-2 text-xs leading-5 text-stone-600">{state.locale === "mr" ? "अंदाज मागवल्यावर शेताच्या केंद्राचे अंदाजे निर्देशांक Open-Meteo कडे पाठवले जातात." : "This sends your field&apos;s approximate center to Open-Meteo when you request an update."}</p>
    {snapshot && <details className="mt-3"><summary>{state.locale === "mr" ? "७ दिवसांचा सविस्तर अंदाज" : "Forecast details"}</summary>
      <ul className="divide-y divide-forest/10 text-sm">{snapshot.daily.map((item) => {const itemEt0=resolveDailyEt0(item,state.fieldGeometry?.center[1]??18.5204,snapshot.source)?.et0MmPerDay??4.5;return <li key={item.date} className="py-3">
        <strong>{item.date}</strong><p>ET₀: {formatNumber(itemEt0,1,state.locale)} {state.locale==="mr"?"मिमी/दिवस":"mm/day"}
          {" · "}{state.locale==="mr"?"पाऊस":"Rain"}: {formatNumber(item.precipitation??0,1,state.locale)} {state.locale==="mr"?"मिमी":"mm"}</p>
      </li>})}</ul><p className="text-xs leading-5">{state.locale==="mr"?"हा प्रादेशिक हवामान नमुना आहे; शेतातील मोजमाप नाही. तापमान उपलब्ध असल्यास दैनिक ET₀ साठी हर्ग्रीव्ह्ज गणना वापरली जाते; उर्वरित त्रुटींसाठी महाराष्ट्राचा नियोजन आधार वापरला जातो. या सेवेकडून नमुना चालवण्याची वेळ दिली जात नाही.":"Regional weather model, not a field sensor. Missing daily ET₀ uses Hargreaves when temperatures are present; remaining gaps use the Maharashtra planning reference. Model-run time is not supplied by this provider."}</p>
    </details>}
    <DataCaption source={sourceLabel} validAt={day ? `${day.date}T00:00:00+05:30` : snapshot?.validFrom ?? null}
      fetchedAt={snapshot?.fetchedAt ?? null} modeled={snapshot?.provenance === "modelled"} sample={state.sampleDataActive}
      stale={state.weatherStale} offline={state.connection === "offline"} />
  </Card>;
}
