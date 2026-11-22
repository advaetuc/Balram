import type { CheckInEvent, LifecycleStage } from "@/types/domain";

const leaf = "#B8D8AA";
const grain = "#F4CC73";

const illustrations = {
  planned: <>
    <path d="M5 34c8-4 13-4 19 0s13 4 19 0M10 39c6-2 11-2 16 0M33 40l5-1" stroke="#9A3412" />
    <path d="M30 11c2 10-2 18-9 18-5 0-8-5-5-9 3-5 9-7 14-9Z" fill={grain} stroke="#A16207" />
    <path d="M19 27c2-4 5-7 9-10" stroke="#A16207" />
  </>,
  vegetative: <>
    <path d="M11 39h26M24 39V14" />
    <path d="M24 26c-9 1-14-4-15-12 8 0 14 4 15 12Z" fill={leaf} />
    <path d="M24 20c0-8 6-13 14-13-1 8-6 13-14 13Z" fill={leaf} />
    <path d="m15 19 9 7m0-6 8-8" />
  </>,
  flowering_fruiting: <>
    <path d="M22 42V22m0 15c-7 0-11-4-12-9 5 0 10 2 12 9Z" fill={leaf} />
    <path d="M22 34c3-5 7-7 11-7" />
    <path d="M19 12c-3-7 6-8 6-1 5-5 12 1 5 5 6 4 2 11-4 8-2 7-10 5-10-2-7 1-9-7-2-8 0-3 3-4 5-2Z" fill="#F8D8CF" stroke="#9A3412" />
    <circle cx="22" cy="17" r="3" fill={grain} stroke="#A16207" />
    <path d="M34 26c6 0 9 5 6 9-2 3-8 3-10 0-3-4-1-9 4-9Z" fill="#F1AD94" stroke="#9A3412" />
  </>,
  harvesting: <>
    <path d="M16 41h17m-9 0V10m0 28c-2-4-7-6-11-7m11 7c4-4 8-6 12-7" stroke="#A16207" />
    <path d="M24 16c-5-4-4-8 0-11 4 3 5 7 0 11Zm0 8c-6 0-9-4-9-9 5 1 9 4 9 9Zm0 0c6 0 9-4 9-9-5 1-9 4-9 9Zm0 8c-6 0-9-4-9-9 5 1 9 4 9 9Zm0 0c6 0 9-4 9-9-5 1-9 4-9 9Z" fill={grain} stroke="#A16207" />
  </>,
  none: <><circle cx="24" cy="24" r="13" fill={leaf} /><path d="m18 24 4 4 8-8" /></>,
  heavy_rain: <><path d="M13 26a6 6 0 0 1-1-12 9 9 0 0 1 17-3 8 8 0 1 1 5 15Z" fill="#E0F2FE" /><path d="m15 30-3 6m12-6-3 6m12-6-3 6m-12 2-2 4m12-4-2 4" /></>,
  hail: <><path d="M13 25a6 6 0 0 1-1-12 9 9 0 0 1 17-3 8 8 0 1 1 5 15Z" fill="#E0F2FE" /><path d="m13 30 3 3-3 3-3-3Zm11 7 3 3-3 3-3-3Zm11-7 3 3-3 3-3-3Z" fill="#E0F2FE" /></>,
  heat_wave: <><circle cx="24" cy="25" r="9" fill={grain} /><path d="M24 11V6m0 38v-5M10 25H5m38 0h-5M14 15l-4-4m28 28-4-4m0-20 4-4M10 39l4-4" /></>,
  cold_night: <><path d="M37 30A15 15 0 0 1 19 9a15 15 0 1 0 18 21Z" fill="#E0F2FE" /><path d="M32 10v10m-4-8 8 6m-8 0 8-6" /></>,
  water_shortage: <><path d="M24 8c4 7 10 12 10 19a10 10 0 0 1-20 0c0-7 6-12 10-19Z" strokeDasharray="3 3" /><path d="M19 30h10M9 41h30m-27 0 4-4 5 4m7 0 4 4 4-4" /></>,
};

const eventColors: Record<CheckInEvent, string> = {
  none: "#1E5631", heavy_rain: "#0369A1", hail: "#0369A1",
  heat_wave: "#A16207", cold_night: "#0369A1", water_shortage: "#9A3412",
};

export function StageIllustration({ kind, className = "size-12" }: {
  kind: LifecycleStage | CheckInEvent;
  className?: string;
}) {
  const stroke = Object.hasOwn(eventColors, kind) ? eventColors[kind as CheckInEvent] : "#1E5631";
  return <svg aria-hidden="true" focusable="false" viewBox="0 0 48 48" className={className}
    fill="none" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    {illustrations[kind]}
  </svg>;
}
