"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { CircleMarker, FeatureGroup, MapContainer, TileLayer, useMap } from "react-leaflet";
import { EditControl } from "react-leaflet-draw";
import { useBalramStore } from "@/store/useBalramStore";
import { calculateFieldGeometry, createFieldId } from "@/lib/domain/geometry";

const drawing: React.ComponentProps<typeof EditControl>["draw"] = {
  polygon: { allowIntersection: false, showArea: true, shapeOptions: { color: "#1E5631", fillOpacity: 0.2 } },
  polyline: false, rectangle: false, circle: false, marker: false, circlemarker: false,
};
const editing = { edit: {}, poly: { allowIntersection: false } };

function EditableBoundary({ onError, readOnly }: { onError: (message: string | null) => void; readOnly: boolean }) {
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
      const fieldId = latest.current.fieldGeometry?.fieldId ?? createFieldId();
      latest.current.setFieldGeometry(calculateFieldGeometry(fieldId, ring.map((point) => [point.lat, point.lng])));
      onError(null);
    } catch (error) {
      const mr = latest.current.locale === "mr";
      const detail = error instanceof Error ? error.message : "";
      onError(mr ? `सीमा जतन करता आली नाही. ${detail.includes("three distinct") || detail.includes("intersect") ? "किमान तीन वेगळे बिंदू वापरा आणि कडा एकमेकांना ओलांडू देऊ नका." : "बिंदू तपासून पुन्हा प्रयत्न करा."}` : `The boundary could not be saved: ${detail || "Check the boundary vertices and try again."}`);
      restore();
    }
  }, [onError, restore]);
  const created = useCallback((event: L.DrawEvents.Created) => save(event.layer), [save]);
  const edited = useCallback((event: L.DrawEvents.Edited) => event.layers.eachLayer(save), [save]);
  const deleted = useCallback((event: L.DrawEvents.Deleted) => {
    if (event.layers.getLayers().length === 0) return;
    latest.current.setFieldGeometry(null); onError(null);
  }, [onError]);
  const editStarted = useCallback(() => latest.current.resetDerivedForFieldChange(), []);

  const mr = state.locale === "mr";
  const drawLocal = mr ? {
    draw: { toolbar: { actions: { title: "रेखाटन रद्द करा", text: "रद्द करा" }, finish: { title: "रेखाटन पूर्ण करा", text: "पूर्ण" },
      undo: { title: "शेवटचा बिंदू काढा", text: "शेवटचा बिंदू काढा" }, buttons: { polygon: "शेताची सीमा काढा" } },
      handlers: { polygon: { tooltip: { start: "सीमा काढण्यासाठी नकाशावर क्लिक करा.", cont: "सीमा सुरू ठेवण्यासाठी क्लिक करा.", end: "पहिल्या बिंदूवर क्लिक करून सीमा बंद करा." } } },
    },
    edit: { toolbar: { actions: { save: { title: "बदल जतन करा", text: "जतन करा" }, cancel: { title: "बदल रद्द करा", text: "रद्द करा" }, clearAll: { title: "सर्व सीमा काढून टाका", text: "सर्व काढा" } },
      buttons: { edit: "सीमा बदला", editDisabled: "बदलण्यासाठी सीमा नाही", remove: "सीमा काढा", removeDisabled: "काढण्यासाठी सीमा नाही" } },
      handlers: { edit: { tooltip: { text: "बिंदू ओढून सीमा बदला.", subtext: "बदल जतन करा किंवा रद्द करा." } }, remove: { tooltip: { text: "काढण्यासाठी सीमांवर क्लिक करा.", subtext: "बदल रद्द करण्यासाठी रद्द करा निवडा." } } },
    },
  } : {
    draw: { toolbar: { actions: { title: "Cancel drawing", text: "Cancel" }, finish: { title: "Finish drawing", text: "Finish" },
      undo: { title: "Delete last point drawn", text: "Delete last point" }, buttons: { polygon: "Draw a field boundary" } },
      handlers: { polygon: { tooltip: { start: "Click to start drawing boundary.", cont: "Click to continue drawing boundary.", end: "Click first point to close this boundary." } } },
    },
    edit: { toolbar: { actions: { save: { title: "Save changes", text: "Save" }, cancel: { title: "Cancel editing", text: "Cancel" }, clearAll: { title: "Clear all boundaries", text: "Clear all" } },
      buttons: { edit: "Edit boundary", editDisabled: "No boundaries to edit", remove: "Delete boundary", removeDisabled: "No boundaries to delete" } },
      handlers: { edit: { tooltip: { text: "Drag points to edit boundary.", subtext: "Save or cancel changes." } }, remove: { tooltip: { text: "Click boundaries to delete.", subtext: "Click cancel to undo deletion." } } },
    },
  };
  (L as unknown as { drawLocal: typeof drawLocal }).drawLocal = drawLocal;

  return <FeatureGroup ref={group}>{!readOnly && <EditControl key={state.locale} position="topleft" draw={drawing} edit={editing}
    onCreated={created} onEdited={edited} onDeleted={deleted} onEditStart={editStarted} />}</FeatureGroup>;
}

