import type { NextConfig } from "next";

const development = process.env.NODE_ENV === "development";
// Static App Router embeds bootstrap scripts. Per-request nonces require dynamic SSR.
// Inline script hashes are enforced by the additional build-generated HTML policy.
const csp = [
  "default-src 'none'",
  `script-src 'self' 'unsafe-inline'${development ? " 'unsafe-eval'" : ""}`,
  "script-src-attr 'none'",
  "style-src 'self' 'unsafe-inline'", // Leaflet uses inline positioning styles.
  "img-src 'self' data: https://tile.openstreetmap.org", "font-src 'self'",
  `connect-src 'self'${development ? " ws: wss:" : ""}`,
  "worker-src 'self'", "manifest-src 'self'", "base-uri 'none'", "object-src 'none'",
  "frame-src 'none'", "frame-ancestors 'none'", "form-action 'self'",
  ...(!development ? ["upgrade-insecure-requests"] : []),
].join("; ");

const config: NextConfig = {
  poweredByHeader: false, reactStrictMode: true, productionBrowserSourceMaps: false, logging: false,
  // Leaflet loads tiles directly; never proxy/cache them through the image optimizer.
  images: { remotePatterns: [], dangerouslyAllowSVG: false },
  async headers() {
    return [
      { source: "/:path*", headers: [
        { key: "Content-Security-Policy", value: csp },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), payment=(), browsing-topics=()" },
        ...(!development ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }] : []),
      ] },
      { source: "/api/:path*", headers: [
        { key: "Cache-Control", value: "private, no-store, max-age=0" },
        { key: "CDN-Cache-Control", value: "no-store" },
        { key: "Vercel-CDN-Cache-Control", value: "no-store" },
      ] },
      { source: "/sw.js", headers: [
        { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        { key: "Cache-Control", value: "no-store" },
        { key: "Service-Worker-Allowed", value: "/" },
        { key: "Content-Security-Policy", value: "default-src 'none'; script-src 'self'; connect-src 'self'" },
      ] },
      { source: "/:file(manifest.json|offline.html|offline.css|icon.svg)", headers: [
        { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
      ] },
    ];
  },
};
export default config;
