"use client";

import { useBalramStore } from "@/store/useBalramStore";

export function SkipLink() {
  const locale = useBalramStore((state) => state.locale);
  return <a href="#main-content" className="print:hidden sr-only z-50 items-center bg-forest px-5 py-3 text-white focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:flex">
    {locale === "mr" ? "मुख्य मजकुराकडे जा" : "Skip to content"}
  </a>;
}
