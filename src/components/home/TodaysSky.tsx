"use client";

import { ProvenanceBadge } from "@/components/ui/ProvenanceBadge";
import { SkyScene } from "@/components/viz/SkyScene";
import { StageIllustration } from "@/components/viz/StageIllustration";
import { t } from "@/config/i18n";
import { deriveSkyCondition } from "@/lib/domain/viz/skyCondition";
import { formatNumber } from "@/lib/ui/format";
import { useBalramStore } from "@/store/useBalramStore";

export function TodaysSky() {
  const { weatherSnapshot, cropAllocations, locale, sampleDataActive } = useBalramStore(state => state);
  const text = t(locale);
  const copy = text.viz.todaysSky;
  const sky = deriveSkyCondition({ weatherSnapshot, allocations: cropAllocations });
  const headline = sky.headline[locale];
  const temperature = (value: number | null) => value === null ? "—" : `${formatNumber(value, 1, locale)}°C`;
  const hasTemperature = sky.tempMin !== null || sky.tempMax !== null;
  const hasWeather = hasTemperature || sky.rainMm !== null;
  const range = hasTemperature ? `${temperature(sky.tempMin)} – ${temperature(sky.tempMax)}` : copy.noTemperature;
  const rain = sky.rainMm === null ? null : `${copy.rain} ${formatNumber(sky.rainMm, 1, locale)} mm`;
  const stage = cropAllocations.length ? sky.dominantStage : null;
  const stageLabel = stage ? `${copy.mainStage} · ${text.stageNames[stage]}` : copy.noStage;
  const provenance = hasWeather ? (sampleDataActive ? "sample" : sky.provenance) : null;
  const badge = provenance === "typical_season" ? "estimated" : provenance;
  const day = hasWeather ? weatherSnapshot?.daily[0]?.date : undefined;
  const dayLabel = day ? new Intl.DateTimeFormat(locale === "mr" ? "mr-IN" : "en-IN", {
    dateStyle: "medium", timeZone: "Asia/Kolkata",
  }).format(Date.parse(day)) : null;
  const temperatureSummary = hasTemperature
    ? `${copy.lowTemperature} ${sky.tempMin === null ? copy.unavailable : temperature(sky.tempMin)} · ${copy.highTemperature} ${sky.tempMax === null ? copy.unavailable : temperature(sky.tempMax)}`
    : copy.noTemperature;
  const summary = [headline, dayLabel, temperatureSummary, rain, stageLabel].filter(Boolean).join(". ");

  return <figure className="min-w-0 overflow-hidden rounded-2xl border border-forest/20 bg-white p-2 shadow-card sm:p-3">
    <SkyScene condition={headline === text.viz.sky.unavailable ? null : sky.condition} dominantStage={stage}
      provenance={provenance} ariaLabel={summary} locale={locale} />
    <figcaption className="grid min-w-0 gap-3 px-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-5 sm:px-3">
      <div className="min-w-0">
        <h2 className="text-lg font-bold leading-heading text-forest [overflow-wrap:anywhere]">{headline}</h2>
        {dayLabel && <time dateTime={day} className="block text-sm leading-body text-muted-foreground">{dayLabel}</time>}
        <p className="mt-1 text-2xl font-bold leading-heading tabular-nums text-ink" aria-label={temperatureSummary}>{range}</p>
        {rain && <p className="mt-1 text-sm leading-body text-ink">{rain}</p>}
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 sm:max-w-56 sm:justify-end">
        {stage && <div className="flex min-w-0 items-center gap-2 text-sm font-semibold leading-snug text-forest">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-success-subtle">
            <StageIllustration kind={stage} className="size-8" />
          </span>
          <span className="[overflow-wrap:anywhere]"><span className="block font-medium">{copy.mainStage}</span>{text.stageNames[stage]}</span>
        </div>}
        {badge && <ProvenanceBadge provenance={badge} locale={locale} />}
      </div>
    </figcaption>
  </figure>;
}
