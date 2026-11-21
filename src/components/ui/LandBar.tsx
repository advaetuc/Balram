import { t } from "@/config/i18n";
import { formatArea } from "@/lib/domain/landUnits";
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
        <progress role="progressbar" aria-label={text.allocation} aria-valuemin={0}
          aria-valuenow={progress} aria-valuemax={totalGunthas}
          aria-valuetext={`${text.planned} ${planned}, ${text.total} ${total}, ${text.free} ${free}`}
          value={progress} max={totalGunthas}
          className="block h-2 w-full appearance-none overflow-hidden rounded-full bg-surface-muted [&::-moz-progress-bar]:bg-forest [&::-webkit-progress-bar]:bg-surface-muted [&::-webkit-progress-value]:bg-forest" />
      )}
    </div>
  );
}
