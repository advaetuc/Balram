import { t } from "@/config/i18n";
import type { estimateWeeksToNextStage } from "@/lib/domain/viz/stageProgress";
import { formatNumber } from "@/lib/ui/format";
import { LifecycleStageSchema, type LifecycleStage, type Locale } from "@/types/domain";
import { StageIllustration } from "./StageIllustration";

export function StageRail({ stage, weeksToNext, locale }: {
  stage: LifecycleStage;
  weeksToNext: ReturnType<typeof estimateWeeksToNextStage>;
  locale: Locale;
}) {
  const dictionary = t(locale);
  const text = dictionary.viz.stageRail;
  const stages = LifecycleStageSchema.options;
  const activeIndex = stages.indexOf(stage);
  const estimate = weeksToNext?.nextStage
    ? (weeksToNext.weeksRemaining === 1 ? text.aboutOneWeek : text.aboutWeeks)
      .replace("{0}", formatNumber(weeksToNext.weeksRemaining, 0, locale))
      .replace("{1}", dictionary.stageNames[weeksToNext.nextStage])
    : null;

  return <div className="min-w-0 space-y-2">
    <ol role="list" aria-label={dictionary.viz.textTwins.stages} className="grid grid-cols-4">
      {stages.map((step, index) => {
        const complete = index < activeIndex;
        const current = index === activeIndex;
        return <li key={step} aria-current={current ? "step" : undefined}
          className="relative flex min-w-0 flex-col items-center gap-1 px-0.5 text-center text-sm leading-snug">
          {index < stages.length - 1 && <span aria-hidden="true"
            className={`absolute left-1/2 top-6 h-0.5 w-full ${complete ? "bg-forest" : "bg-surface-muted"}`} />}
          <span className={`relative z-10 grid size-12 shrink-0 place-items-center rounded-full border-2
            ${complete || current ? "border-forest bg-success-subtle" : "border-border-strong bg-daylight"}`}>
            <StageIllustration kind={step} className="size-8" />
            {complete && <span aria-hidden="true" className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full border-2 border-white bg-forest text-white">
              <svg viewBox="0 0 16 16" className="size-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m3 8 3 3 7-7" />
              </svg>
            </span>}
            {current && <span aria-hidden="true" className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full border-2 border-white bg-forest">
              <span className="size-1.5 rounded-full bg-white" />
            </span>}
          </span>
          <span className={`min-w-0 [overflow-wrap:anywhere] ${current ? "font-bold text-forest" : ""}`}>{dictionary.stageNames[step]}</span>
          {complete && <span className="sr-only">{text.completed}</span>}
        </li>;
      })}
    </ol>
    {estimate && <p className="text-center text-sm font-medium leading-body text-forest">{estimate}</p>}
  </div>;
}
