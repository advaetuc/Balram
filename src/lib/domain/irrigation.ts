import { z } from "zod";
import { acresToSquareMetres } from "./geometry";
import { MaharashtraCropMatrix, type CropId, getCropStageKc } from "@/config/cropMatrix";
import type { LifecycleStage, WeatherSnapshot, CropAllocation } from "@/types/domain";

const nonnegative = z.number().finite().nonnegative();
const positive = z.number().finite().positive();
const finiteResult = (value: number) => nonnegative.parse(value);

/** FAO-56 ETc = Kc × ET0. Kc must correspond to the crop's actual growth stage. */
export function calculateCropWaterRequirement(et0MmPerDay: number, cropKc: number): number {
  return finiteResult(nonnegative.parse(et0MmPerDay) * nonnegative.parse(cropKc));
}

/** One millimetre over one square metre is one litre; retain precision until presentation. */
export function depthToLitres(depthMm: number, areaAcres: number): number {
  return finiteResult(nonnegative.parse(depthMm) * acresToSquareMetres(areaAcres));
}

export const IrrigationDemandSchema = z.object({
  et0: nonnegative, cropKc: nonnegative, areaAcres: positive,
  effectiveRainfallMm: nonnegative,
}).strict();

export function calculateIrrigationDemand(input: z.infer<typeof IrrigationDemandSchema>) {
  const params = IrrigationDemandSchema.parse(input);
  const cropEtMm = calculateCropWaterRequirement(params.et0, params.cropKc);
  const netDepthMm = Math.max(0, cropEtMm - params.effectiveRainfallMm);
  return { cropEtMm, netDepthMm, netVolumeLitres: depthToLitres(netDepthMm, params.areaAcres),
    assumptions: "Daily planning balance using caller-supplied effective rainfall; excludes soil storage, runoff, leaching and water stress corrections." };
}

export const DripRuntimeSchema = IrrigationDemandSchema.extend({
  emitterFlowRateLph: positive,
  emittersPerAcre: positive,
  dripEfficiency: positive.max(1),
  inputsConfirmedByFarmer: z.literal(true),
}).strict();

export function calculateDailyDripEstimate(input: z.infer<typeof DripRuntimeSchema>) {
  const params = DripRuntimeSchema.parse(input);
  const demand = calculateIrrigationDemand({ et0: params.et0, cropKc: params.cropKc,
    areaAcres: params.areaAcres, effectiveRainfallMm: params.effectiveRainfallMm });
  const grossVolumeLitres = finiteResult(demand.netVolumeLitres / params.dripEfficiency);
  const networkFlowLitresPerHour = positive.parse(params.emittersPerAcre * params.areaAcres * params.emitterFlowRateLph);
  return { ...demand, grossVolumeLitres, networkFlowLitresPerHour,
    runtimeMinutes: finiteResult(grossVolumeLitres / networkFlowLitresPerHour * 60),
    label: "Planning estimate" as const };
}

export function calculateDailyDripRuntime(input: z.infer<typeof DripRuntimeSchema>): number {
  return calculateDailyDripEstimate(input).runtimeMinutes;
}

export const SystemRuntimeSchema = IrrigationDemandSchema.extend({
  systemFlowLitresPerHour: positive,
  applicationEfficiency: positive.max(1),
  inputsConfirmedByFarmer: z.literal(true),
}).strict();

/** Measured total flow for the irrigated block; no emitter density is guessed. */
export function calculateSystemRuntime(input: z.infer<typeof SystemRuntimeSchema>) {
  const params = SystemRuntimeSchema.parse(input);
  const demand = calculateIrrigationDemand({ et0: params.et0, cropKc: params.cropKc,
    areaAcres: params.areaAcres, effectiveRainfallMm: params.effectiveRainfallMm });
  const grossVolumeLitres = finiteResult(demand.netVolumeLitres / params.applicationEfficiency);
  return { ...demand, grossVolumeLitres,
    runtimeMinutes: finiteResult(grossVolumeLitres / params.systemFlowLitresPerHour * 60) };
}

