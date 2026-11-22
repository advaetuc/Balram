import { MaharashtraCropMatrix, type CropId } from "@/config/cropMatrix";
import { cropLabel, t } from "@/config/i18n";
import { allocatePlotsByGunthas } from "@/lib/domain/allocation";
import { GUNTHAS_PER_ACRE } from "@/lib/domain/geometry";
import { displayPlotName, formatArea } from "@/lib/domain/landUnits";
import type { RoadmapItem } from "@/lib/domain/roadmap";
import { layoutTiles } from "@/lib/domain/viz/tileLayout";
import { growthToLifecycleStage, type Locale, type PersistedFarm } from "@/types/domain";

export const FARM_CARD_SIZE = 1080;
const ACRE_LIMIT = 4;
const PLOT_LIMIT = 6;

const stripe = '<path d="M-2 2 2-2M0 8 8 0M6 10 10 6" fill="none" />';
const patterns = [
  ["#1E5631", ""],
  ["#A16207", stripe],
  ["#0369A1", '<circle cx="4" cy="4" r="1.3" fill="#FFFFFF" stroke="none" />'],
  ["#9A3412", stripe + '<path d="M-2 6 2 10M0 0 8 8M6-2 10 2" fill="none" />'],
  ["#6B21A8", '<path d="M0 4h8" />'],
  ["#E8F0F1", stripe],
] as const;

const patternDefs = patterns.map(([background, marks], index) =>
  `<pattern id="farm-tile-${index}" width="8" height="8" patternUnits="userSpaceOnUse">
    <rect width="8" height="8" fill="${background}"/><g stroke="${index === 5 ? "#5F8570" : "#FFFFFF"}" stroke-width="1.4">${marks}</g>
  </pattern>`).join("");

