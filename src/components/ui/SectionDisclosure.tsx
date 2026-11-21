import type { ReactNode } from "react";

export function SectionDisclosure({ title, children, defaultOpen = false, className = "" }: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  return (
    <details open={defaultOpen || undefined}
      className={`min-w-0 rounded-xl border border-border-strong bg-white text-base leading-body ${className}`}>
      <summary className="min-h-12 rounded-xl px-4 text-base leading-body focus-visible:outline-border-strong">
        {title}
      </summary>
      <div className="px-4 pb-4">{children}</div>
    </details>
  );
}
