"use client";

import Link from "next/link";
import { useBalramStore } from "@/store/useBalramStore";
import { t } from "@/config/i18n";
import { LandUnitToggle } from "@/components/ui/LandUnitToggle";

export function Header() {
  const state = useBalramStore((value) => value);
  const text = t(state.locale);
  const offline = state.connection === "offline";
  const memoryOnly = state.storageStatus.mode === "memory";

  return (
    <header lang={state.locale} className="border-b border-forest/20 bg-white">
      <div className="mx-auto flex min-h-[56px] max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-1 sm:px-6">
        <Link href="/" aria-label={state.locale === "mr" ? "बलराम मुख्यपृष्ठ" : "Balram home"} className="flex min-h-12 items-center gap-3 rounded-lg pr-3">
          <span className="flex size-12 items-center justify-center rounded-xl bg-forest text-white" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-7">
              <path d="M12 21v-9M12 15C5 15 3 10 3 5c6 0 9 3 9 10ZM12 12c0-6 3-9 9-9 0 6-3 9-9 9Z" />
            </svg>
          </span>
          <span><span className="block text-2xl font-bold tracking-tight text-forest">Balram</span>
            <span className="hidden text-sm font-medium text-ink sm:block">{text.tagline}</span></span>
        </Link>
        <nav aria-label={state.locale === "mr" ? "मुख्य नेव्हिगेशन" : "Primary"} className="flex flex-wrap items-center gap-2 text-sm font-semibold">
          <button type="button" className="inline-flex min-h-12 items-center rounded-lg px-4 hover:bg-forest/5" onClick={() => window.dispatchEvent(new Event("balram:show-landing"))}>{text.home}</button>
          <LandUnitToggle />
          <button type="button" className="min-h-12 min-w-12 rounded-lg border border-forest px-3" disabled={!state.hydrated}
            aria-label={state.locale === "en" ? "Switch to Marathi" : "इंग्रजीत बदला"}
            onClick={() => state.setLocale(state.locale === "en" ? "mr" : "en")}>{state.locale === "en" ? "मराठी" : "इंग्रजी"}</button>
        </nav>
      </div>
      {state.sampleDataActive && <div role="status" className="border-t border-amber bg-amber text-ink">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-2 sm:px-6">
          <strong>{text.sampleBanner}</strong><button type="button" className="min-h-12 min-w-12 rounded-lg border border-ink/40 px-4 font-bold" disabled={!state.hydrated} onClick={() => { void state.setSampleData(false); }}>{text.exitSampleButton}</button>
        </div>
      </div>}
      {(offline || memoryOnly) && (
        <div role="status" className="border-t border-forest/10 bg-surface-muted text-ink">
          <div className="mx-auto flex max-w-7xl items-start gap-2 px-4 py-2 text-sm sm:px-6">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-5 shrink-0">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v6m0 3h.01" />
            </svg>
            <p>{offline && text.offline}{offline && memoryOnly && " · "}{memoryOnly && text.memoryOnly}</p>
          </div>
        </div>
      )}
    </header>
  );
}
