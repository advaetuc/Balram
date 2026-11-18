"use client";

import { useEffect } from "react";
import { z } from "zod";
import { useBalramStore } from "@/store/useBalramStore";
import { WeatherSnapshotSchema } from "@/types/domain";
import { submitProvider, providerErrorMessage } from "@/lib/api/client";
import { WeatherCard } from "@/components/dashboard/WeatherCard";
import { t } from "@/config/i18n";
import { ProvenanceBadge } from "@/components/ui/ProvenanceBadge";
import { createRegionalBaselineWeatherSnapshot } from "@/lib/domain/irrigation";

export function WeatherStation({ visible = true }: { visible?: boolean }) {
  const state = useBalramStore((value) => value);
  const text = t(state.locale);
  const field = state.fieldGeometry;

  useEffect(() => {
    if (!state.hydrated || !field || state.sampleDataActive || state.sampleOverlayActive ||
        (state.connection === "offline" && state.weatherSnapshot !== null) ||
        (state.weatherSnapshot !== null && !state.weatherStale)) return;
    let cancelled = false;
    const fetchWeather = async () => {
      if (cancelled) return;
      let request: ReturnType<typeof state.beginWeatherRequest>;
      try { request = state.beginWeatherRequest(); }
      catch { return; }
      if (state.connection === "offline") {
        state.commitWeatherRequest(request, createRegionalBaselineWeatherSnapshot({fieldId:field.fieldId,coordinate:field.center,nowMs:state.now}), false);
        return;
      }
      try {
        const result = await submitProvider("/api/weather", {
          intent: "forecast", fieldId: field.fieldId, latitude: field.center[1], longitude: field.center[0],
        }, z.object({ snapshot: WeatherSnapshotSchema }), request.signal);
        if (!cancelled) state.commitWeatherRequest(request, result.data.snapshot, result.cached);
      } catch (error) {
        if (!request.signal.aborted && !cancelled) {
          if (state.weatherSnapshot === null) {
            const baseline=createRegionalBaselineWeatherSnapshot({fieldId:field.fieldId,coordinate:field.center,nowMs:state.now});
            if (state.commitWeatherRequest(request,baseline,false)) return;
          }
          state.failWeatherRequest(request, providerErrorMessage(error, "Weather", state.locale));
        }
      }
    };
    void fetchWeather();
    return () => {
      cancelled = true;
    };
  }, [state.hydrated, JSON.stringify(field), field?.fieldId, field?.center[0], field?.center[1], state.sampleDataActive, state.sampleOverlayActive,
    state.connection, state.weatherSnapshot?.fetchedAt, state.weatherStale, state.now, state.beginWeatherRequest,
    state.commitWeatherRequest, state.failWeatherRequest]);

  const offlineSaved = state.connection === "offline" && state.weatherSnapshot !== null;
  const age = state.weatherSnapshot && state.now !== null
    ? Math.max(0, Math.floor((state.now - Date.parse(state.weatherSnapshot.fetchedAt)) / 60_000))
    : null;
  if (!visible) return null;
  return <section aria-labelledby="weather-station-title" className="space-y-4">
    <div><h2 id="weather-station-title" className="text-xl font-bold">{text.stationNames.weather}</h2><p className="mt-1 text-sm text-stone-700">{text.weatherAuto}</p></div>
    {state.weatherStatus.state === "loading" && <p role="status" className="notice">{text.weatherLoading}</p>}
    {(state.weatherStatus.state === "error" || (state.connection === "offline" && !state.weatherSnapshot)) && <p role="status" className="notice">{state.weatherSnapshot
      ? (state.locale === "mr" ? "ताजा अंदाज मिळाला नाही; जतन केलेला अंदाज उपलब्ध आहे." : "Live refresh failed; the saved weather snapshot remains available.")
      : text.weatherError}</p>}
    {offlineSaved && <div className="flex flex-wrap items-center gap-2 rounded-xl border border-sky/30 bg-sky/10 p-3 text-sm">
      <span>{state.locale === "mr" ? "ऑफलाइन · जतन केलेला अंदाज" : "Offline · showing saved forecast"}</span><ProvenanceBadge provenance="forecast" locale={state.locale}/>
      {state.weatherSnapshot && <span>{state.locale === "mr" ? "अंदाजाचे वय" : "Forecast age"}: {age===null?state.weatherSnapshot.fetchedAt:age<60?(state.locale==="mr"?`${age} मिनिटांपूर्वी`:`${age} min ago`):age<1440?(state.locale==="mr"?`${Math.floor(age/60)} तासांपूर्वी`:`${Math.floor(age/60)} hr ago`):(state.locale==="mr"?`${Math.floor(age/1440)} दिवसांपूर्वी`:`${Math.floor(age/1440)} days ago`)}</span>}
    </div>}
    <WeatherCard />
  </section>;
}
