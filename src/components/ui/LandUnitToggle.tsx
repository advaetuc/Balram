"use client";

import { t } from "@/config/i18n";
import { useBalramStore } from "@/store/useBalramStore";
import { RadioChoices } from "./RadioChoices";

export function LandUnitToggle() {
  const { landUnit, locale, hydrated, setLandUnit } = useBalramStore(state => state);
  const text = t(locale);
  return <RadioChoices label={locale === "mr" ? "जमिनीचे एकक" : "Land unit"}
    className="seg seg-2 rounded-xl"
    segmented dataActive={landUnit === "gunthas" ? 1 : 0}
    options={[{ value: "acres", label: text.acres }, { value: "gunthas", label: text.gunthas }]}
    value={landUnit} onChange={setLandUnit} disabled={!hydrated} />;
}
