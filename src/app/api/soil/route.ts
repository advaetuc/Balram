import { getSoilProperties, SoilInputSchema } from "@/lib/api/providers/soilGrids";
import { providerRoute, submitOnly } from "@/lib/api/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export function POST(request: Request) { return providerRoute(request, "soil", SoilInputSchema, getSoilProperties); }
export function GET() { return submitOnly("soil"); }
