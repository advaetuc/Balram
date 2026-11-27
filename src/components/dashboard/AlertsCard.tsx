"use client";

import { useBalramStore } from "@/store/useBalramStore";
import { generateFieldVoiceAdvisories, type FieldVoiceAdvisory } from "@/lib/domain/fieldVoice";
import { cropLabel, t } from "@/config/i18n";
import { displayPlotName } from "@/lib/domain/landUnits";
import { SectionDisclosure } from "@/components/ui/SectionDisclosure";
import { ProvenanceBadge } from "@/components/ui/ProvenanceBadge";
import type { Locale } from "@/types/domain";
import { Card } from "./Card";

export function FieldVoiceNote({ advisory, locale, featured = false, sample = false }: {
  advisory: FieldVoiceAdvisory;
  locale: Locale;
  featured?: boolean;
  sample?: boolean;
}) {
  const copy = t(locale).fieldVoice;
  const urgent = advisory.priority === "urgent";
  const Heading = featured ? "h2" : "h3";
  return <article className={`min-w-0 rounded-xl border border-forest/15 border-l-4 bg-white p-4
    ${urgent ? "border-l-amber" : "border-l-forest"}`}>
    {featured && <p className="mb-2 text-sm font-bold uppercase tracking-wide text-forest">{copy.eyebrow}</p>}
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className={`rounded-full px-3 py-1 font-semibold ${urgent ? "bg-warning-subtle text-on-warning-subtle" : "bg-success-subtle text-on-success-subtle"}`}>
        {copy.priority[advisory.priority]}
      </span>
      {sample && <ProvenanceBadge provenance="sample" locale={locale} />}
      {advisory.plotName && <span className="rounded-full bg-surface-muted px-3 py-1">
        {displayPlotName(advisory.plotName, locale)}{advisory.cropId ? ` · ${cropLabel(locale, advisory.cropId)}` : ""}
      </span>}
    </div>
    <Heading className={featured ? "mt-2 text-xl font-bold" : "mt-2 font-bold"}>{advisory.headline[locale]}</Heading>
    <p className="mt-1 leading-body">{advisory.message[locale]}</p>
    <p className="mt-2 text-sm font-semibold leading-body">{advisory.actionLabel[locale]}</p>
    <SectionDisclosure title={copy.why} className="mt-3">
      <p className="text-sm leading-body">{advisory.reason[locale]}</p>
    </SectionDisclosure>
  </article>;
}

export function AlertsCard() {
  const state = useBalramStore(value => value);
  const { locale } = state;
  const advisories = generateFieldVoiceAdvisories({
    allocations: state.cropAllocations, soilKitReading: state.soilKitReading,
    weatherSnapshot: state.weatherSnapshot, nowMs: state.now,
  });
  return <Card id="alerts" title={t(locale).fieldVoice.eyebrow} className="md:col-span-2">
    <div className="mt-3 space-y-3 stagger" aria-live="polite">
      {advisories.map(advisory => <FieldVoiceNote key={advisory.id} advisory={advisory}
        locale={locale} sample={state.sampleDataActive} />)}
    </div>
  </Card>;
}
