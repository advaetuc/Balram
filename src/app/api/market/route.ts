import { getMarketQuotes } from "@/lib/api/providers/agmarknet";
import { errorResponse } from "@/lib/api/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try { await getMarketQuotes(); }
  catch (error) { return errorResponse("market", error); }
}
export const POST = GET;
