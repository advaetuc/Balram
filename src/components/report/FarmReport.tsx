"use client";
import { useBalramStore, type BalramState } from "@/store/useBalramStore";
import { describeGauge } from "@/components/dashboard/SoilGauges";
import { FarmCardShareButton } from "@/components/ui/FarmCardShareButton";
import { BulletGauge } from "@/components/viz/BulletGauge";
import { WaterDayBar } from "@/components/viz/WaterDayColumn";
import { buildSoilGauges } from "@/lib/domain/viz/gaugeZones";
import { buildWaterRibbon } from "@/lib/domain/viz/waterRibbon";
import type { Locale, SoilKitReading } from "@/types/domain";
import { squareMetresToGunthas } from "@/lib/domain/geometry";
import { MaharashtraCropMatrix, type CropId } from "@/config/cropMatrix";
import { calculatePhaseWaterBreakdown } from "@/lib/domain/irrigation";
import { interpretSoilKitReading } from "@/lib/domain/soilKit";
import { generateFieldVoiceAdvisories } from "@/lib/domain/fieldVoice";
import { cropLabel, lifecycleLabel, t } from "@/config/i18n";
import { formatNumber, formatTime, selectedWeatherDay, resolvedWeatherMetrics } from "@/lib/ui/format";
import { farmRoadmap } from "@/lib/ui/farmRoadmap";
import { ProvenanceBadge } from "@/components/ui/ProvenanceBadge";
import { ShareSummaryButton } from "@/components/ui/ShareSummaryButton";
import { CropCalendar } from "@/components/journey/CropCalendar";
import { displayPlotName, formatArea } from "@/lib/domain/landUnits";
function ReportSoilGauges({ reading, locale, sample }: { reading: SoilKitReading; locale: Locale; sample: boolean }) {
  const labels = t(locale).viz.soilGauges;
  const geometry = buildSoilGauges(reading);
  const gauges = [
    describeGauge(geometry.ph, reading.ph, locale, labels.ph),
    describeGauge(geometry.nitrogen, reading.nitrogenKgPerHa, locale, labels.nitrogen, "kg/ha"),
    describeGauge(geometry.phosphorus, reading.phosphorusKgPerHa, locale, labels.phosphorus, "kg/ha"),
  ];
  return <div className="mt-3 grid gap-2 lg:grid-cols-3 print:grid-cols-3 print:break-inside-avoid">
    {gauges.map(gauge => <BulletGauge key={gauge.label} {...gauge} sample={sample} />)}
  </div>;
}

