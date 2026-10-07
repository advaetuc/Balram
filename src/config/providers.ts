export const ENABLE_MARKET = false;
export const INDIA_TIMEZONE = "Asia/Kolkata";
export const PROVIDERS = {
  weather: {
    id: "open-meteo", name: "Open-Meteo", url: "https://open-meteo.com/",
    endpoint: "https://api.open-meteo.com/v1/forecast", provenance: "modelled",
    attribution: "Weather data by Open-Meteo (CC BY 4.0)", ttlMs: 30 * 60_000,
  },
  geocode: {
    id: "nominatim", name: "Nominatim", url: "https://www.openstreetmap.org/copyright",
    endpoint: "https://nominatim.openstreetmap.org/search", provenance: "reported",
    attribution: "© OpenStreetMap contributors (ODbL)", ttlMs: 24 * 60 * 60_000,
  },
  soil: {
    id: "soilgrids", name: "ISRIC SoilGrids", url: "https://soilgrids.org/",
    endpoint: "https://rest.isric.org/soilgrids/v2.0/properties/query", provenance: "modelled",
    attribution: "ISRIC SoilGrids (CC BY 4.0)", ttlMs: 30 * 24 * 60 * 60_000,
  },
  market: {
    id: "agmarknet", name: "Agmarknet", url: "https://agmarknet.gov.in/",
    provenance: "reported", attribution: "Agmarknet", ttlMs: 0,
  },
} as const;

export type ProviderName = keyof typeof PROVIDERS;

/** Round outbound/cache coordinates to 4 decimals (~11 m latitude); never cache exact farm boundaries. */
export const COORDINATE_DECIMALS = 4;
export const SOIL_PROPERTIES = ["clay", "sand", "silt"] as const;
export const SOIL_DEPTH = "0-5cm";
export const PROVIDER_LIMITS = { nominatim: 1_100, soilgrids: 12_100 } as const;

/** Public-service rate limits require one authoritative process, not per-instance counters. */
export function hasSingleProviderAuthority(): boolean {
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.K_SERVICE) return false;
  return process.env.NODE_ENV !== "production" || process.env.BALRAM_SINGLE_PROCESS === "true";
}

export function nominatimIdentity(): string | null {
  const contact = process.env.BALRAM_CONTACT_URL;
  if (!contact) return process.env.NODE_ENV === "production" ? null : "Balram/0.2 (local development; manual farm place search)";
  try {
    const url = new URL(contact);
    if (url.protocol !== "https:" || url.username || url.password || contact.length > 200) return null;
    return `Balram/0.2 (+${url.href})`;
  } catch { return null; }
}
