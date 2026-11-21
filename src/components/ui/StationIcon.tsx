import type { JourneyStationId, JourneyStationStatus } from "@/lib/domain/journey";

export function StationIcon({ station, status, className = "", bloom = false }: {
  station: JourneyStationId; status: JourneyStationStatus; className?: string; bloom?: boolean;
}) {
  const done = status === "done";
  const common = "size-10 shrink-0 rounded-full border-2 p-2";
  const paths: Record<JourneyStationId, React.ReactNode> = {
    land: <><path pathLength={1} data-draw="" d="M12 20v-5"/><g className="fill"><path pathLength={1} data-draw="" d="M12 15c-5 0-7-3-7-8 5 0 7 3 7 8Z"/><path pathLength={1} data-draw="" d="M12 17c0-5 2-8 7-9 0 5-2 8-7 9Z"/></g></>,
    weather: <><path pathLength={1} data-draw="" d="M12 21v-9"/><g className="fill"><path pathLength={1} data-draw="" d="M12 16c-4 0-6-2-6-6 4 0 6 2 6 6Z"/><path pathLength={1} data-draw="" d="M12 13c0-4 2-6 6-7 0 4-2 6-6 7Z"/></g></>,
    soil: <><path pathLength={1} data-draw="" d="M12 21v-8"/><g className="fill"><path pathLength={1} data-draw="" d="M12 16C5 16 4 10 4 5c6 0 8 4 8 11Z"/><path pathLength={1} data-draw="" d="M12 14c0-5 3-8 8-8 0 5-3 8-8 8Z"/></g></>,
    crops: <><path pathLength={1} data-draw="" d="M12 21v-7"/><g className="fill"><path pathLength={1} data-draw="" d="M12 14c-1-5-5-6-8-5 1 4 3 6 8 5Z"/><path pathLength={1} data-draw="" d="M12 14c1-5 5-6 8-5-1 4-3 6-8 5Z"/><circle pathLength={1} data-draw="" cx="12" cy="8" r="3"/></g></>,
    advice: <><path pathLength={1} data-draw="" d="M12 21v-8"/><g className="fill"><path pathLength={1} data-draw="" d="M12 14c-5 0-7-3-7-7 5 0 7 3 7 7Z"/><path pathLength={1} data-draw="" d="M12 14c0-5 3-8 7-8 0 5-2 8-7 8Z"/><circle pathLength={1} data-draw="" cx="12" cy="8" r="3"/></g></>,
    roadmap: <><path pathLength={1} data-draw="" d="M12 21V5"/><g className="fill"><path pathLength={1} data-draw="" d="M12 8 8 5M12 11 7 8M12 14 8 11M12 17 7 14"/><path pathLength={1} data-draw="" d="m12 8 4-3m-4 6 5-3m-5 6 4-3m-4 6 5-3"/></g></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill={done ? "#1E5631" : "none"} stroke={done ? "#1E5631" : "currentColor"} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" data-bloom={bloom ? "" : undefined} className={`station-icon ${common} ${done ? "border-forest bg-forest/10 text-forest" : "border-forest/25 bg-white text-ink"} ${className}`}>
    {paths[station]}
  </svg>;
}
