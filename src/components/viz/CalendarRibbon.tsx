import { useId } from "react";
import type { Season } from "@/config/cropMatrix";
import { seasonLabel, t } from "@/config/i18n";
import type { buildCropCalendar } from "@/lib/domain/viz/calendarLayout";
import { LifecycleStageSchema, type LifecycleStage, type Locale } from "@/types/domain";
import { CROP_PATTERN_IDS, patternFill, ProvenanceStroke } from "./ProvenanceStroke";

type CalendarLayout = ReturnType<typeof buildCropCalendar>;
type Month = CalendarLayout["months"][number];
type Plot = CalendarLayout["plots"][number];
export type CalendarHalf = 0 | 1;

interface CalendarPlotLabel {
  key: string;
  name: string;
  crop: string;
  needsPlantingDate: boolean;
}

interface CalendarRibbonProps {
  layout: CalendarLayout;
  labels: readonly CalendarPlotLabel[];
  locale: Locale;
  formatDate: (iso: string) => string;
  half: CalendarHalf;
  selectedKey: string | null;
  actionsId: string;
  onHalfChange: (half: CalendarHalf) => void;
  onPlotSelect: (key: string) => void;
  printStatic?: boolean;
}

const bandFills: Record<Exclude<Season, "Perennial">, string> = {
  Kharif: "fill-success-subtle", Rabi: "fill-info-subtle", Zaid: "fill-warning-subtle",
};

const stagePatterns: Record<LifecycleStage, typeof CROP_PATTERN_IDS[number]> = {
  planned: CROP_PATTERN_IDS[1],
  vegetative: CROP_PATTERN_IDS[0],
  flowering_fruiting: CROP_PATTERN_IDS[2],
  harvesting: CROP_PATTERN_IDS[3],
};

const percent = (value: number) => `${value}%`;
const twoColumnPrint = "lg:grid-cols-[8.5rem_minmax(0,1fr)] print:grid-cols-[8.5rem_minmax(0,1fr)]";

function MonthBands({ months, height, project }: {
  months: readonly Month[];
  height: number;
  project: (value: number) => number;
}) {
  return <g aria-hidden="true">
    {months.map((month) => {
      const x = project(month.startXPercent);
      const width = project(month.endXPercent) - x;
      const fill = month.season === "Perennial" ? "fill-surface-muted" : bandFills[month.season];
      return <g key={month.monthZeroIndexed}>
        <rect x={percent(x)} width={percent(width)} height={height} className={fill} fillOpacity=".4" />
        {x > 0 && <line x1={percent(x)} x2={percent(x)} y2={height} className="stroke-border-strong" strokeOpacity=".4" />}
      </g>;
    })}
  </g>;
}

function HarvestDiamond({ x = "0", y = "0" }: { x?: string; y?: string }) {
  return <svg x={x} y={y} width="1" height="1" overflow="visible" aria-hidden="true">
    <path d="M0-6 6 0 0 6-6 0Z" className="fill-amber stroke-ink" strokeWidth="1.4" />
  </svg>;
}

