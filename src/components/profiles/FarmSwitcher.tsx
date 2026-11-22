"use client";

import { useId, useRef, useState } from "react";
import { t } from "@/config/i18n";
import { useBalramStore } from "@/store/useBalramStore";
import { MAX_FARM_PROFILES } from "@/types/domain";
import { FarmDialog } from "./FarmDialog";
import { farmCardDetails } from "./farmCardDetails";
import { SproutMark } from "./SproutMark";

export function FarmSwitcher() {
  const state = useBalramStore((value) => value);
  const copy = t(state.locale);
  const text = copy.profiles;
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!state.hydrated || (!state.profiles.length && !state.sampleDataActive)) return null;

  const active = state.profiles.find((profile) => profile.id === state.activeProfileId);
  const label = state.sampleDataActive ? copy.sampleFarm : active?.name ?? text.switchTitle;

  function navigate(event: "balram:new-farm" | "balram:show-farms") {
    dialog.current?.close();
    window.dispatchEvent(new Event(event));
  }

  return <>
    <button type="button" aria-haspopup="dialog" aria-controls={id}
      aria-label={text.switchLabel.replace("{0}", () => label)}
      className="press inline-flex min-h-12 min-w-12 max-w-full items-center gap-2 rounded-xl border border-border-strong bg-surface-muted px-3 font-bold text-forest"
      onClick={() => { setFailed(false); dialog.current?.showModal(); }}>
      <SproutMark className="size-5 shrink-0" />
      <span className="min-w-0 max-w-[140px] truncate sm:max-w-[200px]">{label}</span>
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4 shrink-0">
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>
    <FarmDialog dialogRef={dialog} id={id} titleId={`${id}-title`}
      className="sheet farm-switcher-sheet max-sm:inset-x-0 max-sm:bottom-0 max-sm:top-auto max-sm:m-0 max-sm:w-full max-sm:max-w-none max-sm:rounded-b-none">
      <div className="space-y-4 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 id={`${id}-title`} className="text-xl font-bold text-forest">{text.switchTitle}</h2>
          <button type="button" autoFocus className="button-secondary min-h-12" onClick={() => dialog.current?.close()}>{copy.close}</button>
        </div>
        {state.profiles.length === 0 && <p className="text-sm text-muted-foreground">{text.emptyList}</p>}
        {failed && <p className="notice" role="alert">{text.actionFailed}</p>}
        <ul className="space-y-2">
          {state.profiles.map((meta) => {
            const farm = farmCardDetails(state, meta);
            return <li key={farm.id}><button type="button" aria-current={farm.active ? "true" : undefined} disabled={pending}
              className={`press flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border border-border-strong px-3 py-2 text-left ${farm.active ? "bg-surface-muted" : "bg-white hover:bg-surface-muted"}`}
              onClick={async () => {
                setPending(true);
                setFailed(false);
                try {
                  await state.switchFarmProfile(farm.id);
                  dialog.current?.close();
                  window.dispatchEvent(new CustomEvent("balram:open-farm", { detail: farm.setupComplete }));
                } catch { setFailed(true); }
                finally { setPending(false); }
              }}>
              <span className="min-w-0">
                <strong className="block text-base text-forest [overflow-wrap:anywhere]">{farm.name}</strong>
                <span className="block text-sm text-muted-foreground">{farm.area} · {text.plots}: {farm.plots}</span>
              </span>
              {farm.active && <span className="rounded-full bg-forest px-2 py-1 text-xs font-semibold text-white">{text.active}</span>}
            </button></li>;
          })}
        </ul>
        <div className="flex flex-wrap gap-2 border-t border-border-strong/30 pt-4">
          {state.profiles.length < MAX_FARM_PROFILES && <button type="button" className="button-primary press min-h-12" disabled={pending}
            onClick={() => navigate("balram:new-farm")}><span aria-hidden="true">+</span> {text.newFarm}</button>}
          <button type="button" className="button-secondary press min-h-12" disabled={pending}
            onClick={() => navigate("balram:show-farms")}>{text.manage}</button>
        </div>
      </div>
    </FarmDialog>
  </>;
}
