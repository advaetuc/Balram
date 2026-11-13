import type { GrowthStage, LifecycleStage } from "@/types/domain";
export type Season = "Kharif" | "Rabi" | "Zaid" | "Perennial";
export interface CropStageKc { readonly initial:number; readonly development:number; readonly "mid-season":number; readonly "late-season":number }
export interface CropThresholds {
  readonly id:string; readonly name:string; readonly marathiName:string; readonly season:Season; readonly supportedSeasons:readonly Season[];
  readonly baseKc:number; readonly kcByStage:CropStageKc; readonly minSoilMoisture:number; readonly maxAirTemp:number;
  readonly frostSensitive:boolean; readonly dripEfficiency:number; readonly optimalPhRange:readonly [number,number];
  readonly npkDemand:{readonly nitrogen:"low"|"medium"|"high";readonly phosphorus:"low"|"medium"|"high";readonly potassium:"low"|"medium"|"high";readonly nitrogenFixing?:boolean};
  readonly droughtTolerance:"high"|"moderate"|"low"; readonly waterBudgetMmPerSeason:readonly [number,number];
  readonly phaseWeeks:{readonly planned:number;readonly vegetative:number;readonly flowering_fruiting:number;readonly harvesting:number};
  readonly plainSummary:{readonly en:string;readonly mr:string};
}
export const CROP_RULE_PROVENANCE = Object.freeze({ version:"blueprint-1", source:"v0.2.0 implementation blueprint", kcStage:"mid-season", soilContext:"Vertisol planning thresholds; not universal field triggers", soilMoistureUnit:"m³/m³", temperatureUnit:"°C", reviewedForFieldAdvice:false, note:"Confirm local soil, crop stage and measured system efficiency before operational use. Modelled shallow moisture is not a root-zone measurement." });
const make=(id:string,name:string,mr:string,season:Season,supportedSeasons:Season[],baseKc:number,kcByStage:CropStageKc,minSoilMoisture:number,maxAirTemp:number,frostSensitive:boolean,dripEfficiency:number,optimalPhRange:[number,number],npkDemand:CropThresholds["npkDemand"],droughtTolerance:CropThresholds["droughtTolerance"],waterBudgetMmPerSeason:[number,number],phaseWeeks:CropThresholds["phaseWeeks"],en:string,mrSummary:string):CropThresholds=>({id,name,marathiName:mr,season,supportedSeasons,baseKc,kcByStage,minSoilMoisture,maxAirTemp,frostSensitive,dripEfficiency,optimalPhRange,npkDemand,droughtTolerance,waterBudgetMmPerSeason,phaseWeeks,plainSummary:{en,mr:mrSummary}});
export const MaharashtraCropMatrix=Object.freeze({
 sugarcane:make("sugarcane","Sugarcane","ऊस","Perennial",["Perennial","Kharif","Rabi"],1.25,{initial:.4,development:.8,"mid-season":1.25,"late-season":.75},.38,38,false,.9,[6.5,8],{nitrogen:"high",phosphorus:"high",potassium:"high"},"low",[1800,2200],{planned:6,vegetative:16,flowering_fruiting:22,harvesting:8},"Needs steady water and balanced feeding.","नियमित पाणी आणि संतुलित खताची गरज."),
 rabi_jowar:make("rabi_jowar","Rabi Jowar","रब्बी ज्वारी","Rabi",["Rabi"],.75,{initial:.35,development:.6,"mid-season":.75,"late-season":.5},.18,35,false,.85,[6,8.5],{nitrogen:"medium",phosphorus:"medium",potassium:"low"},"high",[400,500],{planned:3,vegetative:5,flowering_fruiting:6,harvesting:3},"A hardy rabi grain crop.","रब्बी हंगामातील तगडे धान्य पीक."),
 onion:make("onion","Onion","कांदा","Rabi",["Rabi","Kharif"],1.05,{initial:.7,development:.9,"mid-season":1.05,"late-season":.75},.28,32,true,.9,[6,7.5],{nitrogen:"medium",phosphorus:"high",potassium:"high"},"low",[550,650],{planned:3,vegetative:5,flowering_fruiting:6,harvesting:3},"Needs careful moisture through bulb sizing.","कांदा वाढताना जमिनीतील ओलावा जपा."),
 bajra:make("bajra","Bajra","बाजरी","Kharif",["Kharif","Zaid"],.85,{initial:.35,development:.6,"mid-season":.85,"late-season":.45},.12,40,false,.85,[6.5,8.5],{nitrogen:"low",phosphorus:"low",potassium:"low"},"high",[300,400],{planned:2,vegetative:4,flowering_fruiting:4,harvesting:2},"A hardy millet suited to drier spells.","कोरड्या काळात तग धरणारे बाजरी पीक."),
 pomegranate:make("pomegranate","Pomegranate","डाळिंब","Perennial",["Perennial","Kharif","Rabi","Zaid"],.65,{initial:.4,development:.55,"mid-season":.65,"late-season":.55},.25,42,false,.95,[6.5,8.5],{nitrogen:"medium",phosphorus:"medium",potassium:"high"},"high",[700,900],{planned:4,vegetative:8,flowering_fruiting:10,harvesting:4},"A perennial fruit suited to drier regions.","कमी पावसाच्या भागासाठी बारमाही फळपीक."),
 groundnut:make("groundnut","Groundnut","भुईमूग","Kharif",["Kharif","Zaid","Rabi"],.95,{initial:.4,development:.7,"mid-season":.95,"late-season":.6},.2,36,false,.85,[6,7.8],{nitrogen:"low",phosphorus:"high",potassium:"medium",nitrogenFixing:true},"moderate",[450,550],{planned:3,vegetative:4,flowering_fruiting:6,harvesting:3},"A nitrogen-fixing legume.","नत्र स्थिरीकरण करणारे कडधान्य पीक.")
} satisfies Record<string,CropThresholds>);
export type CropId=keyof typeof MaharashtraCropMatrix;
export function getCropStageKc(cropId:CropId,stage?:LifecycleStage|GrowthStage):number {
 const c=MaharashtraCropMatrix[cropId]; const s=stage==="planned"?"initial":stage==="vegetative"?"development":stage==="flowering_fruiting"?"mid-season":stage==="harvesting"?"late-season":stage;
 return s&&s!=="unknown"?c.kcByStage[s]:c.baseKc;
}
