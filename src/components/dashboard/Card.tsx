import type { ReactNode } from "react";
import { formatTime } from "@/lib/ui/format";

export function Card({ id, title, eyebrow, children, className = "" }: {
  id: string; title: string; eyebrow?: string; children: ReactNode; className?: string;
}) {
  return <section aria-labelledby={`${id}-title`} className={`bento-card ${className}`}>
    {eyebrow && <p className="mb-2 text-xs font-bold uppercase tracking-widest text-forest">{eyebrow}</p>}
    <h2 id={`${id}-title`} className="text-xl font-bold tracking-tight">{title}</h2>
    {children}
  </section>;
}

export function DataCaption({ source, validAt, fetchedAt, modeled = false, sample = false, stale = false, offline = false }: {
  source: string; validAt: string | null; fetchedAt?: string | null; modeled?: boolean; sample?: boolean; stale?: boolean; offline?: boolean;
}) {
  const timestamp = fetchedAt ?? validAt;
  return <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-forest/10 pt-3 text-xs text-stone-600">
      {sample && <span className="data-badge bg-amber text-ink">Sample data</span>}
      {modeled && <span className="data-badge border border-sky/40 bg-sky/10 text-ink">Modeled Estimate</span>}
      {stale && <span className="data-badge bg-amber/25 text-ink">Stale · check dates</span>}
      {offline && <span className="data-badge bg-stone-100 text-ink">Offline · saved data</span>}
      <span className="inline-flex items-center rounded-full bg-stone-100 px-3 py-1">{source}</span>
      {timestamp && <span className="whitespace-nowrap">· {formatTime(timestamp)}</span>}
  </div>;
}
