"use client";

import dynamic from "next/dynamic";
import { Component, useState, type FormEvent, type ReactNode } from "react";
import { useBalramStore } from "@/store/useBalramStore";
import { calculateFieldGeometry, createFieldId, squareMetresToGunthas, gunthasToSquareMetres } from "@/lib/domain/geometry";
import { FieldGeometrySchema } from "@/types/domain";
import { parseNumber } from "@/lib/ui/format";
import { Card, DataCaption } from "@/components/dashboard/Card";
import { t } from "@/config/i18n";
import { formatArea } from "@/lib/domain/landUnits";
import { AreaInput } from "@/components/ui/AreaInput";

const FarmMap = dynamic(() => import("./FarmMap"), {
  ssr: false, loading: () => <div className="flex h-[420px] items-center justify-center rounded-xl bg-stone-100" role="status">Loading field map…</div>,
});

class MapBoundary extends Component<{ children: ReactNode; locale: "en" | "mr" }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <p role="alert" className="notice">{this.props.locale === "mr" ? "नकाशा उघडता आला नाही. खाली निर्देशांक व सीमा नोंदवता येतील." : "The map could not load. You can still enter coordinates and a boundary below."}</p> : this.props.children; }
}

export function MapClient() {
  const state = useBalramStore((value) => value);
  const mr = state.locale === "mr";
  const text=t(state.locale);
  return <Card id="field-map" title={text.field} eyebrow={text.location}>
    <p className="mt-3 text-sm leading-6">{mr ? "शेताची सीमा काढा किंवा निर्देशांक भरा. बदल केल्यावर जुने हवामान व मातीचे निकाल हटतील; पीक निवडी जतन राहतील." : "Draw a boundary or enter coordinates. Changes clear old weather and soil results; your crop choices stay saved."}</p>
    <div className="my-5 flex flex-wrap gap-x-8 gap-y-3 rounded-xl bg-forest/5 p-4">
      <div><p className="text-xs text-stone-600">{text.fieldArea}</p><p className="text-2xl font-bold text-forest">{state.fieldGeometry?.areaSquareMetres == null ? (mr ? "ठरवलेले नाही" : "Not set") : formatArea(squareMetresToGunthas(state.fieldGeometry.areaSquareMetres), state.landUnit, state.locale, { includeSecondary: true })}</p></div>
    </div>
    {state.sampleDataActive && <p className="notice mb-3">{state.locale === "mr" ? "नमुना शेत फक्त पाहण्यासाठी आहे." : "Sample farm is view-only."}</p>}
    {state.hydrated ? <MapBoundary key={String(state.sampleDataActive)} locale={state.locale}><FarmMap readOnly={state.sampleDataActive} /></MapBoundary>
      : <div className="h-[420px] rounded-xl bg-stone-100 p-5" role="status">{mr ? "जतन केलेले शेत उघडत आहे…" : "Loading saved field…"}</div>}
    <LocationForm key={`${state.hydrated}:${state.sampleDataActive}:${JSON.stringify(state.fieldGeometry)}`} />
    <DataCaption source={state.fieldGeometry?.boundary ? (mr ? "तुमची सीमा · Turf भौमितिक क्षेत्रफळ" : "Your boundary · Turf geodesic area") : (mr ? "तुमचे ठिकाण व जमिनीचे क्षेत्र" : "Your location and acreage inputs")}
      validAt={state.planningUpdatedAt ?? state.farmProfile?.updatedAt ?? null} sample={state.sampleDataActive} />
  </Card>;
}

