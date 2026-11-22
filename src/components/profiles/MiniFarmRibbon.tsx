import { useId } from "react";
import { t } from "@/config/i18n";
import type { CropId } from "@/config/cropMatrix";
import { CROP_PATTERN_IDS, FALLOW_PATTERN_ID, patternFill, ProvenanceStroke } from "@/components/viz/ProvenanceStroke";
import type { summarizeProfile } from "@/lib/domain/profiles";
import { formatNumber } from "@/lib/ui/format";
import type { Locale } from "@/types/domain";

export function MiniFarmRibbon({ segments, plotCount, locale }: {
  segments: ReturnType<typeof summarizeProfile>["segments"];
  plotCount: number;
  locale: Locale;
}) {
  const prefix = `mini-farm-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}-`;
  const dictionary = t(locale);
  const text = dictionary.profiles;
  const plots = segments.filter((segment) => segment.kind === "plot");
  if (plots.length === 0) {
    return <div className="h-2 rounded-full border border-dashed border-border-strong bg-surface-muted">
      <span className="sr-only">{text.ribbonEmpty}</span>
    </div>;
  }

  const shown = plots.reduce((total, plot) => total + plot.truePercent, 0);
  const width = Math.max(100, shown);
  let x = 0;
  return <div>
    <svg aria-hidden="true" viewBox={`0 0 ${width} 8`} preserveAspectRatio="none" className="block h-2 w-full overflow-hidden rounded-full">
      <ProvenanceStroke idPrefix={prefix} />
      <rect width={width} height="8" fill={patternFill(FALLOW_PATTERN_ID, prefix)} />
      {plots.map((plot) => {
        const left = x;
        x += plot.truePercent;
        return <rect key={plot.plotIndex} x={left} width={plot.truePercent} height="8" fill={patternFill(CROP_PATTERN_IDS[plot.patternIndex], prefix)} />;
      })}
    </svg>
    <span className="sr-only">{text.ribbon}. {plots.map((plot) =>
      text.ribbonShare.replace("{1}", formatNumber(plot.truePercent, 1, locale)).replace("{0}", () =>
        Object.hasOwn(dictionary.cropNames, plot.cropId) ? dictionary.cropNames[plot.cropId as CropId] : dictionary.crop)
    ).join(" · ")}{(shown < 99.99 || plots.length < plotCount) && ` · ${text.ribbonMore}`}</span>
  </div>;
}