export default function FarmMap({ readOnly = false }: { readOnly?: boolean }) {
  const state = useBalramStore((value) => value);
  const mr = state.locale === "mr";
  const [error, setError] = useState<string | null>(null);
  const [tileError, setTileError] = useState(false);
  const [tilesEnabled, setTilesEnabled] = useState(false);
  const renderer = useMemo(() => L.canvas(), []);
  const tileEvents = useMemo(() => ({ tileerror: () => setTileError(true), load: () => undefined }), []);
  return <div>
    <div className="mb-3">
      <button className="button-secondary" disabled={readOnly || (state.connection !== "online" && !tilesEnabled)}
        onClick={() => { setTilesEnabled((enabled) => !enabled); setTileError(false); }}>
        {tilesEnabled ? (mr ? "ऑनलाइन नकाशा लपवा" : "Hide online map") : (mr ? "ऑनलाइन नकाशा दाखवा" : "Load online map")}
      </button>
      <p className="mt-2 text-xs leading-6">{mr ? "नकाशा उघडल्यावर दिसणाऱ्या टाइलची ठिकाणे OpenStreetMap कडे पाठवली जातात. टाइल नसतानाही सीमा काढता येते." : "Loading the map shares visible tile locations with OpenStreetMap. Drawing works without tiles."}</p>
    </div>
    <div className="relative isolate overflow-hidden rounded-xl border border-forest/20">
      <MapContainer center={[18.5204, 73.8567]} zoom={11} renderer={renderer} preferCanvas
        scrollWheelZoom={false} className="h-[420px] w-full bg-stone-100" aria-label={mr ? "शेताच्या सीमेचा नकाशा" : "Field boundary map"}>
        {tilesEnabled && state.connection === "online" && <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution={`&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap ${mr ? "योगदानकर्ते" : "contributors"}</a>`}
          keepBuffer={0} updateWhenIdle updateWhenZooming={false} maxZoom={19} eventHandlers={tileEvents} />}
        <EditableBoundary onError={setError} readOnly={readOnly} />
        {state.fieldGeometry && <CircleMarker center={[state.fieldGeometry.center[1], state.fieldGeometry.center[0]]}
          radius={6} pathOptions={{ color: "#212121", fillColor: "#FFBF00", fillOpacity: 1 }} interactive={false} />}
      </MapContainer>
    </div>
    {(state.connection !== "online" || tileError) && <p className="notice mt-3" role="status">
      {state.connection !== "online" ? (mr ? "ऑफलाइन: नकाशाचे टाइल न वापरता जतन केलेली सीमा दाखवत आहोत." : "Offline: showing your saved geometry without map tiles.") : (mr ? "काही नकाशा टाइल उघडली नाहीत. सीमा काढणे व निर्देशांक भरणे सुरू ठेवता येईल." : "Some map tiles could not load. Boundary drawing and coordinate inputs remain available.")}
    </p>}
    {error && <p role="alert" className="notice mt-3">{error}</p>}
    <p className="mt-3 text-xs leading-6">{mr ? "एक बहुभुज सीमा काढा; बदलण्यासाठी संपादन साधन वापरा. क्षेत्रफळ पुन्हा मोजण्यासाठी बदल जतन करा. केशरी बिंदू सीमा क्षेत्राचे केंद्र दाखवतो." : "Draw one polygon, then use the edit control to adjust it. Save edits to recalculate area. The amber point is the polygon center of mass."}</p>
    <a className="mt-1 inline-flex items-center text-sm text-forest underline" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap {mr ? "योगदानकर्ते" : "contributors"}</a>
  </div>;
}
