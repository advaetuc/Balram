import { area } from "@turf/area";
import { centerOfMass } from "@turf/center-of-mass";
import { polygon } from "@turf/helpers";
import { z } from "zod";
import { CoordinateSchema, FieldGeometrySchema, type Coordinate, type FieldGeometry } from "@/types/domain";

export const SQUARE_METRES_PER_ACRE = 4046.8564224;
export const GUNTHAS_PER_ACRE = 40;
export const SQUARE_METRES_PER_GUNTHA = SQUARE_METRES_PER_ACRE / GUNTHAS_PER_ACRE;
export interface AcresAndGunthas { acres:number; gunthas:number; totalGunthas:number; totalAcres:number; areaSquareMetres:number }
export function squareMetresToGunthas(value:number):number { return z.number().finite().nonnegative().parse(value)/SQUARE_METRES_PER_GUNTHA; }
export function gunthasToSquareMetres(value:number):number { return z.number().finite().nonnegative().parse(value)*SQUARE_METRES_PER_GUNTHA; }
export function acresAndGunthasToGunthas(acres:number,gunthas:number):number {
 const a=z.number().finite().nonnegative().parse(acres), g=z.number().finite().nonnegative().parse(gunthas);
 if(a*GUNTHAS_PER_ACRE+g<=0) throw new RangeError("Land area must be greater than zero."); return a*GUNTHAS_PER_ACRE+g;
}
export function gunthasToAcresAndGunthas(value:number):AcresAndGunthas {
 const totalGunthas=z.number().finite().nonnegative().parse(value);
 let tenths=Math.round(totalGunthas*10), acres=Math.floor(tenths/400), remainingTenths=tenths-acres*400;
 if(remainingTenths>=400){acres++;remainingTenths-=400;}
 const gunthas=remainingTenths/10, roundedTotal=acres*40+gunthas;
 return {acres,gunthas,totalGunthas:roundedTotal,totalAcres:roundedTotal/40,areaSquareMetres:gunthasToSquareMetres(roundedTotal)};
}
export function squareMetresToAcresAndGunthas(value:number):AcresAndGunthas { return gunthasToAcresAndGunthas(squareMetresToGunthas(value)); }
export type LeafletCoordinate = readonly [latitude: number, longitude: number];

/** Create a local record ID without relying on crypto.randomUUID support. */
export function createFieldId(): string {
  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(bytes);
    return `field-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  }
  return `field-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export function acresToSquareMetres(acres: number): number {
  return z.number().finite().nonnegative().parse(z.number().finite().nonnegative().parse(acres) * SQUARE_METRES_PER_ACRE);
}
export function squareMetresToAcres(squareMetres: number): number {
  return z.number().finite().nonnegative().parse(squareMetres) / SQUARE_METRES_PER_ACRE;
}

export function leafletToGeoJSON(coordinates: readonly LeafletCoordinate[]): Coordinate[] {
  z.array(z.tuple([z.number().finite().min(-90).max(90), z.number().finite().min(-180).max(180)])).min(3).max(1001).parse(coordinates);
  return coordinates.map(([lat, lng]) => CoordinateSchema.parse([lng, lat]));
}

export function closeRing(coordinates: readonly Coordinate[]): Coordinate[] {
  const ring = z.array(CoordinateSchema).min(3).max(1001).parse(coordinates);
  const first = ring[0];
  // Leaflet Draw may include the first vertex when a user clicks it to finish,
  // and can leave more than one copy after edits. Normalize to exactly one closure.
  while (ring.length > 1) {
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) break;
    ring.pop();
  }
  if (ring.length < 3) throw new RangeError("A field boundary needs at least three distinct vertices.");
  ring.push([...first]);
  return ring;
}

export function calculateFieldGeometry(fieldId: string, leafletRing: readonly LeafletCoordinate[]): FieldGeometry {
  // Remove consecutive duplicate clicks and any repeated terminal start point
  // before conversion. This also handles draw completion by clicking the first vertex.
  const normalized = leafletRing.filter((point, index) => index === 0 ||
    point[0] !== leafletRing[index - 1][0] || point[1] !== leafletRing[index - 1][1]);
  while (normalized.length > 1 && normalized[0][0] === normalized[normalized.length - 1][0] &&
    normalized[0][1] === normalized[normalized.length - 1][1]) normalized.pop();
  const ring = closeRing(leafletToGeoJSON(normalized));
  const boundary = FieldGeometrySchema.shape.boundary.unwrap().parse({ type: "Polygon", coordinates: [ring] });
  const feature = polygon(boundary.coordinates);
  // Turf area is spherical/geodesic. centerOfMass uses a planar polygon centroid in lon/lat,
  // not an ellipsoidal centroid or a guarantee that the point is inside a concave field.
  const center = CoordinateSchema.parse(centerOfMass(feature).geometry.coordinates);
  return FieldGeometrySchema.parse({ fieldId, boundary, center, areaSquareMetres: area(feature) });
}

export function calculateAcreageAndCentroid(leafletRing: readonly LeafletCoordinate[]) {
  const geometry = calculateFieldGeometry("calculated-field", leafletRing);
  return { acres: squareMetresToAcres(geometry.areaSquareMetres!), squareMetres: geometry.areaSquareMetres!,
    centroid: { lat: geometry.center[1], lng: geometry.center[0] }, geometry };
}
