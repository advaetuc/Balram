import { useId } from "react";
import { t } from "@/config/i18n";
import { formatNumber } from "@/lib/ui/format";
import type { Locale } from "@/types/domain";
import { patternFill, ProvenanceStroke, SAMPLE_PATTERN_ID } from "./ProvenanceStroke";

type GaugeStatus = keyof ReturnType<typeof t>["viz"]["status"];

export interface BulletGaugeZone {
  min: number;
  max: number;
  label: string;
  threshold: string;
  status: GaugeStatus;
}

interface BulletGaugeProps {
  locale: Locale;
  label: string;
  unit?: string;
  min: number;
  max: number;
  zones: readonly BulletGaugeZone[];
  vertisolBand?: readonly [number, number];
  pinPercent: number | null;
  pinLabel: string | null;
  highlightedBandIndex: number;
  sample?: boolean;
  aboveScale?: boolean;
}

const marks = {
  good: { fill: "fill-success-subtle", path: "m-5 0 3 3 7-7" },
  fair: { fill: "fill-warning-subtle", path: "M-5 0H5" },
  needs_help: { fill: "fill-destructive-subtle", path: "M0-7 7 6H-7Z M0-2v3m0 2v.2" },
} as const;

function StatusMark({ status }: { status: GaugeStatus }) {
  return <path d={marks[status].path} fill="none" stroke="currentColor" strokeWidth="1.7"
    strokeLinecap="round" strokeLinejoin="round" />;
}

