import { useId } from "react";
import { t } from "@/config/i18n";
import { blueIntensityToLevel, type SoilBlueIntensity } from "@/lib/domain/soilChemistry";
import { formatNumber } from "@/lib/ui/format";
import type { Locale } from "@/types/domain";

const swatches = {
  1: "bg-[#ebf7ff] text-[#102a43]",
  2: "bg-[#bbdfff] text-[#102a43]",
  3: "bg-[#80bdf0] text-[#102a43]",
  4: "bg-[#3065b4] text-white",
  5: "bg-[#1b3886] text-white",
} as const;

export function BlueIntensityPicker({ locale, value, onChange, disabled }: {
  locale: Locale;
  value: SoilBlueIntensity;
  onChange: (value: SoilBlueIntensity) => void;
  disabled: boolean;
}) {
  const id = useId();
  const text = t(locale);
  const copy = text.soilLab.blue;

  return <fieldset className="min-w-0">
    <legend className="mb-2 text-sm font-semibold">{copy.label}</legend>
    <div className="flex flex-wrap items-center gap-3">
      <div role="radiogroup" aria-label={copy.scale} aria-describedby={`${id}-hint`} className="flex flex-wrap gap-2">
        {([1, 2, 3, 4, 5] as const).map(intensity => {
          const inputId = `${id}-${intensity}`;
          const selected = intensity === value;
          const number = formatNumber(intensity, 0, locale);
          return <div key={intensity}>
            <input className="peer sr-only min-h-0 min-w-0" type="radio" name={id} id={inputId}
              value={intensity} checked={selected} disabled={disabled} onChange={() => onChange(intensity)} />
            <label htmlFor={inputId} className={`choice-target relative grid min-h-12 min-w-12 place-items-center rounded-lg
              border border-[#3065b4] text-lg font-bold peer-disabled:cursor-not-allowed ${swatches[intensity]}
              ${selected ? "ring-2 ring-forest ring-offset-2" : ""}`}>
              <span aria-hidden="true">{number}</span>
              <span className="sr-only">{number} · {copy.swatches[intensity]}</span>
              {selected && <span aria-hidden="true" className="absolute bottom-0.5 right-1 text-xs">✓</span>}
            </label>
          </div>;
        })}
      </div>
      <span aria-live="polite" className="rounded-full bg-info-subtle px-3 py-1 text-sm font-semibold text-on-info-subtle">
        {text[blueIntensityToLevel(value)]}
      </span>
    </div>
    <p id={`${id}-hint`} className="mt-2 text-sm leading-body text-muted-foreground">{copy.hint}</p>
  </fieldset>;
}
