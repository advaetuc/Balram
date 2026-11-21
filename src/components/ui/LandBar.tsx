import { useRef } from "react";
import { t } from "@/config/i18n";
import { formatArea } from "@/lib/domain/landUnits";
import { useCssVar } from "@/lib/ui/useCssVar";
import type { LandUnit, Locale } from "@/types/domain";

export function LandBar({ totalGunthas, allocatedGunthas, unit, locale }: {
  totalGunthas: number | null;
  allocatedGunthas: number;
  unit: LandUnit;
  locale: Locale;
}) {
  const text = t(locale).landBar;
  const planned = formatArea(allocatedGunthas, unit, locale);
  const total = totalGunthas === null ? text.unknown : formatArea(totalGunthas, unit, locale);
  const free = totalGunthas === null
    ? text.unknown
    : formatArea(Math.max(0, totalGunthas - allocatedGunthas), unit, locale);
  const progress = totalGunthas === null ? 0 : Math.max(0, Math.min(allocatedGunthas, totalGunthas));
  const ratio = totalGunthas === null || totalGunthas <= 0 ? 0 : progress / totalGunthas;
  const fillRef = useRef<HTMLDivElement>(null);
  useCssVar(fillRef, "--p", ratio);
  const stats = [
    { label: text.total, value: total },
    { label: text.planned, value: planned },
    { label: text.free, value: free },
  ];

  return (
    <div lang={locale} className="min-w-0 space-y-3 rounded-xl border border-forest/15 bg-white p-3 text-sm leading-body">
      <dl className="grid grid-cols-3 gap-2">
        {stats.map(({ label, value }) => (
          <div key={label} className="min-w-0 break-words">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
      {totalGunthas !== null && totalGunthas > 0 && (
        <div role="progressbar" aria-label={text.allocation} aria-valuemin={0}
          aria-valuenow={progress} aria-valuemax={totalGunthas}
          aria-valuetext={`${text.planned} ${planned}, ${text.total} ${total}, ${text.free} ${free}`}
          className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
          <div ref={fillRef} className="fill-x h-full w-full bg-forest" />
        </div>
      )}
    </div>
  );
}
