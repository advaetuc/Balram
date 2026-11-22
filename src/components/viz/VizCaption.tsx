import { ProvenanceBadge } from "@/components/ui/ProvenanceBadge";
import type { ProvenanceTag } from "@/lib/domain/roadmap";
import type { Locale } from "@/types/domain";

export function VizCaption({ summary, provenance, locale }: {
  summary: string;
  provenance: ProvenanceTag | "sample";
  locale: Locale;
}) {
  return <figcaption className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
    <span>{summary}</span>
    <ProvenanceBadge provenance={provenance} locale={locale} />
  </figcaption>;
}
