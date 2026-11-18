import test from "node:test";
import assert from "node:assert/strict";
import { createEmptyFixture, createSampleFixture } from "../src/mocks/fixtures";
import { PERSISTENCE_VERSION, migratePersistedFarm } from "../src/store/useBalramStore";
import { MaharashtraCropMatrix } from "../src/config/cropMatrix";
import { getSeasonalCropRecommendations } from "../src/lib/domain/cropRecommendations";
import { generateFieldVoiceAdvisories } from "../src/lib/domain/fieldVoice";
import { deriveJourney } from "../src/lib/domain/journey";
import { calculatePhaseWaterBreakdown } from "../src/lib/domain/irrigation";
import { generateRoadmap } from "../src/lib/domain/roadmap";
import { classifyNitrogenKgPerHa, classifyPhosphorusKgPerHa, interpretSoilKitReading } from "../src/lib/domain/soilKit";
import type { CropAllocation, PersistedFarm } from "../src/types/domain";

const allocation=(plotId:string,cropId:string,stage:CropAllocation["lifecycleStage"],plantingDate:string|null=null):CropAllocation=>({
 plotId,plotName:plotId,areaGunthas:10,lifecycleStage:stage,cropId,percentage:12.5,season:"rabi",
 growthStage:stage==="planned"?"initial":stage==="vegetative"?"development":stage==="flowering_fruiting"?"mid-season":"late-season",plantingDate,
});
const validFarm=():PersistedFarm=>createSampleFixture();

test("schema v5 migration accepts and normalizes v0 through v4 persisted blobs",()=>{
 assert.equal(PERSISTENCE_VERSION,5);
 const fixture=createEmptyFixture();
 const legacyCrop={cropId:"onion",percentage:100,season:"rabi",growthStage:"mid-season",plantingDate:null};
 for(const version of [0,1,2,3,4]){
  const old={...fixture,locale:undefined,landUnit:undefined,soilKitReading:null,soilSkipped:undefined,setupCompletedAt:undefined,checkIns:undefined,cropAllocations:[legacyCrop]};
  const result=migratePersistedFarm(old,version);
  assert.equal(result.soilSkipped,false);assert.equal(result.setupCompletedAt,null);assert.deepEqual(result.checkIns,[]);
  assert.equal(result.landUnit,"acres");
  assert.equal(result.cropAllocations[0].plotId,"plot-1");assert.equal(result.cropAllocations[0].lifecycleStage,"flowering_fruiting");
 }
 const soil=migratePersistedFarm({...fixture,soilKitReading:{kitType:"soil_health_card",ph:7,nitrogenLevel:"medium",phosphorusLevel:"medium",potassiumLevel:"untested",organicCarbon:"untested",salinity:"untested",testedAt:"2026-11-01"}},3);
 assert.equal(soil.soilKitReading?.nitrogenKgPerHa,null);assert.equal(soil.soilKitReading?.phosphorusKgPerHa,null);
});

test("Soil Health Card classifiers respect published threshold boundaries",()=>{
 assert.equal(classifyNitrogenKgPerHa(279),"low");assert.equal(classifyNitrogenKgPerHa(280),"medium");
 assert.equal(classifyNitrogenKgPerHa(560),"medium");assert.equal(classifyNitrogenKgPerHa(561),"high");
 assert.equal(classifyPhosphorusKgPerHa(9.9),"low");assert.equal(classifyPhosphorusKgPerHa(10),"medium");
 assert.equal(classifyPhosphorusKgPerHa(25),"medium");assert.equal(classifyPhosphorusKgPerHa(25.1),"high");
 assert.throws(()=>classifyNitrogenKgPerHa(0));assert.throws(()=>classifyPhosphorusKgPerHa(Number.NaN));
});

