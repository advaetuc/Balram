"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { CircleMarker, FeatureGroup, MapContainer, TileLayer, useMap } from "react-leaflet";
import { EditControl } from "react-leaflet-draw";
import { useBalramStore } from "@/store/useBalramStore";
import { calculateFieldGeometry } from "@/lib/domain/geometry";

const drawing: React.ComponentProps<typeof EditControl>["draw"] = {
  polygon: { allowIntersection: false, showArea: true, shapeOptions: { color: "#1E5631", fillOpacity: 0.2 } },
  polyline: false, rectangle: false, circle: false, marker: false, circlemarker: false,
};
const editing = { edit: {}, poly: { allowIntersection: false } };

function EditableBoundary({ onError }: { onError: (message: string | null) => void }) {
  const state = useBalramStore((value) => value);
  const latest = useRef(state);
  latest.current = state;
  const group = useRef<L.FeatureGroup>(null);
  const map = useMap();
  const restore = useCallback(() => {
    const layers = group.current;
    if (!layers) return;
    layers.clearLayers();
    const boundary = latest.current.fieldGeometry?.boundary;
    if (boundary) layers.addLayer(L.polygon(boundary.coordinates[0].map(([lng, lat]) => [lat, lng] as L.LatLngTuple),
      { color: "#1E5631", weight: 3, fillOpacity: 0.18 }));
  }, []);
  useEffect(() => {
    restore();
    const field = state.fieldGeometry;
    if (field?.boundary) map.fitBounds(L.latLngBounds(field.boundary.coordinates[0].map(([lng, lat]) => [lat, lng] as L.LatLngTuple)), { padding: [36, 36], maxZoom: 17, animate: false });
    else if (field) map.setView([field.center[1], field.center[0]], 15, { animate: false });
  }, [state.fieldGeometry, map, restore]);

  const save = useCallback((layer: L.Layer) => {
    if (!(layer instanceof L.Polygon)) return;
    try {
      const ring = layer.getLatLngs()[0] as L.LatLng[];
      const fieldId = latest.current.fieldGeometry?.fieldId ?? `field-${crypto.randomUUID()}`;
      latest.current.setFieldGeometry(calculateFieldGeometry(fieldId, ring.map((point) => [point.lat, point.lng])));
      onError(null);
    } catch { onError("The boundary is invalid. Use at least three distinct vertices and avoid crossing edges."); restore(); }
  }, [onError, restore]);
  const created = useCallback((event: L.DrawEvents.Created) => save(event.layer), [save]);
  const edited = useCallback((event: L.DrawEvents.Edited) => event.layers.eachLayer(save), [save]);
  const deleted = useCallback((event: L.DrawEvents.Deleted) => {
    if (event.layers.getLayers().length === 0) return;
    latest.current.setFieldGeometry(null); onError(null);
  }, [onError]);
  const editStarted = useCallback(() => latest.current.resetDerivedForFieldChange(), []);

  return <FeatureGroup ref={group}><EditControl position="topleft" draw={drawing} edit={editing}
    onCreated={created} onEdited={edited} onDeleted={deleted} onEditStart={editStarted} /></FeatureGroup>;
}

export default function FarmMap() {
  const state = useBalramStore((value) => value);
  const [error, setError] = useState<string | null>(null);
  const [tileError, setTileError] = useState(false);
  const [tilesEnabled, setTilesEnabled] = useState(false);
  const renderer = useMemo(() => L.canvas(), []);
  const tileEvents = useMemo(() => ({ tileerror: () => setTileError(true), load: () => undefined }), []);
  return <div>
    <div className="mb-3">
      <button className="button-secondary" disabled={state.connection !== "online" && !tilesEnabled}
        onClick={() => { setTilesEnabled((enabled) => !enabled); setTileError(false); }}>
        {tilesEnabled ? "Hide online map" : "Load online map"}
      </button>
      <p className="mt-2 text-xs leading-6">Loading the map shares visible tile locations with OpenStreetMap. Drawing works without tiles.</p>
    </div>
    <div className="relative isolate overflow-hidden rounded-xl border border-forest/20">
      <MapContainer center={[18.5204, 73.8567]} zoom={11} renderer={renderer} preferCanvas
        scrollWheelZoom={false} className="h-[420px] w-full bg-stone-100" aria-label="Field boundary map">
        {tilesEnabled && state.connection === "online" && <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
          keepBuffer={0} updateWhenIdle updateWhenZooming={false} maxZoom={19} eventHandlers={tileEvents} />}
        <EditableBoundary onError={setError} />
        {state.fieldGeometry && <CircleMarker center={[state.fieldGeometry.center[1], state.fieldGeometry.center[0]]}
          radius={6} pathOptions={{ color: "#212121", fillColor: "#FFBF00", fillOpacity: 1 }} interactive={false} />}
      </MapContainer>
    </div>
    {(state.connection !== "online" || tileError) && <p className="notice mt-3" role="status">
      {state.connection !== "online" ? "Offline: showing your saved geometry without map tiles." : "Some map tiles could not load. Boundary drawing and coordinate inputs remain available."}
    </p>}
    {error && <p role="alert" className="notice mt-3">{error}</p>}
    <p className="mt-3 text-xs leading-6">Draw one polygon, then use the edit control to adjust it. Save edits to recalculate area. The amber point is the polygon center of mass.</p>
    <a className="mt-1 inline-flex items-center text-sm text-forest underline" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>
  </div>;
}
