import { useId } from "react";
import { t } from "@/config/i18n";
import type { buildWaterRibbon } from "@/lib/domain/viz/waterRibbon";
import type { Locale } from "@/types/domain";
import { patternFill, ProvenanceStroke, provenanceStrokeDasharray, SAMPLE_PATTERN_ID } from "./ProvenanceStroke";

export type WaterRibbonDay = ReturnType<typeof buildWaterRibbon>[number];

interface WaterDayColumnProps {
  day: WaterRibbonDay;
  locale: Locale;
  scaleMaxMm: number;
  label: string;
  weekday: string;
  dateLabel: string;
  temperatureLabel: string;
  rainLabel: string;
  dialogId: string;
  onOpen: (date: string, trigger: HTMLButtonElement) => void;
}

export function WaterDayColumn({
  day, locale, scaleMaxMm, label, weekday, dateLabel, temperatureLabel, rainLabel, dialogId, onOpen,
}: WaterDayColumnProps) {
  const prefix = `water-day-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}-`;
  const text = t(locale).viz.waterRibbon;
  const graphBottom = 63;
  const graphHeight = 52;
  const rainHeight = day.scaledRainMm === null ? 0 : day.scaledRainMm / scaleMaxMm * graphHeight;
  const needY = day.cropNeedMm === null ? null : graphBottom - day.cropNeedMm / scaleMaxMm * graphHeight;

  return <button type="button" aria-label={label} aria-haspopup="dialog" aria-controls={dialogId}
    onClick={event => onOpen(day.date, event.currentTarget)}
    className="press flex min-h-12 min-w-12 flex-col items-center justify-start gap-1 rounded-xl border border-border-strong bg-daylight px-1 py-2 text-center text-ink hover:bg-surface-bg">
    <span aria-hidden="true" className="text-sm font-bold leading-tight [overflow-wrap:anywhere]">
      <span className="block">{weekday}</span>
      <span className="block font-medium tabular-nums">{dateLabel}</span>
    </span>
    <span aria-hidden="true" className="text-sm leading-tight tabular-nums [overflow-wrap:anywhere]">{temperatureLabel}</span>
    <svg aria-hidden="true" viewBox="0 0 46 70" className="mx-auto block h-[4.25rem] w-full max-w-14">
      {day.provenance === "sample" && <ProvenanceStroke idPrefix={prefix} />}
      <rect x="3" y="3" width="40" height="64" rx="5" className="fill-white stroke-forest stroke-2"
        strokeDasharray={provenanceStrokeDasharray(day.provenance)} />
      {day.provenance === "sample" && <rect x="4" y="4" width="38" height="62" rx="4"
        fill={patternFill(SAMPLE_PATTERN_ID, prefix)} />}
      {rainHeight > 0 && <rect x="15" y={graphBottom - rainHeight} width="16" height={rainHeight} rx="2" className="fill-info" />}
      {needY !== null && <g strokeLinecap="round">
        <path d={`M8 ${needY}H38`} stroke="white" strokeWidth="4" />
        <path d={`M8 ${needY}H38`} className="stroke-forest stroke-[2.5]" />
      </g>}
    </svg>
    <span aria-hidden="true" className="text-sm leading-tight tabular-nums [overflow-wrap:anywhere]">{rainLabel}</span>
    {(day.irrigate || day.heavyRainCaution) && <span aria-hidden="true" className="flex flex-wrap justify-center gap-1">
      {day.irrigate && <svg viewBox="0 0 24 24" className="size-5 rounded bg-info-subtle p-0.5 text-on-info-subtle"
        fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <title>{text.irrigate}</title>
        <path d="M12 3c3 5 6 8 6 12a6 6 0 0 1-12 0c0-4 3-7 6-12Zm-3 12a3 3 0 0 0 3 3" />
      </svg>}
      {day.heavyRainCaution && <svg viewBox="0 0 24 24" className="size-5 rounded bg-amber p-0.5 text-ink"
        fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <title>{text.fertiliser}</title>
        <path d="M12 3 2 21h20L12 3Zm0 6v5m0 3v.1" />
      </svg>}
    </span>}
  </button>;
}
