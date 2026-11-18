"use client";

import { useEffect, useId, useState } from "react";
import { formatIndianNumber, gunthasToUnitValue, parseAreaInput } from "@/lib/domain/landUnits";
import type { LandUnit, Locale } from "@/types/domain";

interface AreaInputProps {
  id?: string;
  label: string;
  gunthas: number | null;
  unit: LandUnit;
  locale: Locale;
  disabled?: boolean;
  optional?: boolean;
  onChangeGunthas: (gunthas: number | null) => void;
  onValidityChange?: (error: string | null) => void;
}

export function AreaInput({ id, label, gunthas, unit, locale, disabled = false, optional = false, onChangeGunthas, onValidityChange }: AreaInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;
  const unitLabel = unit === "acres" ? (locale === "mr" ? "एकर" : "Acres") : (locale === "mr" ? "गुंठे" : "Gunthas");
  const decimals = unit === "acres" ? 2 : 1;
  const formattedValue = (value: number) => formatIndianNumber(gunthasToUnitValue(value, unit), decimals);
  const editValue = (value: number) => gunthasToUnitValue(value, unit).toFixed(decimals).replace(/\.?0+$/, "");
  const [raw, setRaw] = useState(() => gunthas === null ? "" : formattedValue(gunthas));
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setRaw(gunthas === null ? "" : formattedValue(gunthas));
  }, [gunthas, unit, editing]);
  function validate(value: string, notify: boolean) {
    if (optional && value.trim() === "") {
      setError(null);
      if (notify) onChangeGunthas(null);
      onValidityChange?.(null);
      return;
    }
    const result = parseAreaInput(value, unit, locale);
    const nextError = result.ok ? null : result.error[locale];
    setError(nextError);
    onValidityChange?.(nextError);
    if (result.ok && notify) onChangeGunthas(result.gunthas);
  }
  return <label htmlFor={inputId} className="block text-sm font-medium">{label} <span className="text-stone-600">({unitLabel})</span>
    <input id={inputId} type="text" inputMode="decimal" className="form-input mt-1 min-h-12" value={raw} disabled={disabled}
      aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined}
      onFocus={() => { setEditing(true); setRaw(gunthas === null ? "" : editValue(gunthas)); }} onChange={(event) => { setRaw(event.target.value); validate(event.target.value, true); }}
      onBlur={() => { setEditing(false); validate(raw, true); const parsed = parseAreaInput(raw, unit, locale); if (parsed.ok) setRaw(formattedValue(parsed.gunthas)); }} />
    {error && <span id={errorId} role="alert" className="mt-1 block text-sm text-red-800">{error}</span>}
  </label>;
}