function escapeXml(value: string): string {
  return value.replace(/[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu, "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function shareableText(value: string): string {
  // Names and titles can contain pasted map data. Screen free text independently
  // of the farm's map while leaving computed agronomic quantities alone.
  return value.normalize("NFKC")
    .replace(/[\[(]\s*[+−-]?\p{Nd}{1,3}(?:[.٫]\p{Nd}+)?\s*[,;]\s*[+−-]?\p{Nd}{1,3}(?:[.٫]\p{Nd}+)?\s*[\])]/gu, "…")
    .replace(/(?:\b(?:latitude|longitude|lat|lon|lng)\b|अक्षांश|रेखांश)\s*[:=]?\s*[+−-]?\p{Nd}+(?:[.,٫]\p{Nd}+)?/giu, "…")
    .replace(/[+−-]?\p{Nd}{1,3}\s*[°º]\s*(?:\p{Nd}{1,2}(?:[.٫]\p{Nd}+)?\s*[′'’]\s*)?(?:\p{Nd}{1,2}(?:[.٫]\p{Nd}+)?\s*(?:[″"”]|′′)\s*)?[NSEW]?/giu, "…")
    .replace(/(?<!\p{Nd})[+−-]?\p{Nd}{1,3}[.٫]\p{Nd}+(?!\p{Nd})/gu, "…")
    .replace(/\s+/gu, " ").trim();
}

function fitLine(value: string, width: number, size: number, locale: Locale): string {
  const letters = typeof Intl.Segmenter === "function"
    ? [...new Intl.Segmenter(locale, { granularity: "grapheme" }).segment(value)].map(item => item.segment)
    : Array.from(value);
  let available = width / size;
  for (const [index, letter] of letters.entries()) {
    const advance = /^\s$/u.test(letter) ? 0.34
      : /\p{Script=Devanagari}/u.test(letter) ? Math.max(1, Array.from(letter.matchAll(/\p{Letter}/gu)).length * 0.85)
        : /^[ilI.,'|]$/u.test(letter) ? 0.35 : /^[MW@%]$/u.test(letter) ? 0.95 : 0.65;
    available -= advance;
    if (available < (index === letters.length - 1 ? 0 : 0.9)) {
      return letters.slice(0, index).join("").trimEnd() + "…";
    }
  }
  return value;
}

/** Builds a share image from display fields only. Map data is never read or serialized. */
export function buildFarmCardSvg({ state, roadmap }: { state: PersistedFarm; roadmap: readonly RoadmapItem[] }): string {
  const { locale, landUnit, sampleDataActive, cropAllocations } = state;
  const dictionary = t(locale);
  const copy = dictionary.viz.farmCard;
  const area = state.fieldGeometry?.areaSquareMetres ?? null;
  const allocation = allocatePlotsByGunthas(cropAllocations, area);
  const totalGunthas = allocation.totalFarmGunthas;
  const total = totalGunthas === null ? dictionary.landBar.unknown : formatArea(totalGunthas, landUnit, locale);
  const farmName = sampleDataActive ? dictionary.sampleFarm : shareableText(state.farmProfile?.name ?? "") || dictionary.myFarm;
  const number = new Intl.NumberFormat(locale === "mr" ? "mr-IN" : "en-IN");
  const escapeLine = (value: string, width: number, size: number) => escapeXml(fitLine(value, width, size, locale));

  const blocks = totalGunthas === null ? [] : layoutTiles(totalGunthas, cropAllocations, ACRE_LIMIT);
  const remainingAcres = Math.max(0, Math.ceil((totalGunthas ?? 0) / GUNTHAS_PER_ACRE) - blocks.length);
  const mosaic = blocks.map((block, index) => {
    const x = 60 + (index % 2) * 170;
    const y = 366 + Math.floor(index / 2) * 138;
    return `<g transform="translate(${x} ${y})">
      <rect width="156" height="126" rx="13" fill="#F0FDF4" stroke="#BCD6C5"/>
      <text x="12" y="23" font-size="15" font-weight="700" fill="#1E5631">${escapeXml(dictionary.viz.gunthaTiles.acre)} ${number.format(index + 1)}</text>
      ${block.tiles.map(tile => {
        const x = 12 + tile.column * 17;
        const y = 34 + tile.row * 17;
        const width = Math.max(1, Math.round(tile.fillFraction * 14));
        const pattern = tile.kind === "plot" ? tile.patternIndex : 5;
        return `<rect x="${x}" y="${y}" width="${width}" height="14" rx="2" fill="url(#farm-tile-${pattern})"/>`;
      }).join("")}
    </g>`;
  }).join("");

  const plots = allocation.plots.slice(0, PLOT_LIMIT).map((plot, index) => {
    const y = 364 + index * 58;
    const name = shareableText(displayPlotName(plot.plotName, locale, index + 1));
    const crop = Object.hasOwn(MaharashtraCropMatrix, plot.cropId) ? cropLabel(locale, plot.cropId as CropId) : dictionary.crop;
    const stage = dictionary.stageNames[plot.lifecycleStage ?? growthToLifecycleStage(plot.growthStage)];
    const areaText = plot.areaGunthas === null ? `${number.format(plot.percentage)}%` : formatArea(plot.areaGunthas, landUnit, locale);
    return `<g transform="translate(424 ${y})">
      <rect x="0" y="2" width="20" height="20" rx="4" fill="url(#farm-tile-${index % 5})"/>
      <text x="30" y="18" font-size="22" font-weight="700" fill="#1E5631">${escapeLine(name, 360, 22)}</text>
      <text x="30" y="42" font-size="17" fill="#475569">${escapeLine(`${crop} · ${stage}`, 535, 17)}</text>
      <text x="589" y="19" font-size="17" text-anchor="end" font-weight="700" fill="#212121">${escapeLine(areaText, 185, 17)}</text>
      <path d="M30 53H589" stroke="#E8F0F1" />
    </g>`;
  }).join("");
  const remainingPlots = Math.max(0, cropAllocations.length - PLOT_LIMIT);

  const actions = roadmap.slice(0, 2).map((item, index) => `<g transform="translate(62 ${847 + index * 82})">
    <rect width="956" height="70" rx="12" fill="#F0FDF4"/>
    <rect width="5" height="70" rx="2" fill="#1E5631"/>
    <text x="18" y="27" font-size="20" font-weight="700" fill="#212121">${escapeLine(shareableText(item.title[locale]), 920, 20)}</text>
    <text x="18" y="52" font-size="16" font-weight="600" fill="#475569">${escapeXml(dictionary.provenance[item.provenance])}</text>
  </g>`).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${FARM_CARD_SIZE}" height="${FARM_CARD_SIZE}" viewBox="0 0 1080 1080" lang="${locale}" xml:lang="${locale}" role="img" aria-labelledby="farm-card-title">
  <title id="farm-card-title">${escapeXml(dictionary.shareTitle)}</title>
  <defs>${patternDefs}</defs>
  <rect width="1080" height="1080" fill="#F0FDF4"/>
  <g font-family="'Noto Sans Devanagari', 'Noto Sans', system-ui, sans-serif">
    <rect x="38" y="32" width="1004" height="224" rx="24" fill="#1E5631"/>
    <path d="M778 255C884 214 1005 163 1042 114V231Q1042 255 1018 255Z" fill="#34704B"/>
    <g transform="translate(64 59)" fill="none" stroke="#F0FDF4" stroke-width="2.5" stroke-linejoin="round">
      <path d="M24 39V24M24 29C12 29 9 21 9 12c10 0 15 5 15 17ZM24 24c0-10 5-15 15-15 0 10-5 15-15 15Z"/>
    </g>
    <text x="120" y="93" font-size="27" font-weight="700" fill="#F0FDF4">Balram</text>
    ${sampleDataActive ? `<rect x="624" y="59" width="386" height="42" rx="10" fill="#FFBF00"/>
    <text x="817" y="86" font-size="19" text-anchor="middle" font-weight="700" fill="#212121">${escapeLine(copy.sample, 360, 19)}</text>` : ""}
    <text x="66" y="166" font-size="48" font-weight="700" fill="#FFFFFF">${escapeLine(farmName, 942, 48)}</text>
    <text x="68" y="214" font-size="24" font-weight="600" fill="#F0FDF4">${escapeLine(`${dictionary.shareLand} · ${total}`, 920, 24)}</text>
    <rect x="38" y="276" width="1004" height="472" rx="22" fill="#FFFFFF" stroke="#BCD6C5"/>
    <text x="62" y="327" font-size="29" font-weight="700" fill="#1E5631">${escapeXml(dictionary.sharePlots)}</text>
    <path d="M405 345V719" stroke="#E8F0F1" stroke-width="2"/>
    ${mosaic || `<text x="62" y="401" font-size="18" fill="#475569">${escapeXml(copy.noArea)}</text>`}
    ${remainingAcres ? `<text x="62" y="672" font-size="18" font-weight="700" fill="#1E5631">${escapeLine(copy.moreAcres.replace("{0}", number.format(remainingAcres)), 320, 18)}</text>` : ""}
    ${blocks.length ? `<text x="62" y="${blocks.length <= 2 ? 522 : 652}" font-size="16" fill="#475569">${escapeLine(copy.tileKey, 322, 16)}</text>` : ""}
    ${plots || `<text x="424" y="401" font-size="19" fill="#475569">${escapeXml(copy.noPlots)}</text>`}
    ${remainingPlots ? `<text x="454" y="727" font-size="18" font-weight="700" fill="#1E5631">${escapeLine(copy.morePlots.replace("{0}", number.format(remainingPlots)), 530, 18)}</text>` : ""}
    <rect x="38" y="770" width="1004" height="270" rx="22" fill="#FFFFFF" stroke="#BCD6C5"/>
    <text x="62" y="819" font-size="29" font-weight="700" fill="#1E5631">${escapeXml(dictionary.shareActions)}</text>
    ${actions || `<text x="62" y="880" font-size="20" fill="#475569">${escapeLine(dictionary.roadmapEmpty, 950, 20)}</text>`}
  </g>
</svg>`;
}
