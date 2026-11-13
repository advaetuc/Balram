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
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) ring.push([...first]);
  return ring;
}

export function calculateFieldGeometry(fieldId: string, leafletRing: readonly LeafletCoordinate[]): FieldGeometry {
  const ring = closeRing(leafletToGeoJSON(leafletRing));
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
