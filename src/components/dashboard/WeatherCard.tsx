"use client";

import { z } from "zod";
import { useBalramStore } from "@/store/useBalramStore";
import { WeatherSnapshotSchema } from "@/types/domain";
import { submitProvider, providerErrorMessage } from "@/lib/api/client";
import { formatNumber, selectedWeatherDay } from "@/lib/ui/format";
import { Card, DataCaption } from "./Card";

export function WeatherCard() {
  const state = useBalramStore((value) => value);
  const snapshot = state.weatherSnapshot;
  const day = selectedWeatherDay(state);
  const loading = state.weatherStatus.state === "loading";
  async function update() {
    const field = state.fieldGeometry;
    if (!field) return;
    const request = state.beginWeatherRequest();
    try {
      const result = await submitProvider("/api/weather", { intent: "forecast", fieldId: field.fieldId,
        latitude: field.center[1], longitude: field.center[0] }, z.object({ snapshot: WeatherSnapshotSchema }), request.signal);
      state.commitWeatherRequest(request, result.data.snapshot, result.cached);
    } catch (error) {
      if (!request.signal.aborted) state.failWeatherRequest(request, providerErrorMessage(error, "Weather"));
    }
  }
  return <Card id="weather" title="Weather & water demand" eyebrow="Field conditions">
    <div className="mt-5 grid grid-cols-2 gap-4" aria-busy={loading}>
      <div><p className="text-xs text-stone-600">Reference ET₀</p>
        <p className="mt-1 text-3xl font-semibold tabular-nums">{formatNumber(day?.referenceEvapotranspiration)}</p>
        <p className="text-sm text-stone-600">{day?.referenceEvapotranspiration != null ? "mm/day" : "No estimate for this day"}</p></div>
      <div><p className="text-xs text-stone-600">Forecast rainfall</p>
        <p className="mt-1 text-3xl font-semibold tabular-nums">{formatNumber(day?.precipitation)}</p>
        <p className="text-sm text-stone-600">{day?.precipitation != null ? "mm/day" : "No estimate for this day"}</p></div>
    </div>
    <p className="mt-4 text-sm">{day ? `${day.date} · ${formatNumber(day.temperatureMin)} to ${formatNumber(day.temperatureMax)} °C`
      : "No current-day forecast. Select a field and request weather."}</p>
    {state.weatherStatus.error && <p role="alert" className="notice mt-4">{state.weatherStatus.error}</p>}
    <button className="button-secondary mt-5 w-full" disabled={!state.hydrated || !state.fieldGeometry || loading || state.sampleDataActive || state.connection === "offline"}
      onClick={() => void update()}>{loading ? "Updating weather…" : snapshot ? "Refresh weather" : "Get weather"}</button>
    <p className="mt-2 text-xs leading-5 text-stone-600">This sends your field&apos;s approximate center to Open-Meteo when you request an update.</p>
    {snapshot && <details className="mt-3"><summary>Forecast details</summary>
      <ul className="divide-y divide-forest/10 text-sm">{snapshot.daily.map((item) => <li key={item.date} className="py-3">
        <strong>{item.date}</strong><p>ET₀: {formatNumber(item.referenceEvapotranspiration)}{item.referenceEvapotranspiration != null && " mm/day"}
          {" · "}Rain: {formatNumber(item.precipitation)}{item.precipitation != null && " mm"}</p>
      </li>)}</ul><p className="text-xs leading-5">Regional weather model, not a field sensor. Missing values remain unavailable. Model-run time is not supplied by this provider.</p>
    </details>}
    <DataCaption source={snapshot?.source ?? "Open-Meteo · not yet fetched"} validAt={day ? `${day.date}T00:00:00+05:30` : snapshot?.validFrom ?? null}
      fetchedAt={snapshot?.fetchedAt ?? null} modeled={snapshot?.provenance === "modelled"} sample={state.sampleDataActive}
      stale={state.weatherStale} offline={state.connection === "offline"} />
  </Card>;
}
