import { ForecastInputSchema, getForecast } from "@/lib/api/providers/openMeteo";
import { providerRoute, submitOnly } from "@/lib/api/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export function POST(request: Request) { return providerRoute(request, "weather", ForecastInputSchema, getForecast); }
export function GET() { return submitOnly("weather"); }