test("crop recommendations award active sowing-window fit over broad-season fit",()=>{
 const recommend=(monthZeroIndexed:number)=>getSeasonalCropRecommendations({targetSeason:"Rabi",monthZeroIndexed,soilKitReading:null,weatherSnapshot:null}).find((item)=>item.cropId==="onion")!;
 const before=recommend(8),inside=recommend(9);
 assert.equal(MaharashtraCropMatrix.onion.sowingWindows.Rabi?.[0],9);
 assert.equal(inside.score-before.score,15);
 assert.match(inside.whyItFits.en,/sowing window/);assert.match(inside.whyItFits.mr,/पेरणीच्या कालावधीत/);
});

test("Field Voice reasons state bilingual input triggers",()=>{
 const advisory=generateFieldVoiceAdvisories({allocations:[allocation("onion-plot","onion","planned")],soilKitReading:{kitType:"balram_inhouse",ph:8.4,nitrogenLevel:"medium",phosphorusLevel:"medium",potassiumLevel:"untested",organicCarbon:"untested",salinity:"normal",testedAt:"2026-11-01",nitrogenKgPerHa:null,phosphorusKgPerHa:null},weatherSnapshot:null})[0];
 assert.equal(advisory.ruleId,"alkaline_lockup_warning");
 assert.match(advisory.reason.en,/8\.4/);assert.match(advisory.reason.en,/Onion/);
 assert.match(advisory.reason.mr,/8\.4/);assert.match(advisory.reason.mr,/कांदा/);
});

test("all Field Voice rules and fallback provide distinct bilingual reasons",()=>{
 const forecast=createSampleFixture().weatherSnapshot!;
 const makeSoil=(overrides:Record<string,unknown>={})=>({kitType:"balram_inhouse" as const,ph:7,nitrogenLevel:"medium" as const,phosphorusLevel:"medium" as const,potassiumLevel:"untested" as const,organicCarbon:"untested" as const,salinity:"normal" as const,testedAt:"2026-10-01",nitrogenKgPerHa:null,phosphorusKgPerHa:null,...overrides});
 const makeWeather=(overrides:Record<string,number|null>={})=>({...forecast,daily:forecast.daily.map((day,index)=>index===0?{...day,...overrides}: {...day,precipitation:0})});
 const cases=[
  generateFieldVoiceAdvisories({allocations:[allocation("heat","bajra","planned")],soilKitReading:null,weatherSnapshot:makeWeather({temperatureMax:36,precipitation:0})})[0],
  generateFieldVoiceAdvisories({allocations:[allocation("nitrogen","bajra","vegetative")],soilKitReading:makeSoil({nitrogenLevel:"low"}),weatherSnapshot:null})[0],
  generateFieldVoiceAdvisories({allocations:[allocation("phosphorus","bajra","planned")],soilKitReading:makeSoil({phosphorusLevel:"low"}),weatherSnapshot:null})[0],
  generateFieldVoiceAdvisories({allocations:[allocation("alkaline","onion","planned")],soilKitReading:makeSoil({ph:8.4}),weatherSnapshot:null})[0],
  generateFieldVoiceAdvisories({allocations:[allocation("flower","onion","flowering_fruiting")],soilKitReading:null,weatherSnapshot:makeWeather({referenceEvapotranspiration:5})})[0],
  generateFieldVoiceAdvisories({allocations:[allocation("cold","onion","planned")],soilKitReading:null,weatherSnapshot:makeWeather({temperatureMin:5})})[0],
  generateFieldVoiceAdvisories({allocations:[allocation("harvest","bajra","harvesting")],soilKitReading:null,weatherSnapshot:makeWeather({precipitation:6})})[0],
  generateFieldVoiceAdvisories({allocations:[],soilKitReading:null,weatherSnapshot:null})[0],
 ];
 assert.equal(cases.length,8);
 for(const advisory of cases){assert.ok(advisory.reason.en.length>0);assert.ok(advisory.reason.mr.length>0);assert.notEqual(advisory.reason.en,advisory.reason.mr)}
});

