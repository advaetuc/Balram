import { access } from "node:fs/promises";
import { resolve as pathResolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

async function existingTs(url) {
  try { await access(fileURLToPath(url)); return url; } catch { return null; }
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const url = pathToFileURL(pathResolve(process.cwd(), "src", specifier.slice(2) + ".ts")).href;
    if (await existingTs(url)) return { url, shortCircuit: true };
  }
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:")) {
    const url = new URL(specifier.endsWith(".ts") ? specifier : specifier + ".ts", context.parentURL).href;
    if (await existingTs(url)) return { url, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
