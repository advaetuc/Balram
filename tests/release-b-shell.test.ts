import test from "node:test";
import assert from "node:assert/strict";
import { createBalramStore } from "../src/store/useBalramStore";
import { createSampleFixture } from "../src/mocks/fixtures";
import { PersistedFarmSchema } from "../src/types/domain";
import { adjacentJourneyStation, deriveJourney } from "../src/lib/domain/journey";
import { createSoilHealthCardReading } from "../src/lib/domain/soilKit";

test("Soil Health Card form mapping stores entered kg/ha and derived classifications",()=>{
 const reading=createSoilHealthCardReading({ph:7.2,nitrogenKgPerHa:280,phosphorusKgPerHa:25,testedAt:"2026-11-16"});
 assert.equal(reading.kitType,"soil_health_card");
 assert.equal(reading.nitrogenLevel,"medium");assert.equal(reading.phosphorusLevel,"medium");
 assert.equal(reading.nitrogenKgPerHa,280);assert.equal(reading.phosphorusKgPerHa,25);
});

test("sample overlay is read-only and restores populated farm data after browsing",async()=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,"window");
 Object.defineProperty(globalThis,"window",{configurable:true,writable:true,value:{indexedDB:undefined}});
 try{
  const api=createBalramStore();
  await api.initialize();
  const fixture=createSampleFixture();
  const real=PersistedFarmSchema.parse({...fixture,sampleDataActive:false,weatherSnapshot:null,soilSnapshot:null,
   farmProfile:{...fixture.farmProfile!,id:"my-farm",name:"My real farm"},fieldGeometry:{...fixture.fieldGeometry!,fieldId:"my-field"},
   setupCompletedAt:"2026-10-02"});
  api.store.getState().replacePersistedState(real);
  await api.flush();
  const before=api.store.getState();
  const saved={fieldGeometry:before.fieldGeometry,cropAllocations:before.cropAllocations,soilKitReading:before.soilKitReading,setupCompletedAt:before.setupCompletedAt};
  await before.setSampleData(true);
  assert.equal(api.store.getState().sampleOverlayActive,true);assert.equal(api.store.getState().sampleDataActive,true);
  assert.throws(()=>api.store.getState().setCropAllocations([]),/read-only/);
  api.store.getState().setLocale("mr");
  await api.flush();
  await api.store.getState().setSampleData(false);
  await api.flush();
  const restored=api.store.getState();
  assert.equal(restored.sampleOverlayActive,false);assert.equal(restored.sampleDataActive,false);
  assert.deepEqual({fieldGeometry:restored.fieldGeometry,cropAllocations:restored.cropAllocations,soilKitReading:restored.soilKitReading,setupCompletedAt:restored.setupCompletedAt},saved);
 }finally{
  if(descriptor)Object.defineProperty(globalThis,"window",descriptor);else Reflect.deleteProperty(globalThis,"window");
 }
});

test("journey shell navigation advances only when the next station is unlocked",()=>{
 const empty=deriveJourney(createSampleFixture(),null);
 assert.equal(adjacentJourneyStation(empty,"land",1),"weather");
 const notStarted=deriveJourney({...createSampleFixture(),fieldGeometry:null},null);
 assert.equal(adjacentJourneyStation(notStarted,"land",1),null);
 assert.equal(adjacentJourneyStation(empty,"weather",-1),"land");
 assert.equal(adjacentJourneyStation(empty,"roadmap",1),null);
});