function RibbonWindow({
  layout, labels, locale, formatDate, selectedKey, actionsId, onPlotSelect,
  className, prefix, startMonth, endMonth, printStatic,
}: Omit<CalendarRibbonProps, "half" | "onHalfChange"> & {
  className?: string;
  prefix: string;
  startMonth: number;
  endMonth: number;
}) {
  const dictionary = t(locale);
  const text = dictionary.viz.cropCalendar;
  const months = layout.months.slice(startMonth, endMonth);
  const left = months[0].startXPercent;
  const right = months[months.length - 1].endXPercent;
  const project = (value: number) => (value - left) / (right - left) * 100;
  const inWindow = (value: number) => value >= left && value < right;
  const today = layout.todayXPercent !== null && inWindow(layout.todayXPercent) ? project(layout.todayXPercent) : null;
  const rowClass = `grid min-w-0 items-center gap-2 px-2 ${printStatic ? twoColumnPrint : ""}`;

  function clip(start: number, end: number) {
    const x = Math.max(start, left);
    const stop = Math.min(end, right);
    return stop > x ? { x: percent(project(x)), width: percent(project(stop) - project(x)) } : null;
  }

  function monthRange(start: number, end: number) {
    const visible = layout.months.filter(month => month.startXPercent < end && month.endXPercent > start);
    return visible.map(month => text.months[month.monthZeroIndexed]).join(" · ");
  }

  function track(plot: Plot, label: CalendarPlotLabel, descriptorId: string) {
    const stageTop = Math.max(20, 4 + plot.sowingWindows.length * 6);
    const trackHeight = stageTop + 26;
    const harvestHere = plot.harvest && inWindow(plot.harvest.xPercent) ? plot.harvest : null;
    const description = [
      label.name, label.crop,
      ...plot.sowingWindows.filter(window => clip(window.startXPercent, window.endXPercent))
        .map(window => `${text.sowingWindow} · ${seasonLabel(locale, window.season as Season)} · ${monthRange(Math.max(window.startXPercent, left), Math.min(window.endXPercent, right))}`),
      ...plot.stageBars.filter(bar => clip(bar.startXPercent, bar.endXPercent))
        .map(bar => `${dictionary.stageNames[bar.stage]} · ${formatDate(bar.startDate)} – ${formatDate(bar.endDate)}`),
      ...(harvestHere ? [`${text.harvestEstimate} · ${formatDate(harvestHere.date)}`] : []),
      ...(label.needsPlantingDate ? [text.addPlantingDate] : []),
    ].join(". ");

    return <>
      <span className="min-w-0 text-left text-sm leading-snug [overflow-wrap:anywhere]">
        <span className="block font-bold text-forest">{label.name}</span>
        <span className="block">{label.crop}</span>
        {label.needsPlantingDate && <span className="block text-muted-foreground">{text.addPlantingDate}</span>}
      </span>
      <svg width="100%" height={trackHeight} className="block overflow-visible"
        role={printStatic ? "img" : undefined} aria-label={printStatic ? description : undefined} aria-hidden={printStatic ? undefined : true}>
        <MonthBands months={months} height={trackHeight} project={project} />
        {plot.sowingWindows.map((window, index) => {
          const span = clip(window.startXPercent, window.endXPercent);
          return span && <rect key={index} {...span} y={3 + index * 6} height="5" rx="2"
            className="fill-daylight stroke-forest" strokeWidth="1" strokeDasharray="3 2">
            <title>{`${text.sowingWindow} · ${seasonLabel(locale, window.season as Season)}`}</title>
          </rect>;
        })}
        {plot.stageBars.map(bar => {
          const span = clip(bar.startXPercent, bar.endXPercent);
          return span && <rect key={`${bar.stage}-${bar.startDate}`} {...span} y={stageTop} height="12" rx="2"
            fill={patternFill(stagePatterns[bar.stage], prefix)}>
            <title>{`${dictionary.stageNames[bar.stage]} · ${formatDate(bar.startDate)} – ${formatDate(bar.endDate)}`}</title>
          </rect>;
        })}
        {today !== null && <g aria-hidden="true">
          <line x1={percent(today)} x2={percent(today)} y2={trackHeight} stroke="white" strokeWidth="3.5" />
          <line x1={percent(today)} x2={percent(today)} y2={trackHeight} className="stroke-forest" strokeWidth="1.8" />
        </g>}
        {harvestHere && <g>
          <title>{`${text.harvestEstimate} · ${formatDate(harvestHere.date)}`}</title>
          <HarvestDiamond x={percent(project(harvestHere.xPercent))} y={String(stageTop + 19)} />
        </g>}
      </svg>
      {!printStatic && <span id={descriptorId} className="sr-only">{description}</span>}
    </>;
  }

  return <div className={className}>
    <div className="rounded-xl border border-forest/20 bg-daylight">
      <div className={`${rowClass} mx-1 border-x border-transparent pt-2 print:break-after-avoid`}>
        {printStatic && <span className="hidden text-sm font-semibold text-forest lg:block print:block">{dictionary.plotNameLabel}</span>}
        <div className="relative rounded-md text-ink">
          {today !== null && <svg width="100%" height="23" className="block overflow-visible" aria-label={text.today} role="img">
            <line x1={percent(today)} x2={percent(today)} y1="17" y2="23" className="stroke-forest" strokeWidth="1.8" />
            <svg x={percent(today)} width="1" height="1" overflow="visible">
              <rect x={today < 10 ? -4 : today > 90 ? -40 : -22} width="44" height="18" rx="6" className="fill-forest" />
              <text x={today < 10 ? 18 : today > 90 ? -18 : 0} y="13" textAnchor="middle"
                fill="white" className="text-xs font-bold">{text.today}</text>
            </svg>
          </svg>}
          <div className="relative overflow-hidden rounded-md">
            <svg aria-hidden="true" width="100%" height="100%" className="absolute inset-0">
              <MonthBands months={months} height={32} project={project} />
            </svg>
            <div className={`relative grid h-8 items-center text-center text-xs font-bold leading-tight print:text-sm
              ${months.length === 6 ? "grid-cols-6" : "grid-cols-12"}`}>
              {months.map(month => <span key={month.monthZeroIndexed} title={seasonLabel(locale, month.season)}
                className="min-w-0 [overflow-wrap:anywhere]">
                {text.months[month.monthZeroIndexed]}
              </span>)}
            </div>
          </div>
        </div>
      </div>

      <ul className="space-y-1 p-1">
        {layout.plots.map((plot, index) => {
          const label = labels[index];
          const active = selectedKey === label.key;
          const descriptionId = `${prefix}${startMonth}-${endMonth}-${index}-detail`;
          return <li key={label.key} className="break-inside-avoid">
            {printStatic ? <div className={`${rowClass} rounded-lg border border-forest/15 bg-white py-1.5`}>
              {track(plot, label, descriptionId)}
            </div> : <button type="button" aria-pressed={active} aria-controls={actionsId} aria-describedby={descriptionId}
              aria-label={`${label.name} · ${label.crop}`} onClick={() => onPlotSelect(label.key)}
              className={`${rowClass} press w-full min-h-12 rounded-lg border py-2
                ${active ? "border-forest bg-success-subtle ring-2 ring-inset ring-forest" : "border-forest/20 bg-white hover:border-forest"}`}>
              {track(plot, label, descriptionId)}
            </button>}
          </li>;
        })}
      </ul>
    </div>
  </div>;
}

