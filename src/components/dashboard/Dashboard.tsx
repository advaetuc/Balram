"use client";

import { WeatherCard } from "./WeatherCard";
import { SoilCard } from "./SoilCard";
import { PortfolioCard } from "./PortfolioCard";
import { AlertsCard } from "./AlertsCard";
import { useBalramStore } from "@/store/useBalramStore";

export function Dashboard() {
  const sample = useBalramStore((state) => state.sampleDataActive);
  return <div className="grid min-w-0 gap-5 md:grid-cols-2" key={String(sample)}>
    <WeatherCard /><SoilCard /><PortfolioCard /><AlertsCard />
  </div>;
}
