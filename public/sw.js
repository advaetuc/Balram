/* Build template: only explicitly listed same-origin application files are cacheable. */
const CACHE = "balram-shell-d111350137673838807f";
const FILES = ["/","/offline.html","/offline.css","/manifest.json","/icon.svg","/icons/icon-192.png","/icons/icon-512.png","/icons/maskable-512.png","/_next/static/0Trqcb4XTi24fPfe_F35x/_buildManifest.js","/_next/static/0Trqcb4XTi24fPfe_F35x/_ssgManifest.js","/_next/static/chunks/139.7a5a8e93a21948c1.js","/_next/static/chunks/152-314ba9dff8add9b5.js","/_next/static/chunks/255-ce8c7c75002f810b.js","/_next/static/chunks/259-b4f5cd61837a817a.js","/_next/static/chunks/353-84e0c3fc57692faa.js","/_next/static/chunks/462.3ae92ac16026ebde.js","/_next/static/chunks/4bd1b696-c023c6e3521b1417.js","/_next/static/chunks/596-b95f8a4a6373d814.js","/_next/static/chunks/646.f342b7cffc01feb0.js","/_next/static/chunks/72.8bf670ed12e1553a.js","/_next/static/chunks/app/(app)/page-040a2bf4cd48785e.js","/_next/static/chunks/app/_not-found/page-23cdbd6f82f25b57.js","/_next/static/chunks/app/api/geocode/route-ea177887c6b4cc9f.js","/_next/static/chunks/app/api/market/route-ea177887c6b4cc9f.js","/_next/static/chunks/app/api/soil/route-ea177887c6b4cc9f.js","/_next/static/chunks/app/api/weather/route-ea177887c6b4cc9f.js","/_next/static/chunks/app/layout-b3c0af888abdf3ce.js","/_next/static/chunks/d0deef33.cac6acee3fffe7af.js","/_next/static/chunks/framework-4891de286d38ef96.js","/_next/static/chunks/main-5d7fa886155e25b2.js","/_next/static/chunks/main-app-cd39a8e09364d6b1.js","/_next/static/chunks/pages/_app-82835f42865034fa.js","/_next/static/chunks/pages/_error-013f4188946cdd04.js","/_next/static/chunks/polyfills-42372ed130431b0a.js","/_next/static/chunks/webpack-9ce1d673dd8b6e4c.js","/_next/static/css/cc3e642005538358.css","/_next/static/media/layers-2x.9859cd12.png","/_next/static/media/layers.ef6db872.png","/_next/static/media/marker-icon.d577052a.png","/_next/static/media/spritesheet-2x.53a2cab4.png","/_next/static/media/spritesheet.ac8b36fa.svg","/_next/static/media/spritesheet.c1d7d146.png"];
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
