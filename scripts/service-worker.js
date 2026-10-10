/* Build template: only explicitly listed same-origin application files are cacheable. */
const CACHE = "__BALRAM_CACHE__";
const FILES = __BALRAM_FILES__;
const APPROVED = new Set(FILES);

async function approvedResponse(path) {
  const response = await fetch(new Request(path, { cache: "reload", credentials: "omit", redirect: "error" }));
  const policy = response.headers.get("cache-control") || "";
  if (!response.ok || response.type === "opaque" || /private|no-store/i.test(policy) || response.headers.has("set-cookie")) {
    throw new Error("Application file cannot be cached.");
  }
  return response;
}

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    try {
      // Bounded parallelism; only app files, never provider requests or map tiles.
      for (let start = 0; start < FILES.length; start += 6) {
        await Promise.all(FILES.slice(start, start + 6).map(async path => cache.put(path, await approvedResponse(path))));
      }
    } catch (error) { await caches.delete(CACHE); throw error; }
    // Let open tabs finish on the old version; do not force skipWaiting/reloads.
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    await Promise.all((await caches.keys()).filter(name => name.startsWith("balram-shell-") && name !== CACHE).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  let path;
  try { path = decodeURIComponent(url.pathname); } catch { return; }
  // Fail closed: no API, cross-origin, query-string, RSC, POST or tile interception.
  if (request.method !== "GET" || url.origin !== self.location.origin || url.search ||
      url.pathname.startsWith("/api/") || request.headers.get("RSC") === "1") return;
  if (request.mode === "navigate") {
    event.respondWith((async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      try { return await fetch(request, { signal: controller.signal }); }
      catch {
        const cache = await caches.open(CACHE);
        return (url.pathname === "/" ? await cache.match("/") : undefined) ||
          await cache.match("/offline.html") || Response.error();
      } finally { clearTimeout(timer); }
    })());
    return;
  }
  if (!APPROVED.has(path) || path === "/") return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(path);
    if (cached) return cached;
    const response = await approvedResponse(path);
    await cache.put(path, response.clone());
    return response;
  })());
});
