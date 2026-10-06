"use client";

import Link from "next/link";
import { useBalramStore } from "@/store/useBalramStore";

export function Header() {
  const state = useBalramStore((value) => value);
  const canShowSample = state.sampleDataActive || (!state.farmProfile && !state.fieldGeometry &&
    state.cropAllocations.length === 0 && !state.irrigationSetup);
  const stale = state.weatherStale;
  const badge = "inline-flex min-h-8 items-center gap-2 rounded-full border px-3 py-1 text-sm font-semibold";

  return (
    <header className="border-b border-forest/20 bg-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link href="/" aria-label="Balram home" className="flex min-h-12 items-center gap-3 rounded-lg pr-3">
          <span className="flex size-12 items-center justify-center rounded-xl bg-forest text-white" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-7">
              <path d="M12 21v-9M12 15C5 15 3 10 3 5c6 0 9 3 9 10ZM12 12c0-6 3-9 9-9 0 6-3 9-9 9Z" />
            </svg>
          </span>
          <span><span className="block text-2xl font-bold tracking-tight text-forest">Balram</span>
            <span className="block text-xs font-medium text-ink">Your field. Your plan.</span></span>
        </Link>
        <nav aria-label="Primary" className="flex flex-wrap items-center gap-2 text-sm font-semibold">
          <a href="#farm-overview" className="inline-flex items-center rounded-lg px-4 hover:bg-forest/5">Farm overview</a>
          {canShowSample && (
            <button type="button" disabled={!state.hydrated} aria-pressed={state.sampleDataActive}
              onClick={() => state.setSampleData(!state.sampleDataActive)}
              className="rounded-lg bg-forest px-4 py-3 text-white hover:bg-forest/90">
              {state.sampleDataActive ? "Exit sample" : "Explore sample"}
            </button>
          )}
        </nav>
      </div>
      <div className="border-t border-forest/10 bg-daylight">
        <div role="status" aria-live="polite" aria-atomic="true"
          className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-3 sm:px-6">
          {!state.hydrated ? <span className="text-sm">Loading saved farm…</span> : <>
            {state.sampleDataActive && <span className={`${badge} border-amber bg-amber text-ink`}>Sample data</span>}
            {state.connection === "offline" && <span className={`${badge} border-amber bg-amber/20`}>Offline · saved data only</span>}
            {state.connection === "online" && <span className={`${badge} border-forest/30 text-forest`}>
              <span className="size-2 rounded-full bg-forest" aria-hidden="true" />Online</span>}
            {stale && <span className={`${badge} border-amber bg-amber/20`}>Stale data · check dates</span>}
            {state.weatherCached && <span className={`${badge} border-sky bg-sky/10`}>Saved weather</span>}
            {state.weatherStatus.provenance === "modelled" && <span className={`${badge} border-sky bg-sky/10`}>Modelled estimate</span>}
            {state.weatherStatus.state === "loading" && <span className="text-sm">Updating weather…</span>}
            {state.weatherStatus.state === "error" && <span className="text-sm">Weather unavailable</span>}
            {state.storageStatus.mode === "memory" ? (
              <span className={`${badge} border-amber bg-amber/20`}>Not saved · this tab only</span>
            ) : <span className="text-sm">{state.storageStatus.pendingWrites > 0 ? "Saving in this browser…" : "Saved in this browser"}</span>}
          </>}
        </div>
        {state.hydrated && state.storageStatus.message && <p className="mx-auto max-w-7xl px-4 pb-3 text-sm sm:px-6">
          {state.storageStatus.message}
        </p>}
      </div>
    </header>
  );
}
