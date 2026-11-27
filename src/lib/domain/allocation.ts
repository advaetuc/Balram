import { z } from "zod";
import { lifecycleToGrowthStage, type CropAllocation, type LifecycleStage } from "@/types/domain";
import { createFieldId, squareMetresToGunthas } from "./geometry";
import { MaharashtraCropMatrix, type CropId } from "@/config/cropMatrix";

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
 const id=input.plotId??createFieldId().replace(/^field-/,"plot-"), previous=plots.filter(p=>p.plotId!==id);
 const sum=previous.reduce((s,p)=>s+(p.areaGunthas??0),0)+area;
 if(total!==null&&sum>total+.05) throw new RangeError("Plot areas exceed the total farm area.");
 const season=(MaharashtraCropMatrix[input.cropId as CropId]?.season.toLowerCase()??"kharif") as CropAllocation["season"];
 const all=[...previous,{plotId:id,plotName:input.plotName,cropId:input.cropId,areaGunthas:area,lifecycleStage:input.lifecycleStage,percentage:1,season,growthStage:lifecycleToGrowthStage(input.lifecycleStage),plantingDate:input.plantingDate??null}];
 const denom=total??sum;
 return all.map(p=>({...p,percentage:Math.round((p.areaGunthas??0)/denom*10000)/100}));
}

/** Canonical plot-area update: gunthas are stored to 0.1 and all shares derive from them. */
export function updatePlotGunthas(plots:readonly CropAllocation[],targetPlotId:string,nextGunthas:number,totalAreaSquareMetres:number|null):CropAllocation[] {
 const rounded=Math.round(z.number().finite().positive().parse(nextGunthas)*10)/10;
 if(rounded<=0)throw new RangeError("Plot area must be at least 0.1 guntha.");
 const total=totalAreaSquareMetres===null?null:squareMetresToGunthas(z.number().finite().positive().parse(totalAreaSquareMetres));
 const resolved=plots.map(plot=>({...plot,areaGunthas:plot.areaGunthas??(total===null?null:total*plot.percentage/100)}));
 if(!resolved.some((p,i)=>(p.plotId??`${p.cropId}-${i}`)===targetPlotId))throw new RangeError("The selected plot could not be found.");
 const next=resolved.map((p,i)=>(p.plotId??`${p.cropId}-${i}`)===targetPlotId?{...p,areaGunthas:rounded}:p);
 const sum=next.reduce((s,p)=>s+(p.areaGunthas??0),0);
 if(total!==null&&sum>total+.05)throw new RangeError("Plot areas exceed the remaining farm land.");
 const denominator=total??sum;
 if(denominator<=0)throw new RangeError("Enter a valid total plot area.");
 const targetPoints = Math.min(10_000, Math.max(next.length, Math.round(sum / denominator * 10_000)));
 const shares = next.map(plot => (plot.areaGunthas ?? 0) / sum * targetPoints);
 const points = shares.map(share => Math.max(1, Math.floor(share)));
 let remaining = targetPoints - points.reduce((totalPoints, share) => totalPoints + share, 0);
 const order = shares.map((share, index) => ({ index, remainder: share - points[index] }))
   .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
 for (const { index } of order) {
   if (remaining <= 0) break;
   points[index]++;
   remaining--;
 }
 // Tiny positive plots need one basis point to remain valid. Fund those points from larger plots.
 for (const { index } of order.reverse()) {
   if (remaining >= 0) break;
   const deduction = Math.min(points[index] - 1, -remaining);
   points[index] -= deduction;
   remaining += deduction;
 }
 return next.map((plot, index) => ({ ...plot, percentage: points[index] / 100 }));
}
