"use client";

import { useId, useState } from "react";
import { t } from "@/config/i18n";
import { countProfileNameGraphemes, makeUniqueProfileName, validateProfileName } from "@/lib/domain/profileNames";
import { formatNumber } from "@/lib/ui/format";
import { useBalramStore } from "@/store/useBalramStore";
import { MAX_FARM_PROFILES, MAX_PROFILE_NAME_LENGTH, ProfileMetaSchema } from "@/types/domain";

import { SproutMark } from "./SproutMark";

export function NameFarmView({ onBack, onCreated }: {
  onBack: () => void;
  onCreated: (fromSample: boolean) => void;
}) {
  const { locale, profiles, createFarmProfile } = useBalramStore((state) => state);
  const text = t(locale).profiles;
  const id = useId();
  const [name, setName] = useState("");
  const [touched, setTouched] = useState(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const validation = validateProfileName(name, profiles);
  const message = touched && !validation.ok ? text.validation[validation.reason] : null;
  const capped = profiles.length >= MAX_FARM_PROFILES;
  const number = (value: number) => formatNumber(value, 0, locale);
  const counter = text.counter.replace("{0}", number(countProfileNameGraphemes(name))).replace("{1}", number(MAX_PROFILE_NAME_LENGTH));

  async function create(fromSample: boolean) {
    setTouched(!fromSample);
    if (pending || capped || (!fromSample && !validation.ok)) return;
    setPending(true);
    setFailed(false);
    try {
      await createFarmProfile(fromSample ? makeUniqueProfileName(text.sampleName, profiles) : name, { fromSample });
      onCreated(fromSample);
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  return <section className="mx-auto max-w-xl space-y-4">
    {profiles.length > 0 && <button type="button" className="button-secondary press min-h-12" onClick={onBack}>{text.back}</button>}
    <div className="bento-card overflow-hidden border-t-4 border-t-forest sm:p-8">
      <div className="rise-in mb-5 grid size-14 place-items-center rounded-2xl border border-border-strong bg-surface-muted text-forest">
        <SproutMark className="size-8" />
      </div>
      <h1 className="text-3xl font-bold leading-heading text-forest">{text.nameTitle}</h1>
      <p className="mt-2 text-muted-foreground">{text.nameSubtitle}</p>
      <form className="mt-6 space-y-4" onSubmit={(event) => { event.preventDefault(); void create(false); }}>
        <div>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <label htmlFor={id} className="font-bold">{text.nameLabel}</label>
            <span id={`${id}-count`} className="text-sm tabular-nums text-muted-foreground">{counter}</span>
          </div>
          <input id={id} className="mt-2 min-h-12 w-full rounded-xl border border-border-strong bg-white px-3 text-base"
            value={name} maxLength={ProfileMetaSchema.shape.name.maxLength ?? undefined}
            disabled={pending || capped} aria-invalid={!!message}
            aria-describedby={`${id}-count ${id}-hint`}
            onChange={(event) => { setName(event.target.value); setTouched(true); }}
            onBlur={() => { if (name) setTouched(true); }} />
          <p id={`${id}-hint`} aria-live="polite" className={`mt-1 text-sm ${message ? "font-semibold text-ink" : "text-muted-foreground"}`}>{message ?? text.nameHint}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {Object.values(text.suggestions).map((suggestion) => <button key={suggestion} type="button"
            className="button-secondary press min-h-12 rounded-full text-sm" disabled={pending || capped}
            onClick={() => { setName(suggestion); setTouched(true); }}>{suggestion}</button>)}
        </div>
        <button type="submit" className="button-primary press min-h-12 w-full" disabled={pending || capped}>
          {profiles.length > 0 ? text.createFarm : text.continueSetup}
        </button>
      </form>
      {capped && <p role="status" className="notice mt-4">{text.capReached}</p>}
      {failed && <p role="alert" className="notice mt-4">{text.actionFailed}</p>}
    </div>
    <button type="button" className="press flex min-h-12 w-full items-center gap-4 rounded-2xl border border-border-strong bg-surface-muted p-4 text-left"
      disabled={pending || capped} onClick={() => { void create(true); }}>
      <SproutMark className="size-7 shrink-0 text-forest" />
      <span><strong className="block text-forest">{text.sampleStart}</strong><span className="block text-sm text-ink">{text.sampleHint}</span></span>
    </button>
  </section>;
}
