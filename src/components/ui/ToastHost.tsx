"use client";

import { useEffect, useRef, useState } from "react";
import { t } from "@/config/i18n";
import type { Locale } from "@/types/domain";

type ToastAction = { actionLabel: string; onAction: () => void };

export type Toast = { id: string | number; message: string } & (
  | ({ variant: "info" } & (ToastAction | { actionLabel?: never; onAction?: never }))
  | { variant: "undo"; onAction: () => void }
);

function ToastTimer({ toast, paused, onDismiss }: {
  toast: Toast;
  paused: boolean;
  onDismiss: (id: Toast["id"]) => void;
}) {
  const remaining = useRef(toast.variant === "undo" ? 7000 : 4000);
  useEffect(() => {
    if (paused) return;

    const started = performance.now();
    const timeout = window.setTimeout(() => onDismiss(toast.id), remaining.current);
    return () => {
      window.clearTimeout(timeout);
      remaining.current = Math.max(0, remaining.current - (performance.now() - started));
    };
  }, [toast.id, paused, onDismiss]);

  return null;
}

/** Keep mounted with toast=null when idle. Give every new toast a unique ID. */
export function ToastHost({ toast, locale, onDismiss }: {
  toast: Toast | null;
  locale: Locale;
  onDismiss: (id: Toast["id"]) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const toastId = toast?.id;
  useEffect(() => {
    // Removing a focused action may not dispatch blur.
    setFocused(container.current?.matches(":focus-within") ?? false);
    if (toastId === undefined) setHovered(false);
  }, [toastId]);
  const actionLabel = toast?.variant === "undo" ? t(locale).undo : toast?.actionLabel;

  return (
    <div lang={locale} className="pointer-events-none fixed inset-x-4 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-toast mx-auto max-w-md print:hidden md:bottom-4">
      <div ref={container} className={toast ? "toast-enter pointer-events-auto flex flex-wrap items-center justify-between gap-2 rounded-xl border border-forest/15 bg-white p-3 shadow-toast" : ""}
        onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
        onFocus={() => setFocused(true)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
        }}>
        <p role="status" aria-live="polite" aria-atomic="true" className="min-w-0 flex-1 basis-48 break-words text-sm leading-body">
          {toast && <span key={toast.id}>{toast.message}</span>}
        </p>
        {toast?.onAction && actionLabel && (
          <button type="button" className="button-secondary min-h-12 text-sm leading-body"
            onClick={() => {
              onDismiss(toast.id);
              toast.onAction();
            }}>{actionLabel}</button>
        )}
        {toast && <ToastTimer key={toast.id} toast={toast} onDismiss={onDismiss}
          paused={toast.variant === "undo" && (hovered || focused)} />}
      </div>
    </div>
  );
}
