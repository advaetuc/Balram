import { ENABLE_MARKET } from "@/config/providers";
import { ApiError } from "../http";

/** No network call or sample-price fallback exists until the public contract is reviewed. */
export async function getMarketQuotes(): Promise<never> {
  if (!ENABLE_MARKET) throw new ApiError("DISABLED", "Market prices are disabled.", 503);
  throw new ApiError("CONFIGURATION", "Agmarknet requires an approved provider contract and reuse review.", 503);
}
