"use client";

import { t } from "@/config/i18n";
import { useBalramStore } from "@/store/useBalramStore";
import { RadioChoices } from "./RadioChoices";

export function LandUnitToggle() {
  const { landUnit, locale, hydrated, setLandUnit } = useBalramStore(state => state);
  const text = t(locale);
  return <RadioChoices label={locale === "mr" ? "जमिनीचे एकक" : "Land unit"}
    className="inline-flex flex-wrap gap-2 rounded-xl p-1"
    options={[{ value: "acres", label: text.acres }, { value: "gunthas", label: text.gunthas }]}
    value={landUnit} onChange={setLandUnit} disabled={!hydrated} />;
}
