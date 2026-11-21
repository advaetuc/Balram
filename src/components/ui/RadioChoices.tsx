import { useId } from "react";

export function RadioChoices<T extends string | number>({ label, options, value, onChange, disabled = false, className = "flex flex-wrap gap-2", segmented = false, dataActive }: {
  label: string;
  options: readonly { value: T; label: string; className?: string }[];
  value: T | null;
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
  segmented?: boolean;
  dataActive?: number;
}) {
  const name = useId();

  return <div role="radiogroup" aria-label={label} data-active={dataActive} className={className}>
    {options.map((option, index) => {
      const id = `${name}-${index}`;
      return <div key={option.value} className={`min-w-0 ${option.className ?? ""}`}>
        <input id={id} name={name} role="radio" type="radio" value={option.value}
          aria-checked={segmented ? value === option.value : undefined}
          checked={value === option.value} disabled={disabled}
          className="peer sr-only min-h-0 min-w-0" onChange={() => onChange(option.value)} />
        <label htmlFor={id}
          className={`choice-target flex min-h-12 min-w-12 cursor-pointer items-center justify-center break-words rounded-lg border px-3 py-2 text-center text-sm font-semibold leading-body peer-disabled:cursor-not-allowed peer-disabled:opacity-60 ${segmented ? "border-transparent bg-transparent" : "border-border-strong bg-white text-forest peer-checked:bg-forest peer-checked:text-white"}`}>
          <span className="min-w-0">{option.label}</span>
        </label>
      </div>;
    })}
  </div>;
}
