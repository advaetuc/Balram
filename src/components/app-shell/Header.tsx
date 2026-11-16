"use client";

import Link from "next/link";
import { useBalramStore } from "@/store/useBalramStore";
import { t } from "@/config/i18n";

export function Header() {
  const state = useBalramStore((value) => value);
  const stale = state.weatherStale;
  const text = t(state.locale);
  const badge = "inline-flex min-h-8 items-center gap-2 rounded-full border px-3 py-1 text-sm font-semibold";

  return (
    <header lang={state.locale} className="border-b border-forest/20 bg-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link href="/" aria-label="Balram home" className="flex min-h-12 items-center gap-3 rounded-lg pr-3">
          <span className="flex size-12 items-center justify-center rounded-xl bg-forest text-white" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-7">
              <path d="M12 21v-9M12 15C5 15 3 10 3 5c6 0 9 3 9 10ZM12 12c0-6 3-9 9-9 0 6-3 9-9 9Z" />
            </svg>
          </span>
          <span><span className="block text-2xl font-bold tracking-tight text-forest">Balram</span>
            <span className="block text-xs font-medium text-ink">{text.tagline}</span></span>
        </Link>
        <nav aria-label="Primary" className="flex flex-wrap items-center gap-2 text-sm font-semibold">
          <button type="button" className="inline-flex min-h-12 items-center rounded-lg px-4 hover:bg-forest/5" onClick={() => window.dispatchEvent(new Event("balram:show-landing"))}>{text.home}</button>
          <button type="button" className="min-h-12 min-w-12 rounded-lg border border-forest px-3" disabled={!state.hydrated}
            aria-label={state.locale === "en" ? "Switch to Marathi" : "Switch to English"}
            onClick={() => state.setLocale(state.locale === "en" ? "mr" : "en")}>{state.locale === "en" ? "मराठी" : "English"}</button>
        </nav>
      </div>
      {state.sampleDataActive && <div role="status" className="border-t border-amber bg-amber text-ink">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-2 sm:px-6">
          <strong>{text.sampleBanner}</strong><button type="button" className="min-h-12 min-w-12 rounded-lg border border-ink/40 px-4 font-bold" disabled={!state.hydrated} onClick={() => { void state.setSampleData(false); }}>{text.exitSampleButton}</button>
        </div>
      </div>}
      <div className="border-t border-forest/10 bg-daylight">
        <div role="status" aria-live="polite" aria-atomic="true"
          className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-3 sm:px-6">
          {!state.hydrated ? <span className="text-sm">{text.loading}</span> : <>
            {state.sampleDataActive && <span className={`${badge} border-amber bg-amber text-ink`}>{text.provenance.sample}</span>}
            {state.connection === "offline" && <span className={`${badge} border-amber bg-amber/20`}>{text.offline}</span>}
            {state.connection === "online" && <span className={`${badge} border-forest/30 text-forest`}>
              <span className="size-2 rounded-full bg-forest" aria-hidden="true" />{text.online}</span>}
            {stale && <span className={`${badge} border-amber bg-amber/20`}>{text.stale}</span>}
            {state.weatherCached && <span className={`${badge} border-sky bg-sky/10`}>{state.locale === "mr" ? "जतन केलेले हवामान" : "Saved weather"}</span>}
            {state.weatherStatus.provenance === "modelled" && <span className={`${badge} border-sky bg-sky/10`}>{state.locale === "mr" ? "मॉडेलचा अंदाज" : "Modelled estimate"}</span>}
            {state.weatherStatus.state === "loading" && <span className="text-sm">{text.weatherLoading}</span>}
            {state.weatherStatus.state === "error" && <span className="text-sm">{state.locale === "mr" ? "हवामान उपलब्ध नाही" : "Weather unavailable"}</span>}
            {state.storageStatus.mode === "memory" ? (
              <span className={`${badge} border-amber bg-amber/20`}>Not saved · this tab only</span>
            ) : <span className="text-sm">{state.storageStatus.pendingWrites > 0 ? text.saving : text.saved}</span>}
          </>}
        </div>
        {state.hydrated && state.storageStatus.message && <p className="mx-auto max-w-7xl px-4 pb-3 text-sm sm:px-6">
          {state.storageStatus.message}
        </p>}
      </div>
    </header>
  );
}
