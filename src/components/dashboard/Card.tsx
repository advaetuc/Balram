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
  return <div className="mt-5 border-t border-forest/10 pt-4 text-xs leading-6 text-stone-600">
    <div className="mb-2 flex flex-wrap gap-2">
      {sample && <span className="data-badge bg-amber text-ink">Sample data</span>}
      {modeled && <span className="data-badge border border-sky/40 bg-sky/10 text-ink">Modeled Estimate</span>}
      {stale && <span className="data-badge bg-amber/25 text-ink">Stale · check dates</span>}
      {offline && <span className="data-badge bg-stone-100 text-ink">Offline · saved data</span>}
    </div>
    <p>Source: {source}</p>
    <p>Valid at: {formatTime(validAt)}</p>
    {fetchedAt !== undefined && <p>Fetched: {formatTime(fetchedAt)}</p>}
  </div>;
}
