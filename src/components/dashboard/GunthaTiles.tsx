"use client";

import { memo, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { CropId } from "@/config/cropMatrix";
import { cropLabel, t } from "@/config/i18n";
import { CROP_PATTERN_IDS, FALLOW_PATTERN_ID, ProvenanceStroke, SAMPLE_PATTERN_ID, patternFill } from "@/components/viz/ProvenanceStroke";
import { VizCaption } from "@/components/viz/VizCaption";
import { VizTable } from "@/components/viz/VizTable";
import { allocatePlotsByGunthas, updatePlotGunthas } from "@/lib/domain/allocation";
import { GUNTHAS_PER_ACRE } from "@/lib/domain/geometry";
import { displayPlotName, formatArea } from "@/lib/domain/landUnits";
import { layoutTiles, type AcreBlock, type LandTile } from "@/lib/domain/viz/tileLayout";
import { useBalramStore } from "@/store/useBalramStore";
import { CropAllocationsSchema, growthToLifecycleStage, type CropAllocation, type FieldGeometry, type Locale } from "@/types/domain";

const COLUMNS = 8;
const CELL = 32;
const PITCH = CELL + 2;
const EMPTY_MARKS: ReadonlySet<number> = new Set();
const AREA_TOLERANCE = 1e-8;
type Adjustment = 1 | -1 | 5 | -5 | 40 | "fill";
type Notice = "overCapacity" | "keepPlotArea" | "cannotAdjust" | "updated" | "noRoom";
type PlotLabel = { name: string; crop: string; marker: string };

function localNumber(value: number, locale: Locale) {
  return String(value).replace(/\d/g, digit => locale === "mr" ? "०१२३४५६७८९"[Number(digit)] : digit);
}

function TileFace({ fill, fraction = 1, initial, marker }: {
  fill: string;
  fraction?: number;
  initial?: string;
  marker?: string;
}) {
  return <>
    <rect width={CELL} height={CELL} rx="4" fill="#FAFAFA" stroke="#5F8570" strokeWidth="0.7" />
    <svg width={CELL * fraction} height={CELL} overflow="hidden">
      <rect width={CELL} height={CELL} rx="4" fill={fill} />
    </svg>
    {initial && <g transform={`translate(${Math.max(9, CELL * fraction / 2)} 16)`}>
      <circle r="8" fill="#212121" />
      <text textAnchor="middle" dominantBaseline="central" fill="white" fontSize="10" fontWeight="700">{initial}</text>
    </g>}
    {marker && fraction === 1 && <g transform="translate(25 25)">
      <circle r="6" fill="#212121" />
      <text textAnchor="middle" dominantBaseline="central" fill="white" fontSize="7" fontWeight="700">{marker}</text>
    </g>}
  </>;
}

interface AcreProps {
  block: AcreBlock;
  locale: Locale;
  labels: readonly PlotLabel[];
  prefix: string;
  readOnly: boolean;
  focusIndex: number;
  marks: ReadonlySet<number>;
}

const AcreCard = memo(function AcreCard({ block, locale, labels, prefix, readOnly, focusIndex, marks }: AcreProps) {
  const titleId = useId();
  const dictionary = t(locale);
  const text = dictionary.viz.gunthaTiles;
  const title = `${text.acre} ${localNumber(block.acreIndex + 1, locale)}`;
  const start = block.acreIndex * GUNTHAS_PER_ACRE;
  const area = { plot: 0, fallow: 0 };
  for (const tile of block.tiles) area[tile.kind] += tile.fillFraction;
  const imageLabel = `${title} · ${dictionary.landBar.planned} ${formatArea(area.plot, "gunthas", locale)} · ${text.unassigned} ${formatArea(area.fallow, "gunthas", locale)}`;

  function face(tile: LandTile) {
    return <TileFace
      fill={patternFill(tile.kind === "plot" ? CROP_PATTERN_IDS[tile.patternIndex] : FALLOW_PATTERN_ID, prefix)}
      fraction={tile.fillFraction}
      initial={tile.kind === "plot" ? tile.initial[locale] : undefined}
      marker={tile.kind === "plot" ? labels[tile.plotIndex].marker : undefined}
    />;
  }

  return <section className="min-w-0 max-w-md rounded-xl border border-forest/20 bg-daylight p-2.5 shadow-sm md:p-0.5 lg:p-2.5">
    <h3 id={titleId} className="mb-2 px-0.5 text-sm font-bold text-forest">{title}</h3>
    <svg role="img" aria-label={imageLabel} viewBox={`-1 -1 ${COLUMNS * PITCH} ${5 * PITCH}`}
      className="block w-full md:hidden" data-guntha-mobile>
      {block.tiles.map(tile => <g key={tile.row * COLUMNS + tile.column}
        transform={`translate(${tile.column * PITCH} ${tile.row * PITCH})`}>{face(tile)}</g>)}
    </svg>
    <div role="group" aria-labelledby={titleId} className="hidden overflow-x-auto px-px py-1 md:block">
      <div className="grid min-h-[248px] w-full min-w-[398px] grid-cols-8 grid-rows-5 gap-0.5">
        {block.tiles.map((tile, offset) => {
          const index = start + offset;
          const fullTile = tile.fillFraction === 1;
          const ownership = tile.kind === "plot" ? `${labels[tile.plotIndex].name} · ${labels[tile.plotIndex].crop}` : text.unassigned;
          const description = `${title} · ${text.tile} ${localNumber(offset + 1, locale)} · ${ownership}${fullTile ? "" : ` · ${text.partial}`}`;
          return <button key={offset} type="button" data-guntha-index={index}
            aria-label={description} aria-disabled={!fullTile || undefined}
            disabled={readOnly} tabIndex={focusIndex === index ? 0 : -1}
            className={`relative flex min-h-12 min-w-12 scroll-mt-32 items-center justify-center rounded-[5px] enabled:cursor-pointer enabled:hover:z-10 enabled:hover:ring-2 enabled:hover:ring-forest focus-visible:z-20 focus-visible:-outline-offset-2 disabled:opacity-100 ${marks.has(index) ? "z-10 ring-2 ring-ink ring-offset-1" : ""}`}>
            <svg aria-hidden="true" className="size-11 shrink-0" viewBox="-1 -1 34 34">{face(tile)}</svg>
          </button>;
        })}
      </div>
    </div>
  </section>;
}, (prev, next) => {
  if (prev.locale !== next.locale || prev.prefix !== next.prefix || prev.readOnly !== next.readOnly ||
      prev.focusIndex !== next.focusIndex ||
      prev.block.tiles.length !== next.block.tiles.length) return false;
  return prev.block.tiles.every((tile, offset) => {
    const other = next.block.tiles[offset];
    const index = prev.block.acreIndex * GUNTHAS_PER_ACRE + offset;
    if (tile.fillFraction !== other.fillFraction || prev.marks.has(index) !== next.marks.has(index)) return false;
    if (tile.kind === "fallow" || other.kind === "fallow") return tile.kind === other.kind;
    const previousLabel = prev.labels[tile.plotIndex];
    const nextLabel = next.labels[other.plotIndex];
    return tile.patternIndex === other.patternIndex && tile.initial[prev.locale] === other.initial[next.locale] &&
      previousLabel.name === nextLabel.name && previousLabel.crop === nextLabel.crop && previousLabel.marker === nextLabel.marker;
  });
});

interface PaintStroke {
  pointerId: number;
  allocations: readonly CropAllocation[];
  field: FieldGeometry | null;
  activeIndex: number;
  release: boolean;
  indices: Set<number>;
}

function tileButton(target: EventTarget | null, surface: HTMLElement) {
  const button = (target as Element | null)?.closest<HTMLButtonElement>("button[data-guntha-index]");
  return button && surface.contains(button) && !button.disabled ? button : null;
}

export function GunthaTiles() {
  const state = useBalramStore(s => s);
  const { locale, landUnit, fieldGeometry, sampleDataActive } = state;
  const dictionary = t(locale);
  const text = dictionary.viz.gunthaTiles;
  const id = useId();
  const prefix = `guntha-${id.replace(/[^a-zA-Z0-9_-]/g, "")}-`;
  const totalArea = fieldGeometry?.areaSquareMetres ?? null;
  const derived = useMemo(() => allocatePlotsByGunthas(state.cropAllocations, totalArea), [state.cropAllocations, totalArea]);
  const totalGunthas = derived.totalFarmGunthas ?? 0;
  const blocks = useMemo(() => layoutTiles(totalGunthas, state.cropAllocations), [totalGunthas, state.cropAllocations]);
  const tileCount = blocks.length > 0 ? (blocks.length - 1) * GUNTHAS_PER_ACRE + blocks.at(-1)!.tiles.length : 0;
  const [selection, setSelection] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [paint, setPaint] = useState(false);
  const [focusedTile, setFocusedTile] = useState(0);
  const [marks, setMarks] = useState<ReadonlySet<number>>(EMPTY_MARKS);
  const stroke = useRef<PaintStroke | null>(null);
  const keys = state.cropAllocations.map((plot, index) => plot.plotId === undefined ? `legacy:${index}` : `plot:${plot.plotId}`);
  const activeIndex = Math.max(0, keys.findIndex(key => key === selection));
  const readOnly = !state.hydrated || sampleDataActive || state.sampleOverlayActive || keys.length === 0 || totalGunthas <= 0;
  const paintEnabled = paint && !readOnly;

  const cropNames = state.cropAllocations.map(plot =>
    Object.hasOwn(dictionary.cropNames, plot.cropId) ? cropLabel(locale, plot.cropId as CropId) : null);
  const plotLabels = derived.plots.map((plot, index) => ({
    name: displayPlotName(plot.plotName, locale, index + 1),
    crop: cropNames[index] ?? dictionary.crop,
    marker: "",
  }));
  const patterns = cropNames.map((crop, index) => `${index % CROP_PATTERN_IDS.length}:${crop?.[0] ?? "?"}`);
  plotLabels.forEach((label, index) => {
    if (patterns.indexOf(patterns[index]) !== patterns.lastIndexOf(patterns[index])) label.marker = localNumber(index + 1, locale);
  });

  const showArea = (area: number | null) => area === null ? dictionary.landBar.unknown : formatArea(area, landUnit, locale);
  const getTile = (index: number) => blocks[Math.floor(index / GUNTHAS_PER_ACRE)]?.tiles[index % GUNTHAS_PER_ACRE];

  function applyChanges(changes: ReadonlyMap<number, number>) {
    if (readOnly || totalArea === null) return;
    const targets = [...changes].filter(([, delta]) => delta !== 0).map(([index, delta]) => {
      const current = derived.plots[index].areaGunthas ?? 0;
      return { index, current, area: Math.round((current + delta) * 10) / 10 };
    });
    if (!targets.length) return;
    if (targets.some(target => target.area < 0.1)) { setNotice("keepPlotArea"); return; }
    const allocated = targets.reduce((sum, target) => sum - target.current + target.area, derived.allocatedGunthas);
    if (allocated > totalGunthas + AREA_TOLERANCE) { setNotice("overCapacity"); return; }

    try {
      // Temporary index IDs also disambiguate legacy plots whose fallback ID matches a saved ID.
      let next = state.cropAllocations.map((plot, index): CropAllocation => ({ ...plot, plotId: `tile-plot-${index}` }));
      for (const { index, area } of targets.sort((a, b) => (a.area - a.current) - (b.area - b.current))) {
        next = updatePlotGunthas(next, `tile-plot-${index}`, area, totalArea);
      }
      const restored = next.map((plot, index) => ({ ...plot, plotId: state.cropAllocations[index].plotId }));
      const parsed = CropAllocationsSchema.safeParse(restored);
      if (!parsed.success) { setNotice("cannotAdjust"); return; }
      state.setCropAllocations(parsed.data);
      setNotice("updated");
    } catch {
      setNotice("cannotAdjust");
    }
  }

  function adjustPlot(adjustment: Adjustment) {
    if (readOnly) return;
    if (adjustment !== "fill") { applyChanges(new Map([[activeIndex, adjustment]])); return; }
    const area = derived.plots[activeIndex].areaGunthas ?? 0;
    // Stored edits use tenths. Round down to keep the edited plot inside the surveyed boundary.
    const maximum = Math.floor((area + (derived.unassignedGunthas ?? 0) + AREA_TOLERANCE) * 10) / 10;
    if (maximum <= area) { setNotice("noRoom"); return; }
    applyChanges(new Map([[activeIndex, maximum - area]]));
  }

  function applyTiles(indices: ReadonlySet<number>, release: boolean) {
    const changes = new Map<number, number>();
    const add = (index: number, delta: number) => changes.set(index, (changes.get(index) ?? 0) + delta);
    for (const index of indices) {
      const tile = getTile(index);
      if (!tile || tile.fillFraction !== 1) continue;
      const owned = tile.kind === "plot" && tile.plotIndex === activeIndex;
      if (release) {
        if (owned) add(activeIndex, -1);
      } else if (!owned) {
        if (tile.kind === "plot") add(tile.plotIndex, -1);
        add(activeIndex, 1);
      }
    }
    applyChanges(changes);
  }

  function moveFocus(event: KeyboardEvent<HTMLDivElement>) {
    const button = tileButton(event.target, event.currentTarget);
    if (!button || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const index = Number(button.dataset.gunthaIndex);
    const column = index % COLUMNS;
    let next: number;
    switch (event.key) {
      case "ArrowLeft": next = column > 0 ? index - 1 : index; break;
      case "ArrowRight": next = column < COLUMNS - 1 ? index + 1 : index; break;
      case "ArrowUp": next = index - COLUMNS; break;
      case "ArrowDown": next = index + COLUMNS; break;
      default: return;
    }
    event.preventDefault();
    event.currentTarget.querySelector<HTMLButtonElement>(`[data-guntha-index="${next}"]`)?.focus();
  }

  function startPaint(event: PointerEvent<HTMLDivElement>) {
    if (!paintEnabled || !event.isPrimary || event.button !== 0 || stroke.current) return;
    const button = tileButton(event.target, event.currentTarget);
    if (!button) return;
    const index = Number(button.dataset.gunthaIndex);
    const tile = getTile(index);
    if (tile?.fillFraction !== 1) return;
    event.preventDefault();
    button.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    stroke.current = {
      pointerId: event.pointerId, allocations: state.cropAllocations, field: fieldGeometry, activeIndex,
      release: tile.kind === "plot" && tile.plotIndex === activeIndex, indices: new Set([index]),
    };
    setMarks(new Set([index]));
  }

  function continuePaint(event: PointerEvent<HTMLDivElement>) {
    const current = stroke.current;
    if (!paintEnabled || !current || current.pointerId !== event.pointerId) return;
    const hit = event.currentTarget.ownerDocument.elementFromPoint(event.clientX, event.clientY);
    const button = tileButton(hit, event.currentTarget);
    if (!button) return;
    const index = Number(button.dataset.gunthaIndex);
    const tile = getTile(index);
    const owned = tile?.kind === "plot" && tile.plotIndex === activeIndex;
    if (tile?.fillFraction !== 1 || owned !== current.release || current.indices.has(index)) return;
    current.indices.add(index);
    setMarks(new Set(current.indices));
  }

  function finishPaint(event: PointerEvent<HTMLDivElement>, commit: boolean) {
    const current = stroke.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (commit) continuePaint(event);
    stroke.current = null;
    setMarks(EMPTY_MARKS);
    if (commit && paintEnabled && current.allocations === state.cropAllocations &&
        current.field === fieldGeometry && current.activeIndex === activeIndex) {
      applyTiles(current.indices, current.release);
    }
  }

  const adjustments: readonly [Adjustment, string][] = [
    [1, "+1"], [-1, "−1"], [5, "+5"], [-5, "−5"], [40, text.addAcre], ["fill", text.fillRemaining],
  ];
  const rows = derived.plots.map((plot, index) => [
    plotLabels[index].name, plotLabels[index].crop,
    dictionary.stageNames[plot.lifecycleStage ?? growthToLifecycleStage(plot.growthStage)], showArea(plot.areaGunthas),
  ]);
  rows.push([text.unassigned, "—", "—", showArea(derived.unassignedGunthas)]);
  const noticeMessage = notice === "updated" && derived.plots[activeIndex]
    ? `${text.updated} ${plotLabels[activeIndex].name} · ${showArea(derived.plots[activeIndex].areaGunthas)}`
    : notice ? text[notice] : "";

  return <figure aria-labelledby={`${prefix}heading`} className="min-w-0 space-y-3 rounded-2xl border border-forest/20 bg-white p-3 md:p-1 lg:p-4">
    <h2 id={`${prefix}heading`} className="text-xl font-bold text-forest">{text.title}</h2>
    <svg aria-hidden="true" width="0" height="0" className="pointer-events-none absolute">
      <ProvenanceStroke idPrefix={prefix} />
    </svg>
    {totalGunthas <= 0 ? <p className="text-sm leading-body">{text.empty}</p> : <>
      {keys.length > 0 && <fieldset className="min-w-0 space-y-2 print:hidden" disabled={readOnly}>
        <legend className="text-sm font-semibold">{text.selectPlot}</legend>
        <div className="flex flex-wrap gap-2">
          {plotLabels.map((label, index) => <button key={keys[index]} type="button" aria-pressed={index === activeIndex}
            className={`min-h-12 min-w-12 max-w-full break-words rounded-full border px-3 text-sm font-semibold ${index === activeIndex ? "border-forest bg-forest text-white" : "border-border-strong bg-white text-forest"}`}
            onClick={() => { setSelection(keys[index]); setNotice(null); }}>{label.name}</button>)}
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label={text.adjustGunthas}>
          {adjustments.map(([adjustment, label]) => <button key={adjustment} type="button"
            className="button-secondary" onClick={() => adjustPlot(adjustment)}>
            {adjustment === "fill" || adjustment === 40 ? label : label.replace(/\d/g, digit => localNumber(Number(digit), locale))}
          </button>)}
          <button type="button" className="button-secondary hidden aria-pressed:bg-success-subtle md:inline-flex"
            aria-pressed={paintEnabled} onClick={() => { setPaint(!paint); setNotice(null); }}>{text.paint}</button>
        </div>
      </fieldset>}
      {sampleDataActive && <p className="flex items-center gap-2 text-sm print:hidden">
        <svg aria-hidden="true" viewBox="0 0 32 32" className="size-5 shrink-0">
          <TileFace fill={patternFill(SAMPLE_PATTERN_ID, prefix)} />
        </svg>
        {dictionary.sampleReadOnly}
      </p>}
      <p role="status" className={`text-sm print:hidden ${notice ? "" : "sr-only"}`}>{noticeMessage}</p>
      <div className="space-y-3">
        <div className="sticky top-0 z-30 flex items-center gap-2 rounded-lg border border-border-strong bg-surface-bg px-2 py-1.5 print:static">
          <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-bold sm:text-sm">
            <svg aria-hidden="true" viewBox="0 0 32 32" className="size-5 shrink-0">
              <TileFace fill={patternFill(FALLOW_PATTERN_ID, prefix)} />
            </svg>
            <span>{text.unassigned}<br />{showArea(derived.unassignedGunthas)}</span>
          </span>
          {keys.length > 0 && <ul aria-label={text.legend} tabIndex={0} className="flex min-w-0 gap-2 overflow-x-auto border-l border-border-strong px-2 py-0.5 text-xs">
            {plotLabels.map((label, index) => <li key={keys[index]} className="flex w-max max-w-52 shrink-0 items-center gap-1.5">
              <svg aria-hidden="true" viewBox="0 0 32 32" className="size-7 shrink-0">
                <TileFace fill={patternFill(CROP_PATTERN_IDS[index % CROP_PATTERN_IDS.length], prefix)} marker={label.marker} />
              </svg>
              <span className="min-w-0 break-words"><b>{label.name}</b><br />{label.crop} · {showArea(derived.plots[index].areaGunthas)}</span>
            </li>)}
          </ul>}
        </div>
        {!readOnly && <p id={`${prefix}keys`} className="hidden text-sm md:block print:hidden">
          {paintEnabled ? text.paintHelp : text.keyboardHelp}
        </p>}
        <div role="group" aria-label={text.title} className={`grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,27rem),1fr))] print:hidden ${paintEnabled ? "md:touch-none" : ""}`}
          aria-describedby={readOnly ? undefined : `${prefix}keys`}
          onKeyDown={moveFocus}
          onFocus={event => {
            const button = tileButton(event.target, event.currentTarget);
            if (button) setFocusedTile(Number(button.dataset.gunthaIndex));
          }}
          onClick={event => {
            if (paintEnabled && event.detail !== 0) return;
            const button = tileButton(event.target, event.currentTarget);
            if (!button) return;
            const index = Number(button.dataset.gunthaIndex);
            const tile = getTile(index);
            applyTiles(new Set([index]), tile?.kind === "plot" && tile.plotIndex === activeIndex);
          }}
          onPointerDown={startPaint} onPointerMove={continuePaint} onPointerUp={event => finishPaint(event, true)}
          onPointerCancel={event => finishPaint(event, false)} onLostPointerCapture={event => finishPaint(event, false)}>
          {blocks.map(block => {
            const tabStop = Math.min(focusedTile, tileCount - 1);
            const focusIndex = Math.floor(tabStop / GUNTHAS_PER_ACRE) === block.acreIndex ? tabStop : -1;
            return <AcreCard key={block.acreIndex} block={block} locale={locale} labels={plotLabels} prefix={prefix}
              readOnly={readOnly} focusIndex={focusIndex} marks={marks} />;
          })}
        </div>
      </div>
    </>}
    <VizTable locale={locale} caption={dictionary.viz.textTwins.land}
      columns={[dictionary.plotNameLabel, dictionary.crop, dictionary.stage, text.area]} rows={rows} />
    <VizCaption summary={text.caption} provenance={sampleDataActive ? "sample" : "you_entered"} locale={locale} />
  </figure>;
}
