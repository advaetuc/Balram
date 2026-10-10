import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await files(path));
    else result.push(path);
  }
  return result.sort();
}

// Static HTML cannot use request nonces. Hash every prerendered inline script and
// enforce a second, stricter policy before any script. HTTP policy supplies frame-ancestors.
for (const path of (await files(".next/server/app")).filter(path => path.endsWith(".html"))) {
  let html = await readFile(path, "utf8");
  html = html.replace(/<meta data-balram-csp="true"[^>]*>/g, "");
  const hashes = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(([, attributes]) => !/\bsrc\s*=/i.test(attributes))
    .map(([, , script]) => `'sha256-${createHash("sha256").update(script).digest("base64")}'`);
  const policy = `script-src 'self' ${[...new Set(hashes)].join(" ")}; script-src-attr 'none'; object-src 'none'; base-uri 'none'`;
  if (!html.includes("<head>")) throw new Error("Unsupported prerendered HTML structure.");
  html = html.replace("<head>", `<head><meta data-balram-csp="true" http-equiv="Content-Security-Policy" content="${policy}">`);
  await writeFile(path, html);
}

const approved = ["/", "/offline.html", "/offline.css", "/manifest.json", "/icon.svg",
  "/icons/icon-192.png", "/icons/icon-512.png", "/icons/maskable-512.png"];
for (const path of await files(".next/static")) {
  if (/\.(?:js|css|woff2?|png|svg)$/.test(path)) approved.push(`/${path.replaceAll("\\", "/").replace(/^\.next\//, "_next/")}`);
}
const hash = createHash("sha256");
const template = await readFile("scripts/service-worker.js", "utf8");
hash.update(template);
for (const url of approved) {
  const path = url === "/" ? ".next/server/app/index.html" : url.startsWith("/_next/")
    ? url.replace("/_next/", ".next/") : `public${url}`;
  hash.update(url).update(await readFile(path));
}
const output = template.replace("__BALRAM_CACHE__", `balram-shell-${hash.digest("hex").slice(0, 20)}`)
  .replace("__BALRAM_FILES__", JSON.stringify(approved));
await writeFile("public/sw.js", output);
console.log(`Release: hashed static script policies; ${approved.length} approved offline application files.`);