function ReportWaterSummary({ state }: { state: BalramState }) {
  const { locale, weatherSnapshot, fieldGeometry, cropAllocations } = state;
  const plotIndex = cropAllocations.findIndex(plot => Object.hasOwn(MaharashtraCropMatrix, plot.cropId));
  if (!weatherSnapshot || plotIndex === -1) return null;

  const plot = cropAllocations[plotIndex];
  const days = buildWaterRibbon({ weatherSnapshot, plot, latitudeDeg: fieldGeometry?.center[1] ?? weatherSnapshot.coordinate[1] });
  const provenance = days[0].provenance;
  const scaleMaxMm = Math.max(1, ...days.flatMap(day => [day.rainMm ?? 0, day.cropNeedMm ?? 0]));
  const text = t(locale).viz.waterRibbon;
  const date = new Intl.DateTimeFormat(locale === "mr" ? "mr-IN" : "en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
  const displayDepth = (value: number | null) => value === null ? "—" : formatNumber(value, 1, locale);

  return <section className="mt-5 break-inside-avoid">
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h3 className="text-lg font-bold">{text.title}</h3>
      <p className="text-sm [overflow-wrap:anywhere]">{displayPlotName(plot.plotName, locale, plotIndex + 1)} · {cropLabel(locale, plot.cropId as CropId)}</p>
      <ProvenanceBadge provenance={provenance === "typical_season" ? "estimated" : provenance} locale={locale} />
      {provenance === "typical_season" && <span className="text-sm">{text.typicalSeason}</span>}
    </div>
    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm">
      <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="size-3 rounded-sm bg-info" />{text.rain} (mm)</span>
      <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-0.5 w-4 bg-forest" />{text.cropNeed} (mm)</span>
    </div>
    <ul className="mt-2 grid grid-cols-4 gap-2 text-center sm:grid-cols-7 print:grid-cols-7">
      {days.map(day => <li key={day.date} className="min-w-0 rounded-lg border border-forest/20 bg-daylight px-1 py-2">
        <time dateTime={day.date} className="text-sm font-semibold">{date.format(Date.parse(day.date))}</time>
        <WaterDayBar day={day} scaleMaxMm={scaleMaxMm} />
        <dl className="text-sm font-semibold leading-snug tabular-nums">
          <div className="text-on-info-subtle"><dt className="sr-only">{text.rain} (mm)</dt><dd>{displayDepth(day.rainMm)}</dd></div>
          <div className="text-forest"><dt className="sr-only">{text.cropNeed} (mm)</dt><dd>{displayDepth(day.cropNeedMm)}</dd></div>
        </dl>
      </li>)}
    </ul>
  </section>;
}

export function FarmReport(){const state=useBalramStore(s=>s),text=t(state.locale),day=selectedWeatherDay(state),metrics=resolvedWeatherMetrics(state),field=state.fieldGeometry,area=field?.areaSquareMetres??null,et0=metrics.et0MmPerDay,advisories=generateFieldVoiceAdvisories({allocations:state.cropAllocations,soilKitReading:state.soilKitReading,weatherSnapshot:state.weatherSnapshot,nowMs:state.now}).filter(a=>a.priority!=="tip").slice(0,5),soil=state.soilKitReading?interpretSoilKitReading(state.soilKitReading):null,roadmap=farmRoadmap(state);
 const nutrientLabel=(level:string)=>state.locale==="mr"?({low:"कमी",medium:"मध्यम",high:"जास्त",normal:"सामान्य",elevated:"वाढलेले",untested:"चाचणी नाही"} as Record<string,string>)[level]??level:level;
 return <section id="farm-report" aria-labelledby="report-title" className="bento-card mt-6"><div className="flex flex-wrap items-center justify-between gap-4"><div><p className="mb-2 text-sm leading-body font-bold uppercase tracking-widest text-forest">{text.report}</p><h2 id="report-title" className="text-xl font-bold">{text.report}</h2></div><div className="flex flex-wrap gap-2 print:hidden"><button className="button-secondary print:hidden min-h-12" disabled={!state.hydrated} onClick={()=>window.print()}>{text.print}</button><ShareSummaryButton state={state} roadmap={roadmap}/><FarmCardShareButton state={state} roadmap={roadmap} disabled={!state.hydrated}/></div></div>
 <p className="mt-3 text-sm">{state.farmProfile?.name??(state.locale==="mr"?"तुमचे जतन केलेले शेत":"Your saved field")} · {state.locale==="mr"?"शेत नियोजन सारांश; सिंचनाची सूचना नाही.":"Planning summary, not an irrigation prescription."}</p>{state.sampleDataActive&&<p className="notice mt-3 font-bold">{state.locale==="mr"?"नमुना माहिती · केवळ उदाहरण":"Sample data · illustrative only"}</p>}
 <dl className="mt-5 grid gap-4 sm:grid-cols-3"><div><dt className="text-sm text-stone-600">{text.fieldArea}</dt><dd className="text-lg font-semibold">{area===null?(state.locale==="mr"?"उपलब्ध नाही":"Unavailable"):formatArea(squareMetresToGunthas(area),state.landUnit,state.locale,{includeSecondary:true})}</dd></div><div><dt className="text-sm text-stone-600">{state.locale==="mr"?"संदर्भ बाष्पोत्सर्जन (ET₀)":"Reference ET₀"} ({metrics.date})</dt><dd className="text-lg font-semibold">{formatNumber(et0,1,state.locale)} {state.locale === "mr" ? "मिमी/दिवस" : "mm/day"}</dd><dd className="text-sm leading-body text-stone-600">{state.sampleDataActive?(state.locale==="mr"?"नमुना माहिती · उदाहरण":"Sample data · illustrative"):metrics.et0Provenance==="hargreaves-fallback"?(state.locale==="mr"?"तापमानावरून गणित":"Calculated from temperatures"):metrics.et0Provenance==="maharashtra-baseline"?(state.locale==="mr"?"महाराष्ट्राचा हंगामी आधार":"Maharashtra seasonal baseline"):(state.locale==="mr"?"प्रादेशिक हवामान अंदाज":"Regional weather forecast")}</dd></div><div><dt className="text-sm text-stone-600">{state.locale==="mr"?"शेवटचा बदल":"Last planning edit"}</dt><dd className="text-sm">{formatTime(state.planningUpdatedAt??state.farmProfile?.updatedAt,state.locale)}</dd></div></dl>
 <div className="mt-5 overflow-x-auto"><table className="w-full text-left text-sm"><caption className="pb-3 text-left font-semibold">{text.plots}</caption><thead><tr className="border-b border-forest/20"><th className="p-2">{state.locale==="mr"?"प्लॉट":"Plot"}</th><th className="p-2">{text.crop}</th><th className="p-2">{state.locale==="mr"?"क्षेत्र":"Land size"}</th><th className="p-2">{text.stage}</th><th className="p-2">{state.locale==="mr"?"साप्ताहिक पाणी":"Weekly water"}</th></tr></thead><tbody>{state.cropAllocations.length?state.cropAllocations.map((plot,i)=>{const id=plot.cropId as CropId,crop=MaharashtraCropMatrix[id],size=plot.areaGunthas??(area?area/101.17141056*plot.percentage/100:null),stage=plot.lifecycleStage??"planned",method=state.irrigationSetup?.method==="sprinkler"?"sprinkler":state.irrigationSetup?.method==="surface"?"canal_flood":"drip",phases=size===null||!et0?[]:calculatePhaseWaterBreakdown({cropId:id,areaGunthas:size,baseEt0MmPerDay:et0,effectiveRainfallMmPerDay:day?.precipitation??0,deliveryMethod:method,customSystemFlowLph:state.irrigationSetup?.flowConfirmedByFarmer?state.irrigationSetup.systemFlowLitresPerHour:null,customEfficiency:state.irrigationSetup?.flowConfirmedByFarmer?state.irrigationSetup.applicationEfficiency:null}),water=phases.find(p=>p.stage===stage);const part=size;return <tr key={plot.plotId??`${id}-${i}`} className="border-b border-forest/10"><td className="p-2">{displayPlotName(plot.plotName,state.locale,i+1)}</td><td className="p-2">{crop?cropLabel(state.locale,id):plot.cropId}</td><td className="p-2">{part===null?(state.locale==="mr"?"उपलब्ध नाही":"Unavailable"):`${formatArea(part,state.landUnit,state.locale,{includeSecondary:true})} · ${formatNumber(plot.percentage,2,state.locale)}%`}</td><td className="p-2">{lifecycleLabel(state.locale,stage)}</td><td className="p-2">{water?`${formatNumber(water.weeklyGrossLitres,0,state.locale)} L · ${formatNumber(water.weeklyTankerCount,1,state.locale)} ${state.locale==="mr"?"टँकर":"tanker"}`:(state.locale==="mr"?"उपलब्ध नाही":"Unavailable")}</td></tr>}) : <tr><td colSpan={5} className="p-2">{state.locale==="mr"?"पीक प्लॉट नाहीत":"No plots saved."}</td></tr>}</tbody></table></div>
 {state.soilSkipped&&!state.soilKitReading&&<p className="notice mt-5 break-inside-avoid">{text.soilNotTested}</p>}
 {state.soilKitReading&&soil&&<section className="mt-5 break-inside-avoid">
  <h3 className="text-lg font-bold">{state.locale==="mr"?"माती चाचणी व सुधारणा":"On-site soil test"}</h3>
  <p>{state.soilKitReading.kitType==="balram_inhouse"?(state.locale==="mr"?"बलरामचे इन-हाऊस किट":"Balram In-House Kit"):state.soilKitReading.kitType==="soil_health_card"?(state.locale==="mr"?"मृदा आरोग्य पत्रिका":"Soil Health Card"):(state.locale==="mr"?"व्यावसायिक जलद चाचणी किट":"Commercial Rapid Kit")} · {formatTime(state.soilKitReading.testedAt,state.locale)}</p>
  <p>
   pH {formatNumber(state.soilKitReading.ph,1,state.locale)} · {state.locale==="mr"?"नत्र":"N"} {nutrientLabel(state.soilKitReading.nitrogenLevel)}{state.soilKitReading.nitrogenKgPerHa?` (${formatNumber(state.soilKitReading.nitrogenKgPerHa,1,state.locale)} kg/ha)`:""}
   · {state.locale==="mr"?"स्फुरद":"P"} {nutrientLabel(state.soilKitReading.phosphorusLevel)}{state.soilKitReading.phosphorusKgPerHa?` (${formatNumber(state.soilKitReading.phosphorusKgPerHa,1,state.locale)} kg/ha)`:""}
   {state.soilKitReading.potassiumLevel!=="untested"?` · ${state.locale==="mr"?"पालाश":"K"} ${nutrientLabel(state.soilKitReading.potassiumLevel)}`:""}
   {state.soilKitReading.organicCarbon!=="untested"?` · ${state.locale==="mr"?"सेंद्रिय कर्ब":"Organic carbon"} ${nutrientLabel(state.soilKitReading.organicCarbon)}`:""}
   {state.soilKitReading.salinity!=="untested"?` · ${state.locale==="mr"?"क्षारता":"Salinity"} ${nutrientLabel(state.soilKitReading.salinity)}`:""}
  </p>
  <ReportSoilGauges reading={state.soilKitReading} locale={state.locale} sample={state.sampleDataActive} />
  <h4 className="mt-2 font-semibold">{text.soilPlan}</h4><ul className="list-disc pl-5">{soil.steps.map(s=><li key={s.id}>{state.locale==="mr"?s.actionStep.mr:s.actionStep.en}</li>)}</ul>
 </section>}
 <ReportWaterSummary state={state} />
 <CropCalendar printStatic />
 <section className="mt-5 break-inside-avoid"><h3 className="text-lg font-bold">{text.roadmapReport}</h3>{(["this_week","next_two_weeks","later"] as const).map(bucket=>{const entries=roadmap.filter(item=>item.bucket===bucket);return entries.length?<div key={bucket} className="mt-3"><h4 className="font-semibold">{text.roadmapBuckets[bucket]}</h4><ul className="mt-2 space-y-2">{entries.map(item=><li key={item.id} className="flex flex-wrap items-start gap-x-2"><span><b>{item.title[state.locale]}</b> — {item.detail[state.locale]}</span><ProvenanceBadge provenance={item.provenance} locale={state.locale}/></li>)}</ul></div>:null})}{roadmap.length===0&&<p>{text.roadmapEmpty}</p>}</section>
 <section className="mt-5 break-inside-avoid"><h3 className="text-lg font-bold">{text.checkInsReport}</h3>{state.checkIns.length===0?<p className="mt-2">{text.checkInEmpty}</p>:<ul className="mt-2 space-y-2">{state.checkIns.slice(0,5).map(item=>{const plot=state.cropAllocations.find(p=>p.plotId===item.plotId);return <li key={item.id}><div className="flex flex-wrap items-center gap-2"><b>{item.date}</b><span>{plot?displayPlotName(plot.plotName,state.locale,state.cropAllocations.indexOf(plot)+1):(state.locale==="mr"?"प्लॉट":"Plot")}</span><ProvenanceBadge provenance="you_entered" locale={state.locale}/></div><p>{item.stage?lifecycleLabel(state.locale,item.stage):"—"} · {text.checkInEvents[item.event]}{item.note?` · ${text.note}: ${item.note}`:""}</p></li>})}</ul>}</section>
 {advisories.length>0&&<section className="mt-5 break-inside-avoid"><h3 className="text-lg font-bold">{text.voice}</h3><ul className="list-disc space-y-2 pl-5">{advisories.map(a=><li key={a.id}>{state.locale==="mr"?a.message.mr:a.message.en}</li>)}</ul></section>}
 <div className="mt-5 space-y-2 text-sm leading-body text-stone-600"><p>{state.locale==="mr"?"हवामान स्रोत":"Weather source"}: {state.weatherSnapshot?.source.includes("seasonal baseline")?(state.locale==="mr"?"बलराम · महाराष्ट्राचा हंगामी आधार":state.weatherSnapshot.source):state.weatherSnapshot?.source?(state.locale==="mr"?"प्रादेशिक हवामान सेवा":state.weatherSnapshot.source):(state.locale==="mr"?"अंदाज घेतलेला नाही":"Not fetched")} · {formatTime(state.weatherSnapshot?.fetchedAt,state.locale)}</p><p>{state.locale==="mr"?"क्षेत्रफळ व पीक क्षेत्र शेतकऱ्याने नोंदवलेले किंवा काढलेल्या सीमेतून मोजलेले आहे. पाण्याची मूल्ये अंदाज आहेत; सिंचनाचा आदेश नाहीत. प्रादेशिक अंदाज हे शेतातील मोजमाप नाहीत.":"Area and crop sizes are farmer entered or derived from the drawn field. Water values are estimates, not irrigation commands. Regional forecasts are not field measurements."}</p></div></section>
}
