"use client";

import { useLayoutEffect, type RefObject } from "react";

export function useCssVar(ref: RefObject<HTMLElement | null>, name: string, value: number | string) {
  useLayoutEffect(() => {
    ref.current?.style.setProperty(name, String(value));
  }, [ref, name, value]);
}
