"use client";

import { useRef } from "react";
import { useBalramStore } from "@/store/useBalramStore";
import { t } from "@/config/i18n";
import { AboutDialog } from "./AboutDialog";

export function Footer() {
  const locale = useBalramStore((state) => state.locale);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <footer lang={locale} className="border-t border-forest/15 px-4 py-3 print:hidden sm:px-6 max-md:[body:has([data-mobile-nav])_&]:pb-[calc(7rem+env(safe-area-inset-bottom))]">
      <div className="mx-auto flex max-w-7xl">
        <button ref={triggerRef} type="button" aria-haspopup="dialog" className="button-quiet text-sm"
          onClick={() => dialogRef.current?.showModal()}>{t(locale).aboutData}</button>
      </div>
      <AboutDialog dialogRef={dialogRef} onClose={() => triggerRef.current?.focus()} />
    </footer>
  );
}
