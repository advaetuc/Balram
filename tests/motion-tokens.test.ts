import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const tokens = JSON.parse(read("src/styles/tokens.json")) as {
  motion: Record<string, Record<string, { $value: string | number }>>;
};
const tokenCss = read("src/styles/tokens.css");

function cssValue(css: string, property: string): string | undefined {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return css.match(new RegExp(`${escaped}:\\s*([^;]+);`))?.[1].trim();
}

test("motion token values match their CSS custom properties", () => {
  const prefixes: Record<string, string> = {
    duration: "dur",
    easing: "ease",
    distance: "dist",
    scale: "scale",
  };

  for (const [group, values] of Object.entries(tokens.motion)) {
    const prefix = prefixes[group];
    assert.ok(prefix, `unexpected motion token group ${group}`);
    for (const [name, token] of Object.entries(values)) {
      const variable = `--${prefix}-${name}`;
      assert.equal(cssValue(tokenCss, variable), String(token.$value), variable);
    }
  }
});

test("motion.css contains no banned motion patterns", () => {
  const css = read("src/styles/motion.css").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(css, /transition:\s*all\b/i);
  assert.doesNotMatch(css, /\bwill-change\b/i);
  assert.doesNotMatch(css, /\bbackdrop-filter\b/i);
  assert.doesNotMatch(css, /\b\d+(?:ms|s)\b/i);
  assert.doesNotMatch(css, /cubic-bezier\s*\(/i);

  for (const match of css.matchAll(/@keyframes\b[^\{]*\{([\s\S]*?)\n\}/g)) {
    assert.doesNotMatch(match[1], /\b(?:width|height|top|left|margin|padding)\s*:/i);
  }
});

test("toast timers match motion tokens and remain real timers for reduced motion", () => {
  const toast = read("src/components/ui/ToastHost.tsx");
  const reducedMotion = tokenCss.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  const timerPairs = [
    ["TOAST_INFO_MS", "--dur-toast-info", "4000"],
    ["TOAST_UNDO_MS", "--dur-toast-undo", "7000"],
  ] as const;

  for (const [constant, variable, expected] of timerPairs) {
    assert.match(toast, new RegExp(`export const ${constant} = ${expected};`));
    assert.equal(cssValue(tokenCss, variable), `${expected}ms`);
    assert.doesNotMatch(reducedMotion, new RegExp(`${variable}:\\s*0(?:ms)?\\s*;`));
  }
});