export function BulletGauge({
  locale, label, unit, min, max, zones, vertisolBand, pinPercent, pinLabel, highlightedBandIndex, sample = false, aboveScale = false,
}: BulletGaugeProps) {
  const dictionary = t(locale).viz;
  const text = dictionary.soilGauges;
  const prefix = `gauge-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}-`;
  const selected = zones[highlightedBandIndex];
  const chosen = text.chosen.replace("{0}", selected.label);
  const reading = pinLabel === null ? chosen : unit ? `${pinLabel} ${unit}` : pinLabel;
  const statusLabel = `${selected.label} · ${dictionary.status[selected.status]}`;
  const axisUnit = unit ? `${label} (${unit})` : label;
  const x = (value: number) => 5 + (value - min) / (max - min) * 90;
  const pinX = pinPercent === null ? null : 5 + pinPercent * 0.9;
  const ticks = [min, ...zones.map(zone => zone.max)];
  const staggerTicks = zones.length > 3;
  const hasPin = pinX !== null && pinLabel !== null;
  const barTop = hasPin ? 34 : 7;
  const barHeight = 25;
  const tickTop = barTop + barHeight;
  const tickBottom = tickTop + (staggerTicks ? 41 : 23);
  const height = tickBottom + (vertisolBand ? 15 : 3);
  const pillWidth = pinLabel === null ? 0 : 18 + pinLabel.length * 9;
  // Keep the pill inside the graphic at the endpoints. The pin still sits on the exact value.
  const pillOffset = pinX === null ? 0 : pinX < 23 ? -4 : pinX > 77 ? 4 - pillWidth : -pillWidth / 2;
  const bandLabel = vertisolBand
    ? `${text.vertisol} · ${vertisolBand.map(value => formatNumber(value, 1, locale)).join("–")}`
    : null;
  const ariaLabel = [
    axisUnit, reading, statusLabel, ...(aboveScale ? [text.aboveScale] : []), ...(bandLabel ? [bandLabel] : []),
    ...zones.map(zone => `${zone.label} ${zone.threshold}, ${dictionary.status[zone.status]}`),
  ].join(". ");

  return <section className="min-w-0 space-y-2 rounded-xl border border-border-strong bg-daylight p-2.5 text-ink sm:p-3">
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <h4 className="font-bold leading-heading text-forest">{axisUnit}</h4>
      <p className="text-sm font-semibold leading-body">{pinPercent === null ? chosen : statusLabel}</p>
    </div>
    <svg role="img" lang={locale} aria-label={ariaLabel} width="100%" height={height}
      className="block overflow-visible text-sm font-semibold text-ink">
      {sample && <ProvenanceStroke idPrefix={prefix} />}
      {zones.map(zone => {
        const width = x(zone.max) - x(zone.min);
        return <g key={zone.min}>
          <rect x={`${x(zone.min)}%`} y={barTop} width={`${width}%`} height={barHeight} className={marks[zone.status].fill} />
          {sample && <rect x={`${x(zone.min)}%`} y={barTop + barHeight - 6}
            width={`${width}%`} height="5" fill={patternFill(SAMPLE_PATTERN_ID, prefix)} />}
          <svg x={`${x(zone.min) + width / 2}%`} y={barTop + barHeight / 2} width="1" height="1" overflow="visible">
            <StatusMark status={zone.status} />
          </svg>
        </g>;
      })}
      <rect x="5%" y={barTop} width="90%" height={barHeight} rx="3" fill="none" className="stroke-forest stroke-[1.5]" />
      {zones.slice(1).map(zone => <line key={zone.min} x1={`${x(zone.min)}%`} x2={`${x(zone.min)}%`}
        y1={barTop} y2={tickTop} className="stroke-forest stroke-[1.5]" />)}
      {pinX === null && <rect x={`${x(selected.min)}%`} y={barTop - 2}
        width={`${x(selected.max) - x(selected.min)}%`} height={barHeight + 4} rx="3"
        fill="none" className="stroke-forest stroke-[3]" />}
      {hasPin && <svg x={`${pinX}%`} y="0" width="1" height="1" overflow="visible">
        <line x1="0" x2="0" y1="22" y2={tickTop + 1} stroke="white" strokeWidth="5" />
        <line x1="0" x2="0" y1="22" y2={tickTop + 1} className="stroke-ink stroke-2" />
        <rect x={pillOffset} y="1" width={pillWidth} height="23" rx="10" className="fill-ink" />
        <text x={pillOffset + pillWidth / 2} y="17" textAnchor="middle" fill="white" className="tabular-nums">{pinLabel}</text>
      </svg>}
      {ticks.map((value, index) => {
        const tickX = `${x(value)}%`;
        const secondRow = staggerTicks && index % 2 === 1 && index < ticks.length - 1;
        const tickLength = secondRow ? 23 : 5;
        return <g key={value}>
          <line x1={tickX} x2={tickX} y1={tickTop} y2={tickTop + tickLength} className="stroke-forest" />
          <text x={tickX} y={tickTop + tickLength + 14} fill="currentColor" className="text-sm tabular-nums"
            textAnchor={index === 0 ? "start" : index === ticks.length - 1 ? "end" : "middle"}>
            {formatNumber(value, 1, locale)}
          </text>
        </g>;
      })}
      {vertisolBand && <g fill="none" className="stroke-forest stroke-[1.5]">
        <line x1={`${x(vertisolBand[0])}%`} x2={`${x(vertisolBand[1])}%`} y1={height - 5} y2={height - 5} strokeDasharray="4 3" />
        {vertisolBand.map(value => <line key={value} x1={`${x(value)}%`} x2={`${x(value)}%`} y1={height - 12} y2={height - 5} />)}
      </g>}
    </svg>
    {bandLabel && <p className="text-center text-sm font-medium leading-body text-forest">{bandLabel}</p>}
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-sm leading-body" aria-hidden="true">
      {zones.map(zone => <li key={zone.min} className="inline-flex items-start gap-1">
        <svg className="mt-0.5 size-4 shrink-0" aria-hidden="true" viewBox="-9 -9 18 18"><StatusMark status={zone.status} /></svg>
        <span>{zone.label}</span>
      </li>)}
    </ul>
    {aboveScale && <p className="text-sm">{text.aboveScale}</p>}
  </section>;
}
