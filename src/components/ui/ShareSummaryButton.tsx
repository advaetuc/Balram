"use client";
import { useState } from "react";
import type { BalramState } from "@/store/useBalramStore";
import type { RoadmapItem } from "@/lib/domain/roadmap";
import { buildShareSummary } from "@/lib/ui/shareSummary";
import { t } from "@/config/i18n";

export function ShareSummaryButton({ state, roadmap }: { state: BalramState; roadmap: readonly RoadmapItem[] }) {
  const [message, setMessage] = useState("");
  const copy = t(state.locale);
  async function share() {
    const summary = buildShareSummary(state, roadmap, state.locale);
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        try { await navigator.share({ title: copy.shareTitle, text: summary }); setMessage(""); return; }
        catch (error) { if (error instanceof DOMException && error.name === "AbortError") return; }
      }
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(summary);
      setMessage(copy.shareCopied);
    } catch { setMessage(copy.shareFailure); }
  }
  return <span className="inline-flex flex-col items-start gap-1"><button type="button" className="button-secondary print:hidden min-h-12" onClick={share}>{copy.shareSummary}</button>{message&&<span role="status" className="text-sm">{message}</span>}</span>;
}
