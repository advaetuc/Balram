import { getMarketQuotes } from "@/lib/api/providers/agmarknet";
import { errorResponse } from "@/lib/api/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";
export async function GET() {
  try { await getMarketQuotes(); }
  catch (error) { return errorResponse("market", error); }
}
export const POST = GET;
export const HEAD = GET;
export const OPTIONS = GET;
export const PUT = GET;
export const PATCH = GET;
export const DELETE = GET;
