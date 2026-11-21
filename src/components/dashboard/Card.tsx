"use client";

import type { ReactNode } from "react";
import { formatTime } from "@/lib/ui/format";
import { useBalramStore } from "@/store/useBalramStore";

export function Card({ id, title, eyebrow, children, className = "" }: {
  id: string; title: string; eyebrow?: string; children: ReactNode; className?: string;
}) {
  return <section aria-labelledby={`${id}-title`} className={`min-w-0 rounded-2xl border border-forest/15 bg-white p-4 shadow-card md:p-6 ${className}`}>
    {eyebrow && <p className="mb-2 text-sm font-bold uppercase leading-body tracking-widest text-forest">{eyebrow}</p>}
    <h2 id={`${id}-title`} className="text-2xl font-bold leading-heading tracking-tight">{title}</h2>
    {children}
  </section>;
}

export function DataCaption({ source, validAt, fetchedAt, modeled = false, sample = false, stale = false, offline = false }: {
  source: string; validAt: string | null; fetchedAt?: string | null; modeled?: boolean; sample?: boolean; stale?: boolean; offline?: boolean;
}) {
  const locale = useBalramStore((state) => state.locale);
  const mr = locale === "mr";
  const timestamp = fetchedAt ?? validAt;
  return <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-forest/10 pt-3 text-sm leading-body text-muted-foreground">
      {sample && <span className="inline-flex rounded-full px-3 py-1 font-semibold bg-amber text-ink">{mr ? "नमुना माहिती" : "Sample data"}</span>}
      {modeled && <span className="inline-flex rounded-full px-3 py-1 font-semibold border border-sky/40 bg-sky/10 text-ink">{mr ? "मॉडेलचा अंदाज" : "Modeled Estimate"}</span>}
      {stale && <span className="inline-flex rounded-full px-3 py-1 font-semibold bg-amber/25 text-ink">{mr ? "जुनी माहिती · तारीख तपासा" : "Stale · check dates"}</span>}
      {offline && <span className="inline-flex rounded-full px-3 py-1 font-semibold bg-stone-100 text-ink">{mr ? "ऑफलाइन · जतन केलेली माहिती" : "Offline · saved data"}</span>}
      <span className="inline-flex items-center rounded-full bg-stone-100 px-3 py-1">{source}</span>
      {timestamp && <span>· {formatTime(timestamp, locale)}</span>}
  </div>;
}
