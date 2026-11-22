"use client";

import { useRef, type ReactNode, type RefObject } from "react";

export function FarmDialog({ dialogRef, id, titleId, className = "", onClose, children }: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  id?: string;
  titleId: string;
  className?: string;
  onClose?: () => void;
  children: ReactNode;
}) {
  const backdropPress = useRef(false);
  return <dialog ref={dialogRef} id={id} aria-labelledby={titleId} onClose={onClose}
    className={`sheet-dialog max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-2xl bg-white p-0 text-ink shadow-sheet print:hidden ${className}`}
    onPointerDown={(event) => { backdropPress.current = event.target === event.currentTarget; }}
    onClick={(event) => {
      if (backdropPress.current && event.target === event.currentTarget) event.currentTarget.close();
      backdropPress.current = false;
    }}>
    {children}
  </dialog>;
}
