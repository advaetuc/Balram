import { getSoilProperties, SoilInputSchema } from "@/lib/api/providers/soilGrids";
import { providerRoute, submitOnly } from "@/lib/api/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export function POST(request: Request) { return providerRoute(request, "soil", SoilInputSchema, getSoilProperties); }
export function GET() { return submitOnly("soil"); }
export const HEAD = GET;
export const OPTIONS = GET;
export const PUT = GET;
export const PATCH = GET;
export const DELETE = GET;
