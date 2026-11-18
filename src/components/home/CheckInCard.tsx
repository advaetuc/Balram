"use client";
import { useState } from "react";
import { t, lifecycleLabel } from "@/config/i18n";
import { isCheckInDue } from "@/lib/domain/checkIns";
import { createFieldId } from "@/lib/domain/geometry";
import { indiaDate } from "@/lib/ui/format";
import { ProvenanceBadge } from "@/components/ui/ProvenanceBadge";
import { useBalramStore } from "@/store/useBalramStore";
import type { CheckInEvent, LifecycleStage } from "@/types/domain";
import { displayPlotName } from "@/lib/domain/landUnits";

const stages: LifecycleStage[] = ["planned", "vegetative", "flowering_fruiting", "harvesting"];
const events: CheckInEvent[] = ["none", "heavy_rain", "hail", "heat_wave", "cold_night", "water_shortage"];
export function CheckInCard() {
  const state = useBalramStore(s => s), copy = t(state.locale), mr = state.locale === "mr";
  const [cadence, setCadence] = useState<7|30>(7), [open, setOpen] = useState(false), [plotId, setPlotId] = useState(state.cropAllocations[0]?.plotId ?? ""), [stage, setStage] = useState<LifecycleStage>(state.cropAllocations[0]?.lifecycleStage ?? "planned"), [event, setEvent] = useState<CheckInEvent>("none"), [note, setNote] = useState("");
  const nowIso = state.now === null ? null : new Date(state.now).toISOString();
  const due = isCheckInDue(state.checkIns, nowIso, cadence);
  const selectedPlot = state.cropAllocations.find(plot => plot.plotId === plotId) ?? state.cropAllocations[0];
  const save = () => {
    if (!selectedPlot) return;
    state.addCheckIn({ id: createFieldId().replace(/^field-/, "checkin-"), date: indiaDate(state.now) ?? "2026-11-16", plotId: selectedPlot.plotId ?? null, stage, event, note });
    setOpen(false); setNote(""); setEvent("none");
  };
  return <section className="bento-card space-y-4" aria-labelledby="check-in-title">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 id="check-in-title" className="text-xl font-bold">{due ? copy.checkInDueTitle : copy.checkInRecent}</h2><p className="mt-1 text-sm">{due ? copy.checkInDueBody : copy.checkInRecent}</p></div><div className="flex flex-wrap gap-2"><button type="button" className={`min-h-12 min-w-12 rounded-xl px-3 font-semibold ${cadence===7?"bg-forest text-white":"border border-forest/20"}`} aria-pressed={cadence===7} onClick={()=>setCadence(7)}>{copy.checkInWeekly}</button><button type="button" className={`min-h-12 min-w-12 rounded-xl px-3 font-semibold ${cadence===30?"bg-forest text-white":"border border-forest/20"}`} aria-pressed={cadence===30} onClick={()=>setCadence(30)}>{copy.checkInMonthly}</button></div></div>
    {!open ? <button type="button" className="button-primary min-h-12" onClick={()=>{setPlotId(state.cropAllocations[0]?.plotId??"");setStage(state.cropAllocations[0]?.lifecycleStage??"planned");setOpen(true)}}>{copy.checkInStart}</button> : <div className="space-y-4 rounded-xl bg-daylight p-4">
      {state.cropAllocations.length>1&&<label className="block font-semibold">{copy.checkInPlot}<select className="mt-2 min-h-12 w-full rounded-lg border p-3" value={plotId} onChange={e=>{setPlotId(e.target.value);const p=state.cropAllocations.find(x=>x.plotId===e.target.value);if(p?.lifecycleStage)setStage(p.lifecycleStage)}}>{state.cropAllocations.map((plot,i)=><option key={plot.plotId??i} value={plot.plotId??""}>{displayPlotName(plot.plotName,state.locale,i+1)}</option>)}</select></label>}
      <fieldset><legend className="font-semibold">{copy.checkInStage}</legend><div className="mt-2 grid grid-cols-2 gap-2">{stages.map(value=><button type="button" key={value} aria-pressed={stage===value} className={`min-h-12 min-w-12 rounded-xl px-3 font-semibold ${stage===value?"bg-forest text-white":"border border-forest/20 bg-white"}`} onClick={()=>setStage(value)}>{copy.stageNames[value]}</button>)}</div></fieldset>
      <fieldset><legend className="font-semibold">{copy.checkInEvent}</legend><div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">{events.map(value=><button type="button" key={value} aria-pressed={event===value} className={`min-h-12 min-w-12 rounded-xl px-3 font-semibold ${event===value?"bg-forest text-white":"border border-forest/20 bg-white"}`} onClick={()=>setEvent(value)}>{copy.checkInEvents[value]}</button>)}</div></fieldset>
      <label className="block font-semibold">{copy.checkInNote}<textarea className="mt-2 min-h-12 w-full rounded-lg border p-3" maxLength={280} value={note} onChange={e=>setNote(e.target.value)} /></label>
      <div className="flex flex-wrap gap-2"><button type="button" className="button-primary min-h-12" onClick={save}>{copy.checkInSave}</button><button type="button" className="button-secondary min-h-12" onClick={()=>setOpen(false)}>{copy.checkInCancel}</button></div>
    </div>}
    <div><h3 className="font-bold">{copy.checkInRecent}</h3>{state.checkIns.length===0?<p className="mt-2 text-sm">{copy.checkInEmpty}</p>:<ul className="mt-2 space-y-2">{state.checkIns.slice(0,5).map(item=>{const plot=state.cropAllocations.find(p=>p.plotId===item.plotId);return <li key={item.id} className="rounded-xl border border-forest/15 p-3"><div className="flex flex-wrap items-center gap-2"><b>{item.date}</b><span>{plot?displayPlotName(plot.plotName,state.locale,state.cropAllocations.indexOf(plot)+1):(mr?"प्लॉट":"Plot")}</span><ProvenanceBadge provenance="you_entered" locale={state.locale}/></div><p className="mt-1 text-sm">{item.stage?lifecycleLabel(state.locale,item.stage):"—"} · {copy.checkInEvents[item.event]}{item.note?` · ${item.note}`:""}</p></li>})}</ul>}</div>
  </section>;
}
