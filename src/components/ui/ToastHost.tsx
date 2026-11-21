"use client";

import { useEffect, useRef, useState } from "react";
import { t } from "@/config/i18n";
import type { Locale } from "@/types/domain";

type ToastAction = { actionLabel: string; onAction: () => void };

export const TOAST_INFO_MS = 4000;
export const TOAST_UNDO_MS = 7000;

export type Toast = { id: string | number; message: string } & (
  | ({ variant: "info" } & (ToastAction | { actionLabel?: never; onAction?: never }))
  | { variant: "undo"; onAction: () => void }
);

function ToastTimer({ toast, paused, onDismiss }: {
  toast: Toast;
  paused: boolean;
  onDismiss: (id: Toast["id"]) => void;
}) {
  const remaining = useRef(toast.variant === "undo" ? TOAST_UNDO_MS : TOAST_INFO_MS);
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
  const [leaving, setLeaving] = useState<Toast | null>(null);
  const previousToast = useRef<Toast | null>(toast);
  const toastId = toast?.id;
  useEffect(() => {
    const previous = previousToast.current;
    previousToast.current = toast;
    const replaced = previous !== null && previous.id !== toast?.id;
    if (replaced) setLeaving(previous);

    // Removing a focused action may not dispatch blur.
    setFocused(container.current?.matches(":focus-within") ?? false);
    if (toastId === undefined) setHovered(false);
    const outgoing = replaced ? previous : leaving;
    if (!outgoing) return;

    const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 200;
    const timeout = window.setTimeout(() => {
      setLeaving((current) => current?.id === outgoing.id ? null : current);
    }, delay);
    return () => window.clearTimeout(timeout);
  }, [toastId, leaving?.id]);
  const actionLabel = toast?.variant === "undo" ? t(locale).undo : toast?.actionLabel;
  const pauseActiveToast = toast?.variant === "undo" && (hovered || focused);

  return (
    <div lang={locale} className="pointer-events-none fixed inset-x-4 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-toast mx-auto max-w-md print:hidden md:bottom-4">
      <div ref={container} className="grid"
        onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
        onFocus={() => setFocused(true)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
        }}>
        {leaving && leaving.id !== toast?.id && (
          <div key={`leaving-${leaving.id}`} aria-hidden="true" data-state="leaving"
            className="toast pointer-events-none col-start-1 row-start-1 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-forest/15 bg-white p-3 shadow-toast">
            <p className="min-w-0 flex-1 basis-48 break-words text-sm leading-body">{leaving.message}</p>
          </div>
        )}
        {toast && (
          <div key={`toast-${toast.id}`} data-paused={pauseActiveToast ? "true" : "false"}
            className="toast pointer-events-auto col-start-1 row-start-1 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-forest/15 bg-white p-3 shadow-toast">
            <p role="status" aria-live="polite" aria-atomic="true" className="min-w-0 flex-1 basis-48 break-words text-sm leading-body">
              {toast.message}
            </p>
            {toast.onAction && actionLabel && (
              <button type="button" className="button-secondary min-h-12 text-sm leading-body"
                onClick={() => {
                  onDismiss(toast.id);
                  toast.onAction();
                }}>{actionLabel}</button>
            )}
            {toast.variant === "undo" && <div aria-hidden="true" key={`bar-${toast.id}`}
              className="toast-bar h-1 w-full rounded-full bg-forest" />}
            <ToastTimer key={toast.id} toast={toast} onDismiss={onDismiss}
              paused={pauseActiveToast} />
          </div>
        )}
      </div>
    </div>
  );
}
