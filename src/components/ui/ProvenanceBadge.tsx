import type { Locale } from "@/types/domain";
import type { ProvenanceTag } from "@/lib/domain/roadmap";
import { provenanceLabel } from "@/config/i18n";

// Tailwind 3 cannot apply slash opacity to a token defined as a hex CSS variable.
const softBorder = "border-border-strong/30 border-[color-mix(in_srgb,var(--color-border-strong)_30%,transparent)]";
const farmer = `bg-success-subtle text-on-success-subtle ${softBorder}`;
const estimate = `bg-warning-subtle text-on-warning-subtle ${softBorder}`;
const tone: Record<ProvenanceTag | "sample", string> = {
  measured_by_kit: farmer,
  you_entered: farmer,
  forecast: "bg-info-subtle text-on-info-subtle border-info/30 border-[color-mix(in_srgb,var(--color-info)_30%,transparent)]",
  estimated: estimate,
  assumed: estimate,
  sample: "bg-amber text-ink border-ink/20",
};

export function ProvenanceBadge({ provenance, locale }: { provenance: ProvenanceTag | "sample"; locale: Locale }) {
  const path = provenance === "measured_by_kit" ? <><path d="M9 3h6M10 3v5l-4 8a3 3 0 0 0 3 4h6a3 3 0 0 0 3-4l-4-8V3"/><path d="M8 14h8"/></>
    : provenance === "forecast" ? <><path d="M7 18h10a4 4 0 0 0 0-8 5 5 0 0 0-9-1 4 4 0 0 0-1 9Z"/><path d="m9 14 2 2 4-4"/></>
    : provenance === "estimated" ? <><path d="M5 19 19 5"/><path d="M7 7h.01M17 17h.01"/><circle cx="12" cy="12" r="9"/></>
    : provenance === "you_entered" ? <><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L9 17l-4 1 1-4Z"/></>
    : provenance === "assumed" ? <><path d="M12 3 3 20h18L12 3Z"/><path d="M12 9v4m0 3h.01"/></>
    : <><path d="M4 19V5m0 14h16"/><path d="m7 15 4-5 3 2 4-6"/></>;
  return <span className={`inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-semibold leading-body ${tone[provenance]}`}>
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="size-4 shrink-0">{path}</svg><span>{provenanceLabel(locale, provenance)}</span>
  </span>;
}
