/** Match a browser Origin to the public host forwarded by the deployment proxy. */
export function isSameProviderOrigin(origin: string | null, forwardedHost: string | null, host: string | null, requestHost: string): boolean {
  if (!origin) return true;
  const expectedHost=forwardedHost?.split(",")[0]?.trim()||host||requestHost;
  try { return new URL(origin).host.toLowerCase()===expectedHost.toLowerCase(); }
  catch { return false; }
}
