import { z } from "zod";
import { CropAllocationSchema, lifecycleToGrowthStage, type CropAllocation, type LifecycleStage } from "@/types/domain";
import { acresToSquareMetres, squareMetresToGunthas } from "./geometry";

function basisPoints(percentage: number): number {
  const value = z.number().finite().min(0).max(100).parse(percentage) * 100;
  const rounded = Math.round(value);
  if (Math.abs(value - rounded) > 1e-8) throw new RangeError("Use at most two decimal places for crop percentages.");
  return rounded;
}

/** Integer basis points make 100% exact; an empty draft is distinct from a complete portfolio. */
export function validatePortfolio(input: readonly CropAllocation[]): CropAllocation[] {
  const entries = z.array(CropAllocationSchema).min(1).max(50).parse(input);
  if (new Set(entries.map((entry) => entry.cropId)).size !== entries.length) throw new RangeError("Duplicate crops are not allowed.");
  if (entries.reduce((sum, entry) => sum + basisPoints(entry.percentage), 0) !== 10_000) {
    throw new RangeError("Crop allocations must total exactly 100%.");
  }
  return entries;
}

/** Largest-remainder apportionment keeps the other crops proportional and the total exactly 100%. */
export function rebalancePortfolio(input: readonly CropAllocation[], cropId: string, percentage: number): CropAllocation[] {
  const portfolio = validatePortfolio(input);
  const selected = portfolio.find((entry) => entry.cropId === cropId);
  if (!selected) throw new RangeError("The selected crop is not in this portfolio.");
  const selectedPoints = basisPoints(percentage);
  const others = portfolio.filter((entry) => entry.cropId !== cropId);
  if (!others.length && selectedPoints !== 10_000) throw new RangeError("A one-crop portfolio must remain at 100%.");
  const remaining = 10_000 - selectedPoints;
  const total = others.reduce((sum, entry) => sum + basisPoints(entry.percentage), 0);
  const apportioned = others.map((entry, index) => {
    const exact = basisPoints(entry.percentage) * remaining / total;
    return { entry, index, points: Math.floor(exact), remainder: exact % 1 };
  });
  let residual = remaining - apportioned.reduce((sum, item) => sum + item.points, 0);
  for (const item of [...apportioned].sort((a, b) => b.remainder - a.remainder || a.index - b.index)) {
    if (residual-- > 0) item.points++;
  }
  const updates = new Map(apportioned.map((item) => [item.entry.cropId, item.points]));
  updates.set(cropId, selectedPoints);
  return validatePortfolio(portfolio.map((entry) => ({ ...entry, percentage: updates.get(entry.cropId)! / 100 }))
    .filter((entry) => entry.percentage > 0));
}

export function allocateAcreage(input: readonly CropAllocation[], totalAcres: number) {
  const area = z.number().finite().positive().parse(totalAcres);
  return validatePortfolio(input).map((entry) => {
    const areaAcres = area * basisPoints(entry.percentage) / 10_000;
    return { ...entry, areaAcres, areaSquareMetres: acresToSquareMetres(areaAcres) };
  });
}

export function allocatePlotsByGunthas(plots:readonly CropAllocation[],totalAreaSquareMetres:number|null) {
 const totalFarmGunthas=totalAreaSquareMetres===null?null:squareMetresToGunthas(z.number().finite().positive().parse(totalAreaSquareMetres));
 const resolved=plots.map(p=>({...p,areaGunthas:p.areaGunthas??(totalFarmGunthas===null?null:totalFarmGunthas*p.percentage/100)}));
 const allocatedGunthas=resolved.reduce((s,p)=>s+(p.areaGunthas??0),0);
 const entries=resolved.map(p=>({...p,percentage:totalFarmGunthas?Math.round((p.areaGunthas??0)/totalFarmGunthas*10000)/100:p.percentage,
  ...(p.lifecycleStage?{growthStage:lifecycleToGrowthStage(p.lifecycleStage)}:{})}));
 return {plots:entries,totalFarmGunthas,allocatedGunthas,unassignedGunthas:totalFarmGunthas===null?null:Math.max(0,totalFarmGunthas-allocatedGunthas)};
}
export function upsertPlotAllocation(plots:readonly CropAllocation[],input:{plotId?:string;plotName:string;cropId:string;areaGunthas:number;lifecycleStage:LifecycleStage;plantingDate?:string|null},totalAreaSquareMetres:number|null):CropAllocation[] {
 const area=z.number().finite().positive().parse(input.areaGunthas), total=totalAreaSquareMetres===null?null:squareMetresToGunthas(z.number().finite().positive().parse(totalAreaSquareMetres));
 const id=input.plotId??`plot-${Date.now()}`, previous=plots.filter(p=>p.plotId!==id);
 const sum=previous.reduce((s,p)=>s+(p.areaGunthas??0),0)+area;
 if(total!==null&&sum>total+.05) throw new RangeError("Plot areas exceed the total farm area.");
 const all=[...previous,{plotId:id,plotName:input.plotName,cropId:input.cropId,areaGunthas:area,lifecycleStage:input.lifecycleStage,percentage:1,season:"kharif" as const,growthStage:lifecycleToGrowthStage(input.lifecycleStage),plantingDate:input.plantingDate??null}];
 const denom=total??sum;
 return all.map(p=>({...p,percentage:Math.round((p.areaGunthas??0)/denom*10000)/100}));
}