function LocationForm() {
  const state = useBalramStore((value) => value);
  const mr = state.locale === "mr";
  const field = state.fieldGeometry;
  const [lat, setLat] = useState(field?.center[1].toString() ?? "");
  const [lng, setLng] = useState(field?.center[0].toString() ?? "");
  const [areaGunthas, setAreaGunthas] = useState<number | null>(() => field?.areaSquareMetres == null ? null : squareMetresToGunthas(field.areaSquareMetres));
  const [areaError, setAreaError] = useState<string | null>(null);
  const [vertices, setVertices] = useState(field?.boundary?.coordinates[0].slice(0, -1).map(([x, y]) => `${y}, ${x}`).join("\n") ?? "");
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const id = () => field?.fieldId ?? createFieldId();
  function save(event: FormEvent) {
    event.preventDefault();
    const latitude = parseNumber(lat), longitude = parseNumber(lng);
    try {
      if (latitude === null || longitude === null || areaError || (areaGunthas !== null && areaGunthas <= 0)) throw new Error();
      state.setFieldGeometry(FieldGeometrySchema.parse({ fieldId: id(), center: [longitude, latitude], boundary: null,
        areaSquareMetres: areaGunthas === null ? null : gunthasToSquareMetres(areaGunthas) }));
      setError(null);
    } catch { setError(mr ? "अक्षांश −९० ते ९० आणि रेखांश −१८० ते १८० दरम्यान भरा. क्षेत्रफळ सकारात्मक ठेवा किंवा रिकामे सोडा." : "Enter latitude from −90 to 90, longitude from −180 to 180, and a positive acreage or leave acreage blank."); }
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
    } catch { setError(mr ? "प्रत्येक ओळीत अक्षांश व रेखांशाची जोडी भरा. ३–१००० वेगळे बिंदू वापरा आणि सीमा एकमेकांना ओलांडू देऊ नका. शेवटचा बिंदू आपोआप पहिल्याशी जोडला जाईल." : "Use one latitude, longitude pair per line, with 3–1000 distinct vertices and no crossing edges. The ring closes automatically."); }
  }
  function locate() {
    if (!navigator.geolocation) { setError(mr ? "या ब्राउझरमध्ये स्थान सुविधा उपलब्ध नाही. निर्देशांक स्वतः भरा." : "Location is unavailable in this browser. Enter coordinates manually."); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition((position) => {
      setLat(String(position.coords.latitude)); setLng(String(position.coords.longitude)); setLocating(false); setError(null);
    }, () => { setLocating(false); setError(mr ? "स्थान मिळाले नाही. निर्देशांक स्वतः भरा." : "Location access failed. Enter coordinates manually."); }, { timeout: 10000, maximumAge: 60000 });
  }
  return <div className="mt-4 space-y-3">
    <details open={!field}><summary>{mr ? "निर्देशांक व क्षेत्रफळ भरा" : "Enter coordinates & acreage"}</summary>
      <form onSubmit={save} className="mt-3 space-y-4"><fieldset disabled={!state.hydrated || state.sampleDataActive} className="grid gap-3 sm:grid-cols-2">
        <legend className="sr-only">{mr ? "शेताचे ठिकाण" : "Field location"}</legend>
        <label className="text-sm">{mr ? "अक्षांश" : "Latitude"}<input className="form-input mt-1" type="number" inputMode="decimal" required min="-90" max="90" step="any" value={lat} onChange={(event) => setLat(event.target.value)} /></label>
        <label className="text-sm">{mr ? "रेखांश" : "Longitude"}<input className="form-input mt-1" type="number" inputMode="decimal" required min="-180" max="180" step="any" value={lng} onChange={(event) => setLng(event.target.value)} /></label>
        <div className="sm:col-span-2"><AreaInput label={mr ? "जमिनीचे क्षेत्र" : "Field area"} gunthas={areaGunthas} unit={state.landUnit} locale={state.locale} optional onChangeGunthas={setAreaGunthas} onValidityChange={setAreaError} /></div>
        <button className="button-secondary" type="button" disabled={locating} onClick={locate}>{locating ? (mr ? "स्थान शोधत आहोत…" : "Finding location…") : (mr ? "माझे स्थान वापरा" : "Use my location")}</button>
        <button className="button-primary" type="submit">{mr ? "स्थान जतन करा" : "Save location"}</button>
      </fieldset><p className="text-xs leading-5 text-stone-600">{mr ? "हाताने निर्देशांक जतन केल्यास काढलेली सीमा बदलली जाईल. स्थान सुविधा फक्त ही नोंद भरते; तयार झाल्यावर जतन करा." : "Saving manual coordinates replaces a drawn boundary. Geolocation only fills the form; save when ready."}</p></form>
    </details>
    <details><summary>{mr ? "प्रगत: सीमा निर्देशांक भरा किंवा बदला" : "Advanced: Enter or edit boundary coordinates"}</summary>
      <form onSubmit={saveBoundary} className="mt-3 space-y-3"><label className="block text-sm">{mr ? "अक्षांश, रेखांशाची जोडी (प्रत्येक ओळीत एक जोडी)" : "Latitude, longitude pairs (one pair per line)"}
        <textarea className="form-input mt-2 font-mono text-xs" rows={6} maxLength={50000} value={vertices} onChange={(event) => setVertices(event.target.value)} required disabled={!state.hydrated || state.sampleDataActive} /></label>
        <button className="button-secondary w-full" type="submit" disabled={!state.hydrated || state.sampleDataActive}>{mr ? "सीमा जतन करा" : "Save boundary"}</button></form>
    </details>
    {field && <button className="button-quiet w-full" disabled={state.sampleDataActive} onClick={() => state.setFieldGeometry(null)}>{mr ? "शेत व संबंधित माहिती पुसा" : "Clear field and its telemetry"}</button>}
    {error && <p role="alert" className="notice">{error}</p>}
  </div>;
}