export function calculateHargreavesEt0(input:{latitudeDeg:number;dateIso:string;tempMinC:number;tempMaxC:number}):number {
 const p=z.object({latitudeDeg:z.number().finite().min(-90).max(90),dateIso:z.string().date(),tempMinC:z.number().finite(),tempMaxC:z.number().finite()}).parse(input);
 if(p.tempMinC>p.tempMaxC)throw new RangeError("Minimum temperature cannot exceed maximum.");
 const date=new Date(`${p.dateIso}T00:00:00Z`), start=new Date(Date.UTC(date.getUTCFullYear(),0,0)), J=Math.floor((date.getTime()-start.getTime())/86400000);
 const phi=p.latitudeDeg*Math.PI/180, dr=1+.033*Math.cos(2*Math.PI*J/365), delta=.409*Math.sin(2*Math.PI*J/365-1.39), ws=Math.acos(Math.max(-1,Math.min(1,-Math.tan(phi)*Math.tan(delta))));
 const ra=(24*60/Math.PI)*.0820*dr*(ws*Math.sin(phi)*Math.sin(delta)+Math.cos(phi)*Math.cos(delta)*Math.sin(ws))*(1e6/2.45e6);
 return finiteResult(.0023*ra*((p.tempMaxC+p.tempMinC)/2+17.8)*Math.sqrt(Math.max(0,p.tempMaxC-p.tempMinC)));
}
export function resolveDailyEt0(day:WeatherSnapshot["daily"][number]|null,latitudeDeg:number) {
 if(day?.referenceEvapotranspiration!=null)return {et0MmPerDay:day.referenceEvapotranspiration,provenance:"open-meteo" as const};
 if(day?.temperatureMin!=null&&day.temperatureMax!=null)return {et0MmPerDay:calculateHargreavesEt0({latitudeDeg,dateIso:day.date,tempMinC:day.temperatureMin,tempMaxC:day.temperatureMax}),provenance:"hargreaves-fallback" as const};return null;
}
export type DeliveryMethodPreset="drip"|"sprinkler"|"canal_flood";
const delivery={drip:{efficiency:.9,flow:100},sprinkler:{efficiency:.75,flow:150},canal_flood:{efficiency:.6,flow:450}} as const;
export function calculatePhaseWaterBreakdown(input:{cropId:CropId;areaGunthas:number;baseEt0MmPerDay:number;effectiveRainfallMmPerDay?:number;deliveryMethod:DeliveryMethodPreset;customSystemFlowLph?:number|null;customEfficiency?:number|null}) {
 const p=z.object({cropId:z.enum(["sugarcane","rabi_jowar","onion","bajra","pomegranate","groundnut"]),areaGunthas:positive,baseEt0MmPerDay:nonnegative,effectiveRainfallMmPerDay:nonnegative.optional(),deliveryMethod:z.enum(["drip","sprinkler","canal_flood"]),customSystemFlowLph:positive.nullable().optional(),customEfficiency:positive.max(1).nullable().optional()}).parse(input);
 const crop=MaharashtraCropMatrix[p.cropId], eff=p.customEfficiency??delivery[p.deliveryMethod].efficiency, flow=p.customSystemFlowLph??delivery[p.deliveryMethod].flow*p.areaGunthas;
 return (Object.keys(crop.phaseWeeks) as LifecycleStage[]).map(stage=>{const stageKc=getCropStageKc(p.cropId,stage),durationWeeks=crop.phaseWeeks[stage],dailyNetLitres=Math.max(0,(p.baseEt0MmPerDay*stageKc-(p.effectiveRainfallMmPerDay??0))*p.areaGunthas*101.17141056),dailyGrossLitres=dailyNetLitres/eff,weeklyGrossLitres=dailyGrossLitres*7;return {stage,stageKc,durationWeeks,dailyNetLitres,dailyGrossLitres,weeklyGrossLitres,weeklyTankerCount:weeklyGrossLitres/10000,dailyRuntimeMinutes:dailyGrossLitres/flow*60}});
}
export function simulateDroughtReallocation(input:{allocations:readonly CropAllocation[];totalAreaSquareMetres:number;baseEt0MmPerDay:number;waterAvailabilityPercent:number}) {
 const p=z.object({allocations:z.array(z.any()),totalAreaSquareMetres:positive,baseEt0MmPerDay:nonnegative,waterAvailabilityPercent:z.number().finite().min(0).max(100)}).parse(input);
 const totalGunthas=p.totalAreaSquareMetres/101.17141056, plots=p.allocations as CropAllocation[];
 const demand=plots.reduce((sum,a)=>sum+p.baseEt0MmPerDay*MaharashtraCropMatrix[a.cropId as CropId]?.baseKc*(a.areaGunthas??totalGunthas*a.percentage/100)*101.17141056,0);
 const deficit=demand*(1-p.waterAvailabilityPercent/100), shift=deficit/(p.baseEt0MmPerDay*1.05*101.17141056);
 return {dailyDemandLitres:demand,availableDailyLitres:demand*p.waterAvailabilityPercent/100,deficitLitres:Math.max(0,deficit),suggestedShiftGunthas:p.waterAvailabilityPercent<100?Math.min(totalGunthas,shift):0,recommendation:p.waterAvailabilityPercent<100?`Consider shifting about ${Math.min(totalGunthas,shift).toFixed(1)} gunthas from water-intensive crops toward drought-tolerant crops; review locally before changing planting.`:"Current scenario has no modeled water deficit."};
}
