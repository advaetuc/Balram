"use client";

import { useId, useRef, useState } from "react";
import { ProvenanceBadge } from "@/components/ui/ProvenanceBadge";
import { t } from "@/config/i18n";
import { summarizeProfile } from "@/lib/domain/profiles";
import { makeUniqueProfileName, validateProfileName } from "@/lib/domain/profileNames";
import type { DeletedProfileSnapshot } from "@/lib/domain/profileOperations";
import { formatNumber } from "@/lib/ui/format";
import { useCssVar } from "@/lib/ui/useCssVar";
import { useBalramStore } from "@/store/useBalramStore";
import { MAX_FARM_PROFILES, ProfileMetaSchema, type ProfileMeta } from "@/types/domain";
import { FarmDialog } from "./FarmDialog";
import { farmCardDetails } from "./farmCardDetails";
import { MiniFarmRibbon } from "./MiniFarmRibbon";

export function MyFarmsView({ onNew, onOpen, onDeleted }: {
  onNew: () => void;
  onOpen: (setupComplete: boolean) => void;
  onDeleted: (snapshot: DeletedProfileSnapshot) => void;
}) {
  const state = useBalramStore((value) => value);
  const { locale, profiles } = state;
  const dictionary = t(locale);
  const text = dictionary.profiles;
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const progress = useRef<HTMLDivElement>(null);
  const lastRenameButton = useRef<HTMLButtonElement | null>(null);
  const [editing, setEditing] = useState<ProfileMeta | null>(null);
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState<"gallery" | "rename" | null>(null);
  const validation = validateProfileName(name, profiles, editing?.id);
  const capped = profiles.length >= MAX_FARM_PROFILES;
  const count = text.farmCount.replace("{0}", formatNumber(profiles.length, 0, locale))
    .replace("{1}", formatNumber(MAX_FARM_PROFILES, 0, locale));
  const date = new Intl.DateTimeFormat(locale === "mr" ? "mr-IN" : "en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" });
  useCssVar(progress, "--p", profiles.length / MAX_FARM_PROFILES);

  async function run(action: () => Promise<void>, place: "gallery" | "rename" = "gallery") {
    if (pending) return;
    setPending(true);
    setFailed(null);
    try { await action(); }
    catch { setFailed(place); }
    finally { setPending(false); }
  }

  return <section className="mx-auto max-w-5xl space-y-5">
    <header className="bento-card border-t-4 border-t-forest sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="max-w-xl">
          <h1 className="text-3xl font-bold leading-heading text-forest sm:text-4xl">{text.title}</h1>
          <p className="mt-1 text-muted-foreground">{text.subtitle}</p>
        </div>
        <div className="min-w-32">
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm font-semibold">
            <span>{text.capacity}</span><strong className="tabular-nums text-forest">{count}</strong>
          </div>
          <div role="progressbar" aria-label={text.capacity} aria-valuemin={0} aria-valuemax={MAX_FARM_PROFILES}
            aria-valuenow={profiles.length} aria-valuetext={count} className="h-2 overflow-hidden rounded-full bg-surface-muted">
            <div ref={progress} className="fill-x h-full w-full rounded-full bg-forest" aria-hidden="true" />
          </div>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" className="button-primary press min-h-12" disabled={capped || pending} onClick={onNew}>
          <span aria-hidden="true">+</span> {text.newFarm}
        </button>
        <button type="button" className="button-secondary press min-h-12" disabled={capped || pending}
          onClick={() => { void run(async () => {
            await state.createFarmProfile(makeUniqueProfileName(text.sampleName, profiles), { fromSample: true });
            onOpen(true);
          }); }}>{text.sampleCopy}</button>
      </div>
      {capped && <p className="notice mt-4" role="status">{text.capReached}</p>}
      {failed === "gallery" && <p className="notice mt-4" role="alert">{text.actionFailed}</p>}
    </header>

    {profiles.length === 0 && <p className="notice">{text.emptyList}</p>}
    <ul className="stagger grid grid-cols-1 gap-4 sm:grid-cols-2">
      {profiles.map((meta) => {
        const farm = farmCardDetails(state, meta);
        const { areaGunthas, plotCount, segments } = summarizeProfile(meta, farm.slice);
        return <li key={meta.id} className={`bento-card flex min-w-0 flex-col gap-4 border-l-4 ${farm.active ? "border-l-forest" : "border-l-border-strong"}`}>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              {farm.active && <span className="rounded-full bg-forest px-2.5 py-1 text-xs font-bold text-white">{text.active}</span>}
              {farm.origin !== "blank" && <span className="rounded-full border border-border-strong bg-surface-muted px-2.5 py-1 text-xs font-semibold text-ink">{text.origin[farm.origin]}</span>}
            </div>
            <h2 className="mt-1 text-xl font-bold leading-heading [overflow-wrap:anywhere]">{farm.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{text.updated.replace("{0}", date.format(Date.parse(farm.updatedAt)))}</p>
          </div>
          <dl className="flex flex-wrap gap-x-5 gap-y-2 border-t border-border-strong/30 pt-3 text-sm">
            <div><dt className="text-muted-foreground">{text.area}</dt><dd className="font-bold">{farm.area}</dd></div>
            <div><dt className="text-muted-foreground">{text.plots}</dt><dd className="font-bold">{farm.plots}</dd></div>
            <div><dt className="text-muted-foreground">{text.setup}</dt><dd className="font-bold">{farm.setupComplete ? text.setupComplete : text.setupPending}</dd></div>
          </dl>
          <MiniFarmRibbon segments={segments} plotCount={plotCount} locale={locale} />
          {areaGunthas > 0 && <div><ProvenanceBadge provenance={farm.origin === "sample_copy" ? "sample" : "you_entered"} locale={locale} /></div>}
          <div className="mt-auto flex flex-wrap gap-2">
            <button type="button" className="button-primary press min-h-12" disabled={pending} aria-label={`${text.open} · ${farm.name}`}
              onClick={() => { void run(async () => {
                await state.switchFarmProfile(meta.id);
                onOpen(farm.setupComplete);
              }); }}>{text.open}</button>
            <button type="button" className="button-secondary press min-h-12" disabled={pending} aria-label={`${text.rename} · ${farm.name}`}
              aria-haspopup="dialog" onClick={(event) => {
                lastRenameButton.current = event.currentTarget;
                setEditing(meta);
                setName(meta.name);
                setFailed(null);
                dialog.current?.showModal();
              }}>{text.rename}</button>
            <button type="button" className="button-secondary press min-h-12" disabled={pending} aria-label={`${text.delete} · ${farm.name}`}
              onClick={() => { void run(async () => {
                const snapshot = await state.deleteFarmProfile(meta.id);
                if (snapshot) onDeleted(snapshot);
              }); }}>{text.delete}</button>
          </div>
        </li>;
      })}
    </ul>

    <FarmDialog dialogRef={dialog} titleId={`${id}-title`} onClose={() => {
      setEditing(null);
      lastRenameButton.current?.focus();
    }}>
      <form className="space-y-4 p-5 sm:p-6" onSubmit={(event) => {
        event.preventDefault();
        if (!editing || !validation.ok) return;
        void run(async () => {
          await state.renameFarmProfile(editing.id, validation.name);
          dialog.current?.close();
        }, "rename");
      }}>
        <h2 id={`${id}-title`} className="text-xl font-bold">{text.renameTitle}</h2>
        <div>
          <label htmlFor={id} className="block font-semibold">{text.nameLabel}</label>
          <input autoFocus id={id} value={name} onChange={(event) => setName(event.target.value)}
            maxLength={ProfileMetaSchema.shape.name.maxLength ?? undefined} aria-invalid={!validation.ok}
            aria-describedby={`${id}-hint`} className="mt-2 min-h-12 w-full rounded-xl border border-border-strong px-3 text-base" />
          <p id={`${id}-hint`} aria-live="polite" className="mt-1 text-sm text-muted-foreground">
            {validation.ok ? text.nameHint : text.validation[validation.reason]}
          </p>
        </div>
        {failed === "rename" && <p role="alert" className="notice">{text.actionFailed}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="submit" className="button-primary press min-h-12" disabled={!validation.ok || pending}>{text.saveName}</button>
          <button type="button" className="button-secondary press min-h-12" onClick={() => dialog.current?.close()}>{text.cancel}</button>
        </div>
      </form>
    </FarmDialog>
  </section>;
}
