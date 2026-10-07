import { z } from "zod";
import { acresToSquareMetres } from "./geometry";

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
