import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { t } from "../src/config/i18n";
import { PERSISTENCE_VERSION } from "../src/store/useBalramStore";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const root = (path: string) => new URL(`../${path}`, import.meta.url);

// Dependency declarations shipped in v0.3.3.
const dependencyBaseline = {
  "dependencies": {
    "@turf/area": "^7.4.0",
    "@turf/center-of-mass": "^7.4.0",
    "@turf/helpers": "^7.4.0",
    "idb": "^8.0.3",
    "leaflet": "^1.9.4",
    "leaflet-draw": "^1.0.4",
    "next": "^15.5.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-leaflet": "^5.0.0",
    "react-leaflet-draw": "^0.21.0",
    "zod": "^3.25.0",
    "zustand": "^5.0.0"
  },
  "devDependencies": {
    "@types/leaflet": "^1.9.22",
    "@types/leaflet-draw": "^1.0.13",
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.5.0",
    "tailwindcss": "^3.4.17",
    "typescript": "^5.9.0"
  }
};

test("Daylight Field Notebook tokens are canonical and loaded globally", () => {
  assert.match(read("../src/styles/tokens.css"), /--line-height-body:\s*1\.6;/);
  assert.ok(JSON.parse(read("../src/styles/tokens.json")));
  assert.match(read("../src/app/globals.css"), /^@import ["']\.\.\/styles\/tokens\.css["'];/);
  assert.equal(existsSync(root("tokens.css")), false);
  assert.equal(existsSync(root("tokens.json")), false);
});

function leaves(dictionary: object, parent = ""): Map<string, string> {
  return new Map(Object.entries(dictionary).flatMap(([key, value]): [string, string][] => {
    const path = parent ? `${parent}.${key}` : key;
    if (typeof value === "string") return [[path, value]];
    assert.ok(value && typeof value === "object" && !Array.isArray(value), path);
    return [...leaves(value, path)];
  }));
}

test("all release copy has matching keys and Marathi text", () => {
  const en = leaves(t("en"));
  const mr = leaves(t("mr"));
  assert.deepEqual([...en.keys()].sort(), [...mr.keys()].sort());
  const permitted = /(?<![A-Za-z])(?:Balram|JSON|NPK|DAP|SSP|FYM|kg\/ha|mm|pH|ET₀|°C|L)(?![A-Za-z])/g;
  for (const [key, value] of mr) {
    assert.ok(en.get(key)?.trim(), key);
    assert.match(value, /\p{Script=Devanagari}/u, key);
    assert.doesNotMatch(value.replace(permitted, ""), /[A-Za-z]/, key);
  }
});

test("v0.6.0 ships with persistence v6 and the existing npm dependencies", () => {
  const manifest = JSON.parse(read("../package.json"));
  const lock = JSON.parse(read("../package-lock.json"));
  assert.equal(PERSISTENCE_VERSION, 6);
  assert.equal(manifest.version, "0.6.0");
  assert.equal(lock.version, manifest.version);
  assert.equal(lock.packages[""].version, manifest.version);
  for (const key of ["dependencies", "devDependencies"] as const) {
    assert.deepEqual(manifest[key], dependencyBaseline[key]);
    assert.deepEqual(lock.packages[""][key], dependencyBaseline[key]);
  }
});

test("release styles honor reduced motion and preserve an A4 report", () => {
  const css = read("../src/app/globals.css");
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?scroll-behavior:\s*auto/);
  assert.match(css, /outline:\s*2px solid var\(--color-ring\)/);
  assert.match(css, /@page\s*\{\s*size:\s*A4/);
  const portfolio = read("../src/components/dashboard/PortfolioCard.tsx");
  assert.match(portfolio, /scrollIntoView\([^\n]*matchMedia\("\(prefers-reduced-motion: reduce\)"\)\.matches \? "auto" : "smooth"/);
});
