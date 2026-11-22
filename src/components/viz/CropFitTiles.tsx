import { t } from "@/config/i18n";
import type { CropFitStatus } from "@/lib/domain/viz/cropFit";
import type { Locale } from "@/types/domain";

const factors = ["soil", "water", "sowing"] as const;
const statuses = {
  good: { colors: "bg-success-subtle text-on-success-subtle", path: "m4 10 4 4 8-8" },
  fair: { colors: "bg-warning-subtle text-on-warning-subtle", path: "M4 10h12" },
  needs_help: { colors: "bg-destructive-subtle text-on-destructive-subtle", path: "M10 2 1.5 17h17L10 2Zm0 5.5v4m0 2.5v.1" },
} as const;

export function CropFitTiles({ fit, locale }: { fit: Record<typeof factors[number], CropFitStatus>; locale: Locale }) {
  const copy = t(locale).viz.cropFitTiles;
  return <dl className="grid grid-cols-3 gap-2 text-center text-sm leading-snug">
    {factors.map(factor => {
      const status = statuses[fit[factor]];
      return <div key={factor} className={`flex min-w-0 flex-col items-center gap-1 rounded-lg px-1 py-2 ${status.colors}`}>
        <dt className="min-w-0 max-w-full font-semibold [overflow-wrap:anywhere]">{copy[factor]}</dt>
        <dd className="flex min-w-0 max-w-full flex-col items-center gap-1 font-bold">
          <svg aria-hidden="true" focusable="false" viewBox="0 0 20 20" className="size-5 shrink-0"
            fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d={status.path} />
          </svg>
          <span className="min-w-0 max-w-full [overflow-wrap:anywhere]">{copy.status[fit[factor]]}</span>
        </dd>
      </div>;
    })}
  </dl>;
}
