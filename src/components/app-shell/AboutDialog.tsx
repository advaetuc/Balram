"use client";

import { type RefObject } from "react";
import { useBalramStore } from "@/store/useBalramStore";
import { t } from "@/config/i18n";
import { alertStatusMessages } from "@/lib/ui/alertStatus";
import { OfflineSupport } from "./OfflineSupport";
import { PrivacyNotice } from "./PrivacyNotice";

export function AboutDialog({ dialogRef, onClose }: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  onClose: () => void;
}) {
  const state = useBalramStore((value) => value);
  const text = t(state.locale);
  const messages = alertStatusMessages(state);

  return (
    <dialog ref={dialogRef} aria-labelledby="about-data-title" onClose={onClose}
      className="sheet-dialog max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-[560px] overflow-y-auto rounded-2xl bg-white p-4 text-ink shadow-sheet print:hidden sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 id="about-data-title" className="text-xl font-bold leading-heading">{text.aboutData}</h2>
        <button type="button" autoFocus aria-label={text.close} className="button-secondary"
          onClick={() => dialogRef.current?.close()}>{text.close}</button>
      </div>
      <OfflineSupport />
      <PrivacyNotice />
      <section aria-labelledby="about-data-status" className="mt-4 space-y-2">
        <h3 id="about-data-status" className="font-semibold">{text.systemStatus}</h3>
        {messages.length > 0
          ? <ul className="space-y-2">{messages.map((message, index) => <li key={index} className="notice">{message}</li>)}</ul>
          : <p className="text-sm">{text.statusClear}</p>}
      </section>
    </dialog>
  );
}
