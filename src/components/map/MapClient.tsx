"use client";

import dynamic from "next/dynamic";
import { Component, useState, type FormEvent, type ReactNode } from "react";
import { useBalramStore } from "@/store/useBalramStore";
import { calculateFieldGeometry, SQUARE_METRES_PER_ACRE } from "@/lib/domain/geometry";
import { FieldGeometrySchema } from "@/types/domain";
import { formatNumber, parseNumber } from "@/lib/ui/format";
import { Card, DataCaption } from "@/components/dashboard/Card";

const FarmMap = dynamic(() => import("./FarmMap"), {
  ssr: false, loading: () => <div className="flex h-[420px] items-center justify-center rounded-xl bg-stone-100" role="status">Loading field map…</div>,
});

class MapBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <p role="alert" className="notice">The map could not load. You can still enter coordinates and a boundary below.</p> : this.props.children; }
}

export function MapClient() {
  const state = useBalramStore((value) => value);
  return <Card id="field-map" title="Define your field" eyebrow="Location & acreage">
    <p className="mt-3 text-sm leading-6">Draw a boundary or enter coordinates. Changes clear old weather and soil results; your crop choices stay saved.</p>
    <div className="my-5 flex flex-wrap gap-x-8 gap-y-3 rounded-xl bg-forest/5 p-4">
      <div><p className="text-xs text-stone-600">Field area</p><p className="text-2xl font-bold">{formatNumber(state.fieldGeometry?.areaSquareMetres == null ? null : state.fieldGeometry.areaSquareMetres / SQUARE_METRES_PER_ACRE, 2)}
        {state.fieldGeometry?.areaSquareMetres != null && <span className="ml-1 text-sm font-normal">acres</span>}</p></div>
      <div><p className="text-xs text-stone-600">Location</p><p className="mt-1 text-sm tabular-nums">{state.fieldGeometry
        ? `${state.fieldGeometry.center[1].toFixed(5)}, ${state.fieldGeometry.center[0].toFixed(5)}` : "Not selected"}</p></div>
    </div>
    {state.hydrated ? <MapBoundary key={String(state.sampleDataActive)}><FarmMap /></MapBoundary>
      : <div className="h-[420px] rounded-xl bg-stone-100 p-5" role="status">Loading saved field…</div>}
    <LocationForm key={`${state.hydrated}:${state.sampleDataActive}:${JSON.stringify(state.fieldGeometry)}`} />
    <DataCaption source={state.fieldGeometry?.boundary ? "Your boundary · Turf geodesic area" : "Your location and acreage inputs"}
      validAt={state.planningUpdatedAt ?? state.farmProfile?.updatedAt ?? null} sample={state.sampleDataActive} />
  </Card>;
}

function LocationForm() {
  const state = useBalramStore((value) => value);
  const field = state.fieldGeometry;
  const [lat, setLat] = useState(field?.center[1].toString() ?? "");
  const [lng, setLng] = useState(field?.center[0].toString() ?? "");
  const [acres, setAcres] = useState(field?.areaSquareMetres == null ? "" : String(field.areaSquareMetres / SQUARE_METRES_PER_ACRE));
  const [vertices, setVertices] = useState(field?.boundary?.coordinates[0].slice(0, -1).map(([x, y]) => `${y}, ${x}`).join("\n") ?? "");
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const id = () => field?.fieldId ?? `field-${crypto.randomUUID()}`;
  function save(event: FormEvent) {
    event.preventDefault();
    const latitude = parseNumber(lat), longitude = parseNumber(lng), area = parseNumber(acres);
    try {
      if (latitude === null || longitude === null || (acres.trim() && (area === null || area <= 0))) throw new Error();
      state.setFieldGeometry(FieldGeometrySchema.parse({ fieldId: id(), center: [longitude, latitude], boundary: null,
        areaSquareMetres: area === null ? null : area * SQUARE_METRES_PER_ACRE }));
      setError(null);
    } catch { setError("Enter latitude from −90 to 90, longitude from −180 to 180, and a positive acreage or leave acreage blank."); }
  }
  function saveBoundary(event: FormEvent) {
    event.preventDefault();
    try {
      const lines = vertices.trim().split(/\r?\n/);
      if (lines.length > 1000) throw new Error();
      const points = lines.map((line) => {
        const parts = line.split(",");
        if (parts.length !== 2) throw new Error();
        const a = parseNumber(parts[0]), b = parseNumber(parts[1]);
        if (a === null || b === null) throw new Error();
        return [a, b] as [number, number];
      });
      state.setFieldGeometry(calculateFieldGeometry(id(), points)); setError(null);
    } catch { setError("Use one latitude, longitude pair per line, with 3–1000 distinct vertices and no crossing edges. The ring closes automatically."); }
  }
  function locate() {
    if (!navigator.geolocation) { setError("Location is unavailable in this browser. Enter coordinates manually."); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition((position) => {
      setLat(String(position.coords.latitude)); setLng(String(position.coords.longitude)); setLocating(false); setError(null);
    }, () => { setLocating(false); setError("Location access failed. Enter coordinates manually."); }, { timeout: 10000, maximumAge: 60000 });
  }
  return <div className="mt-4 space-y-3">
    <details open={!field}><summary>Enter coordinates & acreage</summary>
      <form onSubmit={save} className="mt-3 space-y-4"><fieldset disabled={!state.hydrated} className="grid gap-3 sm:grid-cols-2">
        <legend className="sr-only">Field location</legend>
        <label className="text-sm">Latitude<input className="form-input mt-1" type="number" inputMode="decimal" required min="-90" max="90" step="any" value={lat} onChange={(event) => setLat(event.target.value)} /></label>
        <label className="text-sm">Longitude<input className="form-input mt-1" type="number" inputMode="decimal" required min="-180" max="180" step="any" value={lng} onChange={(event) => setLng(event.target.value)} /></label>
        <label className="text-sm sm:col-span-2">Area (acres, optional)<input className="form-input mt-1" type="number" inputMode="decimal" min="0.000001" step="any" value={acres} onChange={(event) => setAcres(event.target.value)} /></label>
        <button className="button-secondary" type="button" disabled={locating} onClick={locate}>{locating ? "Finding location…" : "Use my location"}</button>
        <button className="button-primary" type="submit">Save location</button>
      </fieldset><p className="text-xs leading-5 text-stone-600">Saving manual coordinates replaces a drawn boundary. Geolocation only fills the form; save when ready.</p></form>
    </details>
    <details><summary>Enter or edit boundary vertices</summary>
      <form onSubmit={saveBoundary} className="mt-3 space-y-3"><label className="block text-sm">Latitude, longitude pairs (one pair per line)
        <textarea className="form-input mt-2 font-mono text-xs" rows={6} maxLength={50000} value={vertices} onChange={(event) => setVertices(event.target.value)} required disabled={!state.hydrated} /></label>
        <button className="button-secondary w-full" type="submit" disabled={!state.hydrated}>Save boundary</button></form>
    </details>
    {field && <button className="button-quiet w-full" onClick={() => state.setFieldGeometry(null)}>Clear field and its telemetry</button>}
    {error && <p role="alert" className="notice">{error}</p>}
  </div>;
}
