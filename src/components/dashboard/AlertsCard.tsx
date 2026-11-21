"use client";

import { useBalramStore } from "@/store/useBalramStore";
import { generateFieldVoiceAdvisories } from "@/lib/domain/fieldVoice";
import { cropLabel, t } from "@/config/i18n";
import { displayPlotName } from "@/lib/domain/landUnits";
import { SectionDisclosure } from "@/components/ui/SectionDisclosure";
import { Card } from "./Card";

export function AlertsCard() {
  const state = useBalramStore(value => value);
  const { locale } = state;
  const text = t(locale);
  const mr = locale === "mr";
  // The domain engine returns advisories in priority order.
  const advisories = generateFieldVoiceAdvisories({
    allocations: state.cropAllocations, soilKitReading: state.soilKitReading,
    weatherSnapshot: state.weatherSnapshot, nowMs: state.now,
  });
  const fallback = advisories.find(advisory => advisory.ruleId === "general_seasonal_guidance");

  return (
    <Card id="alerts" title={text.voice} eyebrow={text.voiceEyebrow} className="md:col-span-2">
      <div className="mt-3 space-y-3" aria-live="polite">
        {fallback ? (
          <section className="rounded-xl bg-surface-muted p-4">
            <h3 className="font-bold">{text.noUrgentAdvice}</h3>
            <p className="mt-1 text-sm leading-body">{fallback.reason[locale]}</p>
          </section>
        ) : advisories.map(advisory => (
          <article key={advisory.id} className="rounded-xl border border-forest/15 p-4">
            <div className="flex flex-wrap gap-2 text-sm leading-body">
              <span className={`rounded-full px-3 py-1 font-semibold ${advisory.priority === "urgent" ? "bg-warning-subtle text-on-warning-subtle" : "bg-info-subtle text-on-info-subtle"}`}>
                {advisory.priority === "urgent" ? (mr ? "तातडीची कृती" : "Urgent Field Action")
                  : advisory.priority === "action" ? (mr ? "माती व पोषण कृती" : "Soil & Nutrient Action")
                  : (mr ? "शेत टीप" : "Field Tip")}
              </span>
              {advisory.plotName && <span className="rounded-full bg-surface-muted px-3 py-1">
                {displayPlotName(advisory.plotName, locale)}{advisory.cropId ? ` · ${cropLabel(locale, advisory.cropId)}` : ""}
              </span>}
            </div>
            <h3 className="mt-2 font-bold">{advisory.headline[locale]}</h3>
            <p className="mt-1 text-sm leading-body">{advisory.message[locale]}</p>
            <p className="mt-2 text-sm font-semibold leading-body">{advisory.actionLabel[locale]}</p>
            <SectionDisclosure title={text.whyAdvice} className="mt-3">
              <p className="text-sm leading-body">{advisory.reason[locale]}</p>
            </SectionDisclosure>
          </article>
        ))}
      </div>
    </Card>
  );
}
