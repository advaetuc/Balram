import type { Locale } from "@/types/domain";
import type { ProvenanceTag } from "@/lib/domain/roadmap";
import { provenanceLabel } from "@/config/i18n";

export function ProvenanceBadge({ provenance, locale }: { provenance: ProvenanceTag | "sample"; locale: Locale }) {
  const path = provenance === "measured_by_kit" ? <><path d="M9 3h6M10 3v5l-4 8a3 3 0 0 0 3 4h6a3 3 0 0 0 3-4l-4-8V3"/><path d="M8 14h8"/></>
    : provenance === "forecast" ? <><path d="M7 18h10a4 4 0 0 0 0-8 5 5 0 0 0-9-1 4 4 0 0 0-1 9Z"/><path d="m9 14 2 2 4-4"/></>
    : provenance === "estimated" ? <><path d="M5 19 19 5"/><path d="M7 7h.01M17 17h.01"/><circle cx="12" cy="12" r="9"/></>
    : provenance === "you_entered" ? <><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L9 17l-4 1 1-4Z"/></>
    : provenance === "assumed" ? <><path d="M12 3 3 20h18L12 3Z"/><path d="M12 9v4m0 3h.01"/></>
    : <><path d="M4 19V5m0 14h16"/><path d="m7 15 4-5 3 2 4-6"/></>;
  return <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-forest/20 bg-daylight px-3 py-1 text-xs font-semibold text-ink">
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="size-4">{path}</svg>{provenanceLabel(locale, provenance)}
  </span>;
}
