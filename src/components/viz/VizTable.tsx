import type { ReactNode } from "react";
import { t } from "@/config/i18n";
import type { Locale } from "@/types/domain";

interface VizTableProps {
  locale: Locale;
  caption: string;
  columns: readonly string[];
  alwaysReadable?: boolean;
  /** The first cell in each row names the item and serves as the row header. */
  rows: readonly (readonly ReactNode[])[];
}

export function VizTable({ locale, caption, columns, rows, alwaysReadable = false }: VizTableProps) {
  const table = <table className="w-full border-collapse text-start text-sm">
    <caption className="caption-top py-2 text-start font-semibold">{caption}</caption>
    <thead>
      <tr>{columns.map((column, index) => <th key={index} scope="col" className="border-b border-border-strong px-2 py-2 text-start">{column}</th>)}</tr>
    </thead>
    <tbody>
      {rows.map(([label, ...values], index) => <tr key={index}>
        <th scope="row" className="border-b border-border-strong px-2 py-2 text-start font-medium">{label}</th>
        {values.map((value, cellIndex) => <td key={cellIndex} className="border-b border-border-strong px-2 py-2">{value}</td>)}
      </tr>)}
    </tbody>
  </table>;

  return <>
    <details className={alwaysReadable ? "peer print:hidden" : "print:hidden"}>
      <summary className="min-h-12 cursor-pointer rounded py-3 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest">
        {t(locale).viz.showAsList}
      </summary>
      <div className="overflow-x-auto">{table}</div>
    </details>
    {/* Closed details can suppress their content in print, regardless of child display. */}
    <div className={alwaysReadable ? "sr-only peer-open:hidden print:!block print:not-sr-only" : "hidden print:block"}>{table}</div>
  </>;
}
