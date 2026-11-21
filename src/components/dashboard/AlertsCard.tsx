"use client";
import { useBalramStore } from "@/store/useBalramStore";
import { generateFieldVoiceAdvisories } from "@/lib/domain/fieldVoice";
import { Card, DataCaption } from "./Card";
import { t } from "@/config/i18n";
import { cropLabel } from "@/config/i18n";
import { displayPlotName } from "@/lib/domain/landUnits";
export function AlertsCard(){const state=useBalramStore(s=>s),text=t(state.locale),advisories=generateFieldVoiceAdvisories({allocations:state.cropAllocations,soilKitReading:state.soilKitReading,weatherSnapshot:state.weatherSnapshot,nowMs:state.now});const mr=state.locale==="mr";
 return <Card id="alerts" title={text.voice} eyebrow={text.voiceEyebrow} className="md:col-span-2"><div className="mt-3 space-y-3" aria-live="polite">{advisories.map(a=><article key={a.id} className="rounded-xl border border-forest/15 p-4"><div className="flex flex-wrap gap-2"><span className={`data-badge ${a.priority==="urgent"?"bg-amber/30":a.priority==="action"?"bg-sky/15":"bg-stone-100"}`}>{a.priority==="urgent"?(mr?"तातडीची कृती":"Urgent Field Action"):a.priority==="action"?(mr?"माती व पोषण कृती":"Soil & Nutrient Action"):(mr?"शेत टीप":"Field Tip")}</span>{a.plotName&&<span className="data-badge bg-forest/10">{displayPlotName(a.plotName,state.locale)}{a.cropId?` · ${cropLabel(state.locale,a.cropId)}`:""}</span>}</div><h3 className="mt-2 font-bold">{a.headline[state.locale]}</h3><p className="mt-1 text-sm leading-6">{a.message[state.locale]}</p><p className="mt-2 text-sm font-semibold">{a.actionLabel[state.locale]}</p><details className="mt-2"><summary>{text.whyAdvice}</summary><p className="rounded-lg bg-daylight p-3 text-sm">{a.reason[state.locale]}</p></details></article>)}</div><DataCaption source={mr?"जतन केलेली माहिती व सेवा स्थिती":"Balram checks on saved inputs and provider status"} validAt={state.now===null?null:new Date(state.now).toISOString()} sample={state.sampleDataActive}/></Card>
}
