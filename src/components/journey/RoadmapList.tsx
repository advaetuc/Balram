import { useId } from "react";
import type { Locale } from "@/types/domain";
import type { RoadmapBucket, RoadmapItem } from "@/lib/domain/roadmap";
import { t } from "@/config/i18n";
import { ProvenanceBadge } from "@/components/ui/ProvenanceBadge";

const buckets: readonly RoadmapBucket[] = ["this_week", "next_two_weeks", "later"];
export function RoadmapList({ items, locale }: { items: readonly RoadmapItem[]; locale: Locale }) {
  const text = t(locale);
  const prefix = useId();
  return <div className="space-y-5">
    {items.length === 0 && <p className="notice">{text.roadmapEmpty}</p>}
    {buckets.map((bucket) => {
      const group = items.filter((item) => item.bucket === bucket);
      return <section key={bucket} aria-labelledby={`${prefix}-roadmap-${bucket}`}>
        <h3 id={`${prefix}-roadmap-${bucket}`} className="mb-2 text-lg font-bold">{text.roadmapBuckets[bucket]}</h3>
        {group.length ? <ul className="space-y-3 stagger">{group.map((item) => <li key={item.id} className="rounded-xl border border-forest/15 bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-2"><h4 className="font-bold">{item.title[locale]}</h4><ProvenanceBadge provenance={item.provenance} locale={locale}/></div>
          <p className="mt-2 text-sm leading-6">{item.detail[locale]}</p>
        </li>)}</ul> : <p className="text-sm text-stone-600">—</p>}
      </section>;
    })}
  </div>;
}
