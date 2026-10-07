import { GeocodeInputSchema, searchPlaces } from "@/lib/api/providers/nominatim";
import { providerRoute, submitOnly } from "@/lib/api/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export function POST(request: Request) { return providerRoute(request, "geocode", GeocodeInputSchema, searchPlaces); }
export function GET() { return submitOnly("geocode"); }
