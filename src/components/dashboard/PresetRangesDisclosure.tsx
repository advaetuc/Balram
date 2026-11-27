import { SectionDisclosure } from "@/components/ui/SectionDisclosure";
import { t } from "@/config/i18n";
import { SOIL_PRESET_RANGES } from "@/lib/domain/soilChemistry";
import { formatNumber } from "@/lib/ui/format";
import type { Locale } from "@/types/domain";

export function PresetRangesDisclosure({ locale }: { locale: Locale }) {
  const text = t(locale);
  const { ranges, moisture, blue, units } = text.soilLab;
  const { ph, moisture: water, nitrogen, phosphorus, blueIntensity } = SOIL_PRESET_RANGES;
  const number = (value: number) => formatNumber(value, 1, locale);
  const interval = (min: number, max: number) => min === max ? number(min) : `${number(min)}–${number(max)}`;
  const cutoffs = (min: number, max: number, unit = "{0}") =>
    [`< ${number(min)}`, interval(min, max), `> ${number(max)}`].map(value => unit.replace("{0}", value));
  const nutrient = [text.low, text.medium, text.high];
  const rows = [
    { label: ranges.ph, cutoffs: cutoffs(ph.neutralMin, ph.neutralMax), levels: [ranges.acidic, ranges.neutral, ranges.alkaline] },
    { label: moisture.label, cutoffs: cutoffs(water.moistMin, water.moistMax, "{0}%"), levels: [moisture.levels.dry, moisture.levels.moist, moisture.levels.wet] },
    { label: ranges.nitrogen, cutoffs: cutoffs(nitrogen.mediumMin, nitrogen.mediumMax, units.kgPerHa), levels: nutrient },
    { label: ranges.phosphorus, cutoffs: cutoffs(phosphorus.mediumMin, phosphorus.mediumMax, units.kgPerHa), levels: nutrient },
    { label: blue.scale, cutoffs: Object.values(blueIntensity).map(([min, max]) => interval(min, max)), levels: nutrient },
  ];

  return <SectionDisclosure title={ranges.title} defaultOpen={false}>
    <table className="w-full text-left text-sm leading-body">
      <thead><tr>
        <th scope="col" className="py-2 pr-3">{ranges.parameter}</th>
        <th scope="col" className="py-2">{ranges.bands}</th>
      </tr></thead>
      <tbody>{rows.map(row => <tr key={row.label} className="border-t border-border-strong">
        <th scope="row" className="w-2/5 py-2 pr-3 align-top font-semibold">{row.label}</th>
        <td className="py-2"><ul className="space-y-0.5">
          {row.cutoffs.map((range, index) => <li key={range}>
            <span className="font-semibold tabular-nums">{range}</span> · {row.levels[index]}
          </li>)}
        </ul></td>
      </tr>)}</tbody>
    </table>
  </SectionDisclosure>;
}