test("deriveJourney covers station locking, progression, completion and SSR time",()=>{
 const empty=createEmptyFixture();
 const emptyJourney=deriveJourney(empty,null);
 assert.deepEqual(emptyJourney.map((station)=>station.status),["current","locked","locked","locked","locked","locked"]);

 const farm=validFarm();
 const fresh=deriveJourney(farm,"2026-10-01T06:15:00+05:30");
 assert.deepEqual(fresh.map((station)=>station.status),["done","done","done","done","ready","done"]);
 assert.equal(deriveJourney(farm,null)[1].status,"done");
 assert.equal(deriveJourney({...farm,weatherSnapshot:null},"2026-10-01T06:15:00+05:30")[1].status,"needs_update");
 assert.equal(deriveJourney({...farm,soilKitReading:null,soilSkipped:true},"2026-10-01T06:15:00+05:30")[2].status,"skipped");
 assert.equal(deriveJourney({...farm,setupCompletedAt:null},"2026-10-01T06:15:00+05:30")[5].status,"ready");
 assert.equal(deriveJourney({...farm,cropAllocations:[]},"2026-10-01T06:15:00+05:30")[4].status,"locked");
 assert.equal(deriveJourney({...farm,fieldGeometry:{...farm.fieldGeometry!,areaSquareMetres:10},cropAllocations:farm.cropAllocations},"2026-10-01T06:15:00+05:30")[3].status,"current");
 assert.equal(deriveJourney({...farm,soilKitReading:null,soilSkipped:false,cropAllocations:[]},"2026-10-01T06:15:00+05:30")[3].status,"ready");
 assert.equal(deriveJourney({...farm,weatherSnapshot:{...farm.weatherSnapshot!,expiresAt:"2026-10-01T06:00:00+05:30"}},"2026-10-01T06:15:00+05:30")[1].status,"needs_update");
 assert.equal(deriveJourney({...farm,weatherSnapshot:{...farm.weatherSnapshot!,expiresAt:"2026-10-01T06:00:00+05:30"}},"2026-10-01T06:15:00+05:30")[5].status,"needs_update");
});

test("roadmap assigns buckets and preserves provenance per source",()=>{
 const soil=interpretSoilKitReading({kitType:"soil_health_card",ph:8.4,nitrogenLevel:"low",phosphorusLevel:"medium",potassiumLevel:"untested",organicCarbon:"untested",salinity:"high",testedAt:"2026-11-01",nitrogenKgPerHa:200,phosphorusKgPerHa:8});
 const allocations=[allocation("soon","onion","planned","2026-11-18"),allocation("later","bajra","planned","2026-12-20"),allocation("harvest","rabi_jowar","harvesting")];
 const water=calculatePhaseWaterBreakdown({cropId:"onion",areaGunthas:10,baseEt0MmPerDay:4,effectiveRainfallMmPerDay:0,deliveryMethod:"drip"});
 const items=generateRoadmap({allocations,soilInterpretation:soil,waterBreakdownByPlot:{soon:water},todayIso:"2026-11-16"});
 assert.ok(items.some(item=>item.bucket==="this_week"&&item.kind==="soil_amendment"&&item.provenance==="measured_by_kit"));
 assert.ok(items.some(item=>item.bucket==="this_week"&&item.kind==="sowing"&&item.provenance==="you_entered"));
 assert.ok(items.some(item=>item.bucket==="later"&&item.kind==="sowing"&&item.provenance==="you_entered"));
 assert.ok(items.some(item=>item.bucket==="next_two_weeks"&&item.kind==="fertilizer"&&item.provenance==="measured_by_kit"));
 assert.ok(items.some(item=>item.kind==="irrigation"&&item.bucket==="this_week"&&item.provenance==="estimated"));
 assert.ok(items.some(item=>item.kind==="harvest"&&item.provenance==="you_entered"));
 for(const item of items){assert.ok(item.title.en&&item.title.mr&&item.detail.en&&item.detail.mr)}
});
