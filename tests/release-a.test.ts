import test from "node:test";
import assert from "node:assert/strict";
import { acresAndGunthasToGunthas, calculateFieldGeometry, closeRing, leafletToGeoJSON, SQUARE_METRES_PER_ACRE } from "../src/lib/domain/geometry";
import { updatePlotGunthas, upsertPlotAllocation } from "../src/lib/domain/allocation";
import { interpretSoilKitReading } from "../src/lib/domain/soilKit";
import { getSeasonalCropRecommendations } from "../src/lib/domain/cropRecommendations";
import { generateFieldVoiceAdvisories } from "../src/lib/domain/fieldVoice";

const soil=(overrides:Record<string,unknown>={})=>({kitType:"commercial_rapid",ph:7,nitrogenLevel:"medium",phosphorusLevel:"medium",potassiumLevel:"medium",organicCarbon:"medium",salinity:"normal",testedAt:"2026-10-01",...overrides});
const allocation=(plotId:string,cropId:string,areaGunthas:number,stage:"planned"|"vegetative"|"flowering_fruiting"|"harvesting"="planned")=>({plotId,plotName:plotId,cropId,areaGunthas,percentage:50,season:"rabi" as const,growthStage:stage==="planned"?"initial" as const:stage==="vegetative"?"development" as const:stage==="flowering_fruiting"?"mid-season" as const:"late-season" as const,lifecycleStage:stage,plantingDate:null});
const weather=(day:Record<string,unknown>)=>({fieldId:"f",coordinate:[73.8,18.5] as [number,number],source:"test",provenance:"modelled" as const,fetchedAt:"2026-10-01T00:00:00Z",modelRunAt:null,validFrom:"2026-10-01T00:00:00Z",validTo:"2026-10-04T00:00:00Z",expiresAt:"2026-10-01T01:00:00Z",timezone:"Asia/Kolkata" as const,units:{temperature:"°C" as const,precipitation:"mm" as const,referenceEvapotranspiration:"mm/day" as const,soilMoisture:"m³/m³" as const},daily:[{date:"2026-10-01",temperatureMin:20,temperatureMax:30,precipitation:0,referenceEvapotranspiration:4.5,soilMoisture:null},...Array.from({length:2},(_,i)=>({date:`2026-10-0${i+2}`,temperatureMin:20,temperatureMax:30,precipitation:0,referenceEvapotranspiration:4,soilMoisture:null})),...[]].map((d,i)=>i===0?{...d,...day}:d)});

test("geometry keeps canonical acres, axis order and one closed ring",()=>{
 assert.equal(acresAndGunthasToGunthas(1,0),40);
 assert.equal(SQUARE_METRES_PER_ACRE/40,101.17141056);
 assert.deepEqual(leafletToGeoJSON([[18.5,73.8],[18.6,73.9],[18.5,73.8]]),[[73.8,18.5],[73.9,18.6],[73.8,18.5]]);
 const ring=closeRing([[73.8,18.5],[73.9,18.5],[73.9,18.6],[73.8,18.5],[73.8,18.5]]);
 assert.deepEqual(ring,[[73.8,18.5],[73.9,18.5],[73.9,18.6],[73.8,18.5]]);
 const field=calculateFieldGeometry("test",[[18.5,73.8],[18.5,73.9],[18.6,73.9],[18.5,73.8],[18.5,73.8]]);
 assert.equal(field.boundary?.coordinates[0].length,4);
});

test("canonical plot updates recompute shares, allow duplicate crops and enforce total area",()=>{
 const plots=[allocation("onion-a","onion",20),allocation("onion-b","onion",20)];
 const updated=updatePlotGunthas(plots,"onion-a",15,40* SQUARE_METRES_PER_ACRE/40);
 assert.deepEqual(updated.map(p=>p.percentage),[37.5,50]);
 assert.throws(()=>updatePlotGunthas(plots,"onion-a",30,40* SQUARE_METRES_PER_ACRE/40),RangeError);
 assert.equal(upsertPlotAllocation([], {plotName:"Onion",cropId:"onion",areaGunthas:10,lifecycleStage:"planned"},null)[0].season,"rabi");
 assert.equal(upsertPlotAllocation([], {plotName:"Cane",cropId:"sugarcane",areaGunthas:10,lifecycleStage:"planned"},null)[0].season,"perennial");
 assert.equal(upsertPlotAllocation([], {plotName:"Fruit",cropId:"pomegranate",areaGunthas:10,lifecycleStage:"planned"},null)[0].season,"perennial");
});

test("soil advice gates gypsum and emits Marathi for each available parameter",()=>{
 const normal=interpretSoilKitReading(soil({ph:8.4,salinity:"normal"}) as never);
 assert.ok(!normal.steps.find(s=>s.id==="ph")?.actionStep.en.toLowerCase().includes("gypsum"));
 for(const salinity of ["high","elevated"])assert.match(interpretSoilKitReading(soil({ph:8.4,salinity}) as never).steps[0].actionStep.mr,/जिप्सम/);
 assert.match(interpretSoilKitReading(soil({ph:5.5}) as never).steps[0].actionStep.en,/lime/);
 const result=interpretSoilKitReading(soil({ph:8.4,salinity:"high",potassiumLevel:"low",organicCarbon:"low"}) as never);
 for(const step of result.steps)for(const field of ["badgeLabel","plainExplanation","actionStep"] as const){assert.ok(step[field].mr.trim().length>0);assert.notEqual(step[field].mr,step[field].en)}
});

test("recommendations are deterministic by default and tolerate Vertisol pH",()=>{
 const params={soilKitReading:soil({ph:8,salinity:"normal"}) as never,weatherSnapshot:null};
 const first=getSeasonalCropRecommendations(params),second=getSeasonalCropRecommendations(params);
 assert.deepEqual(first,second);
 const onion=first.find(r=>r.cropId==="onion");assert.ok(onion);assert.notEqual(onion.tier,"good_with_amendment");
});

test("Field Voice rules and fallback have distinct bilingual headlines and messages",()=>{
 const cases=[
  ["heat_vertisol_cracking",[allocation("heat","bajra",10,"planned")],soil(),weather({temperatureMax:36})],
  ["vegetative_nitrogen_low",[allocation("nitrogen","bajra",10,"vegetative")],soil({nitrogenLevel:"low"}),null],
  ["sowing_phosphorus_low",[allocation("phosphorus","bajra",10,"planned")],soil({phosphorusLevel:"low"}),null],
  ["alkaline_lockup_warning",[allocation("alkaline","onion",10)],soil({ph:8.4}),null],
  ["flowering_peak_water",[allocation("flower","onion",10,"flowering_fruiting")],null,weather({})],
  ["rabi_cold_night_guard",[allocation("cold","onion",10)],null,weather({temperatureMin:5})],
  ["harvest_rain_warning",[allocation("harvest","bajra",10,"harvesting")],null,weather({precipitation:6})],
  ["general_seasonal_guidance",[],null,null],
 ] as const;
 const advisories=cases.map(([,allocations,reading,snapshot])=>generateFieldVoiceAdvisories({allocations,soilKitReading:reading as never,weatherSnapshot:snapshot as never})[0]);
 assert.deepEqual(advisories.map(a=>a.ruleId),cases.map(c=>c[0]));
 for(const field of ["headline","message","actionLabel"] as const){assert.equal(new Set(advisories.map(a=>a[field].mr)).size,advisories.length);for(const a of advisories){assert.ok(a[field].en.trim());assert.ok(a[field].mr.trim());assert.notEqual(a[field].en,a[field].mr)}}
});
