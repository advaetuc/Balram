import { Dashboard } from "@/components/dashboard/Dashboard";
import { MapClient } from "@/components/map/MapClient";
import { IrrigationPanel } from "@/components/irrigation/IrrigationPanel";
import { FarmReport } from "@/components/report/FarmReport";

export default function Home() {
  return <>
    <div id="farm-overview" className="mb-8 print:hidden">
      <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-forest">Maharashtra · farm planning</p>
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Your field, in focus.</h1>
      <p className="mt-3 max-w-2xl text-base leading-7 text-stone-600">Define your land, balance your crops and plan water use with clear sources and measured inputs.</p>
    </div>
    <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.4fr)] print:hidden">
      <div className="min-w-0 space-y-6"><MapClient /><IrrigationPanel /></div>
      <Dashboard />
    </div>
    <FarmReport />
  </>;
}