export function CalendarRibbon(props: CalendarRibbonProps) {
  const { locale, layout, half, onHalfChange, printStatic } = props;
  const prefix = `calendar-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}-`;
  const dictionary = t(locale);
  const text = dictionary.viz.cropCalendar;
  if (!layout.plots.length) return <p className="text-sm leading-body">{text.noPlots}</p>;

  const start = half * 6;
  const end = start + 6;
  return <div className="min-w-0 space-y-3">
    <svg width="0" height="0" aria-hidden="true" className="pointer-events-none absolute">
      <ProvenanceStroke idPrefix={prefix} />
    </svg>
    {!printStatic && <>
      <div className="space-y-2 md:hidden print:hidden">
        <p role="status" className="text-sm font-bold text-forest">{text.months[start]} – {text.months[end - 1]}</p>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="button-secondary min-h-12 px-2" aria-disabled={half === 0}
            onClick={() => half === 1 && onHalfChange(0)}>{text.previousMonths}</button>
          <button type="button" className="button-secondary min-h-12 px-2" aria-disabled={half === 1}
            onClick={() => half === 0 && onHalfChange(1)}>{text.nextMonths}</button>
        </div>
      </div>
      <RibbonWindow {...props} startMonth={start} endMonth={end} prefix={prefix} className="md:hidden print:hidden" />
    </>}
    <RibbonWindow {...props} startMonth={0} endMonth={12} prefix={prefix}
      className={printStatic ? undefined : "hidden md:block print:hidden"} />
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-sm leading-snug text-ink print:break-inside-avoid" aria-label={text.legend}>
      {(["Kharif", "Rabi", "Zaid"] as const).map(season => <li key={season} className="flex items-center gap-1">
        <svg width="16" height="12" aria-hidden="true"><rect x="1" y="1" width="14" height="10" rx="2"
          className={`${bandFills[season]} stroke-border-strong`} /></svg>
        {seasonLabel(locale, season)}
      </li>)}
      <li className="flex items-center gap-1">
        <svg width="19" height="12" aria-hidden="true" className="shrink-0"><rect x="1" y="2" width="17" height="8" rx="2"
          className="fill-daylight stroke-forest" strokeDasharray="3 2" /></svg>
        {text.sowingWindow}
      </li>
      {LifecycleStageSchema.options.map(stage => <li key={stage} className="flex items-center gap-1">
        <svg width="16" height="12" aria-hidden="true"><rect width="16" height="12" rx="2" fill={patternFill(stagePatterns[stage], prefix)} /></svg>
        {dictionary.stageNames[stage]}
      </li>)}
      <li className="flex items-center gap-1">
        <svg width="16" height="14" aria-hidden="true"><HarvestDiamond x="8" y="7" /></svg>
        {text.harvestEstimate}
      </li>
    </ul>
  </div>;
}
