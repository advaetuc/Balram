import { area } from "@turf/area";
import { centerOfMass } from "@turf/center-of-mass";
import { polygon } from "@turf/helpers";
import { z } from "zod";
import { CoordinateSchema, FieldGeometrySchema, type Coordinate, type FieldGeometry } from "@/types/domain";

import { SQUARE_METRES_PER_ACRE } from "./areaConversion";

export * from "./areaConversion";

export type LeafletCoordinate = readonly [latitude: number, longitude: number];

export { createFieldId } from "./fieldId";

export function acresToSquareMetres(acres: number): number {
  return z.number().finite().nonnegative().parse(z.number().finite().nonnegative().parse(acres) * SQUARE_METRES_PER_ACRE);
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
