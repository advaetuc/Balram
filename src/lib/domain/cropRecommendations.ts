import { MaharashtraCropMatrix, type Season, type CropId } from "@/config/cropMatrix";
import type { SoilKitReading, WeatherSnapshot } from "@/types/domain";
export function detectMaharashtraSeason(monthZeroIndexed:number):Season {
 if(!Number.isInteger(monthZeroIndexed)||monthZeroIndexed<0||monthZeroIndexed>11)throw new RangeError("Month must be an integer from 0 to 11.");
 return monthZeroIndexed>=5&&monthZeroIndexed<=8?"Kharif":monthZeroIndexed===9||monthZeroIndexed===10||monthZeroIndexed===11||monthZeroIndexed===0||monthZeroIndexed===1?"Rabi":"Zaid";
}
export function getSeasonalCropRecommendations(p:{targetSeason?:Season;monthZeroIndexed?:number;soilKitReading:SoilKitReading|null;weatherSnapshot:WeatherSnapshot|null}) {
 const season=p.targetSeason??detectMaharashtraSeason(p.monthZeroIndexed??new Date().getMonth()), days=p.weatherSnapshot?.daily??[], meanMax=days.filter(d=>d.temperatureMax!==null).reduce((s,d)=>s+(d.temperatureMax??0),0)/(days.filter(d=>d.temperatureMax!==null).length||1),rain=days.reduce((s,d)=>s+(d.precipitation??0),0),dry=days.length>0&&meanMax>=35&&rain<5;
 return (Object.keys(MaharashtraCropMatrix) as CropId[]).map(id=>{const c=MaharashtraCropMatrix[id];let score=50,notes:string[]=[],risk=false,amend=false;
 if(c.supportedSeasons.includes(season)){score+=25;notes.push(`Fits the ${season} season.`)}else{score-=25;risk=true;notes.push(`Outside its usual ${season} window.`)}
 if(p.soilKitReading){const soil=p.soilKitReading;if(soil.ph<c.optimalPhRange[0]||soil.ph>c.optimalPhRange[1]){score-=12;amend=true;notes.push("Soil pH may need attention.")};if(soil.nitrogenLevel==="low"){if(c.npkDemand.nitrogenFixing){score+=15;notes.push("Nitrogen-fixing crop suits low soil nitrogen.")}else if(c.npkDemand.nitrogen==="low"){score+=10}else if(c.npkDemand.nitrogen==="high"){amend=true;notes.push("Plan FYM and split nitrogen doses.")}};if(soil.phosphorusLevel==="low"&&c.npkDemand.phosphorus==="high"){amend=true;notes.push("Plan basal SSP or DAP near roots.")}}
 if(dry){if(c.droughtTolerance==="high")score+=15;if(c.droughtTolerance==="low"){score-=15;risk=true;notes.push("Hot, dry forecast raises water demand.")}}
 score=Math.max(0,Math.min(100,score));const tier=risk?"high_risk":amend?"good_with_amendment":"best_match";
 const badge=tier==="best_match"?["Best fit for your plan","तुमच्या नियोजनासाठी योग्य"]:tier==="good_with_amendment"?["Good fit with soil care","मातीची काळजी घेतल्यास योग्य"]:["Review season and water needs","हंगाम व पाण्याची गरज तपासा"];
 return {cropId:id,score,tier,badgeLabel:{en:badge[0],mr:badge[1]},whyItFits:{en:notes.join(" ")||c.plainSummary.en,mr:`${c.marathiName}: ${c.plainSummary.mr}`},careNote:{en:notes.join(" "),mr:notes.length?"लागवडीपूर्वी माती व पाण्याची गरज तपासा.":c.plainSummary.mr}};
 }).sort((a,b)=>b.score-a.score||a.cropId.localeCompare(b.cropId));
}
