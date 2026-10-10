"use client";

import { useBalramStore } from "@/store/useBalramStore";
import { ENABLE_SOILGRIDS } from "@/config/providers";
import { SoilDataSchema } from "@/types/domain";
import { submitProvider, providerErrorMessage } from "@/lib/api/client";
import { formatNumber } from "@/lib/ui/format";
import { Card, DataCaption } from "./Card";

export function SoilCard() {
  const state = useBalramStore((value) => value);
  const snapshot = state.soilSnapshot;
  const loading = state.soilStatus.state === "loading";
  const stale = !!snapshot && state.now !== null && (state.now >= Date.parse(snapshot.expiresAt) || state.now < Date.parse(snapshot.fetchedAt));
  async function update() {
    const field = state.fieldGeometry;
    if (!field || !ENABLE_SOILGRIDS) return;
    const request = state.beginSoilRequest();
    try {
      const result = await submitProvider("/api/soil", { intent: "soil-lookup", latitude: field.center[1], longitude: field.center[0] }, SoilDataSchema, request.signal);
      state.commitSoilRequest(request, { fieldId: field.fieldId, coordinate: field.center, source: result.source.name,
        fetchedAt: result.fetchedAt, validAt: result.validAt, expiresAt: result.expiresAt, data: result.data });
    } catch (error) {
      if (!request.signal.aborted) state.failSoilRequest(request, providerErrorMessage(error, "SoilGrids"));
    }
  }
  return <Card id="soil" title="Soil context" eyebrow="Optional lookup">
    <p className="mt-3 text-sm leading-6">Mineral fractions at 0–5 cm depth. These estimates do not control irrigation.</p>
    {!ENABLE_SOILGRIDS && <p className="notice mt-3">Experimental provider · lookups disabled for release. Saved results remain available with their original dates.</p>}
    <dl className="mt-5 grid grid-cols-3 gap-3" aria-busy={loading}>
      {(["clay", "sand", "silt"] as const).map((name) => {
        const value = snapshot?.data.properties.find((item) => item.property === name)?.mean;
        return <div key={name}><dt className="text-sm capitalize text-stone-600">{name}</dt>
          <dd className="mt-1 text-lg font-semibold">{formatNumber(value)}{value != null && "%"}</dd></div>;
      })}
    </dl>
    {state.soilStatus.error ? <p role="alert" className="notice mt-4">{state.soilStatus.error}</p>
      : !snapshot && <p className="mt-4 text-sm text-stone-600">No soil result saved. SoilGrids can be slow or unavailable; the rest of your plan remains usable.</p>}
    <button className="button-secondary mt-5 w-full" disabled={!ENABLE_SOILGRIDS || !state.hydrated || !state.fieldGeometry || loading || state.sampleDataActive || state.connection === "offline"}
      onClick={() => void update()}>{loading ? "Requesting soil data…" : state.soilStatus.error ? "Retry soil lookup" : "Look up soil properties"}</button>
    <p className="mt-2 text-xs leading-5 text-stone-600">Sends the approximate field center to ISRIC only on request. No automatic retries from this page.</p>
    <details className="mt-3"><summary>How to use soil context</summary><p className="text-sm leading-6">ISRIC SoilGrids is a regional model, not a soil test or moisture sensor. Missing properties display as unavailable. Use a local soil test for field-specific decisions.</p></details>
    <DataCaption source={snapshot?.source ?? "ISRIC SoilGrids · not yet fetched"} validAt={snapshot?.validAt ?? null}
      fetchedAt={snapshot?.fetchedAt ?? null} modeled={!!snapshot} stale={stale} offline={state.connection === "offline"} />
  </Card>;
}
