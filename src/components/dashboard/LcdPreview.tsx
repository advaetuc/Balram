import { useState } from "react";
import { t } from "@/config/i18n";
import type { Locale } from "@/types/domain";

type Screen = readonly [string, string];

export function LcdPreview({ locale, screen1, screen2, invalid }: {
  locale: Locale;
  screen1: Screen;
  screen2: Screen;
  invalid: boolean;
}) {
  const [second, setSecond] = useState(false);
  const copy = t(locale).soilLab.lcd;
  const showSecond = second && !invalid;
  const screen = showSecond ? screen2 : screen1;
  return <div className="rounded-xl border-2 border-forest/40 bg-forest/5 p-3">
    <div className="mb-2 flex flex-wrap justify-between gap-1 text-sm font-semibold">
      <span>{copy.title}</span><span>{showSecond ? copy.second : copy.first}</span>
    </div>
    <div role={invalid ? "alert" : undefined} className={`grid min-h-20 content-center rounded-lg border-2 border-forest/40
      px-3 py-2 font-mono text-base font-semibold tabular-nums
      ${invalid ? "bg-warning-subtle text-on-warning-subtle" : "bg-[#d8e6b5] text-[#1a2e12]"}`}>
      <span className="break-words">{screen[0]}</span>
      <span className="min-h-6 break-words">{screen[1]}</span>
    </div>
    <button type="button" disabled={invalid} onClick={() => setSecond(!second)}
      className="button-secondary press mt-2 min-h-12 min-w-12">
      {showSecond ? copy.showFirst : copy.showSecond}
    </button>
  </div>;
}
