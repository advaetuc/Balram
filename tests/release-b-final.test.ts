import test from "node:test";
import assert from "node:assert/strict";
import { createEmptyFixture, createSampleFixture } from "../src/mocks/fixtures";
import { isCheckInDue } from "../src/lib/domain/checkIns";
import { serializeFarmBackup, parseFarmBackup, BACKUP_FORMAT } from "../src/lib/storage/backup";
import { buildShareSummary } from "../src/lib/ui/shareSummary";
import { createBalramStore } from "../src/store/useBalramStore";
import type { RoadmapItem } from "../src/lib/domain/roadmap";
import { PersistedFarmSchema } from "../src/types/domain";
import { WeatherSnapshotSchema } from "../src/types/domain";
import { createRegionalBaselineWeatherSnapshot } from "../src/lib/domain/irrigation";
import { resolvedWeatherMetrics, selectedWeatherDay } from "../src/lib/ui/format";
import { alertStatusMessages } from "../src/lib/ui/alertStatus";
import type { BalramState } from "../src/store/useBalramStore";
import { isSameProviderOrigin } from "../src/lib/api/origin";

test("check-in due logic is hydration-safe and follows selected cadence", () => {
  assert.equal(isCheckInDue([], null), false);
  assert.equal(isCheckInDue([], "2026-11-16T12:00:00.000Z"), true);
  assert.equal(isCheckInDue([{ id:"a", date:"2026-11-12", plotId:null, stage:null, event:"none", note:"" }], "2026-11-16T12:00:00.000Z"), false);
  assert.equal(isCheckInDue([{ id:"a", date:"2026-11-09", plotId:null, stage:null, event:"none", note:"" }], "2026-11-16T12:00:00.000Z"), true);
  assert.equal(isCheckInDue([{ id:"a", date:"bad-date", plotId:null, stage:null, event:"none", note:"" }], "2026-11-16T12:00:00.000Z"), false);
});

test("saving a check-in updates its plot stage and matching FAO growth stage", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable:true, writable:true, value:{ indexedDB:undefined } });
  try {
    const api=createBalramStore(); await api.initialize();
    const base=createSampleFixture();
    const farm=PersistedFarmSchema.parse({...base,sampleDataActive:false,weatherSnapshot:null,soilSnapshot:null});
    api.store.getState().replacePersistedState(farm);
    api.store.getState().addCheckIn({id:"checkin-test",date:"2026-11-16",plotId:"plot-well",stage:"vegetative",event:"heavy_rain",note:""});
    const state=api.store.getState();
    assert.equal(state.checkIns[0]?.id,"checkin-test");
    assert.equal(state.cropAllocations.find(plot=>plot.plotId==="plot-well")?.lifecycleStage,"vegetative");
    assert.equal(state.cropAllocations.find(plot=>plot.plotId==="plot-well")?.growthStage,"development");
  } finally { if(descriptor)Object.defineProperty(globalThis,"window",descriptor);else Reflect.deleteProperty(globalThis,"window"); }
});

test("backup round-trips a real farm and rejects invalid or future envelopes", () => {
  const base=createSampleFixture();
  const farm=PersistedFarmSchema.parse({...base,sampleDataActive:false,weatherSnapshot:null,soilSnapshot:null});
  const json=serializeFarmBackup(farm,"2026-11-16T12:00:00.000Z");
  assert.deepEqual(parseFarmBackup(json),farm);
  assert.throws(()=>parseFarmBackup("{"),/valid JSON/);
  assert.throws(()=>parseFarmBackup(JSON.stringify({format:"wrong",version:4,exportedAt:"2026-11-16T12:00:00.000Z",farm})),/not a Balram/);
  assert.throws(()=>parseFarmBackup(JSON.stringify({format:BACKUP_FORMAT,version:999,exportedAt:"2026-11-16T12:00:00.000Z",farm})),/newer Balram/);
  assert.throws(()=>serializeFarmBackup(base,"2026-11-16T12:00:00.000Z"),/Sample Farm/);
});

test("share summary includes farm planning but no map coordinates", () => {
  const fixture=createSampleFixture();
  const farm={...fixture,sampleDataActive:false};
  const roadmap:RoadmapItem[]=[1,2,3,4].map((n)=>({id:`action-${n}`,bucket:"this_week",kind:"sowing",priority:n,plotId:null,title:{en:`Action ${n}`,mr:`काम ${n}`},detail:{en:`Detail ${n}`,mr:`तपशील ${n}`},provenance:"you_entered"}));
  const summary=buildShareSummary(farm,roadmap,"en");
  assert.match(summary,/Well Plot/); assert.match(summary,/Bajra/); assert.match(summary,/Action 1/); assert.match(summary,/Action 3/); assert.doesNotMatch(summary,/Action 4/);
  assert.doesNotMatch(summary,/18\.52|73\.85|longitude|latitude|coordinates/i);
});

test("share summary formats areas in the selected unit and localizes preset plot names", () => {
  const fixture = createSampleFixture();
  const roadmap: RoadmapItem[] = [];
  const acres = buildShareSummary({ ...fixture, landUnit: "acres", sampleDataActive: false }, roadmap, "en");
  const gunthas = buildShareSummary({ ...fixture, landUnit: "gunthas", sampleDataActive: false }, roadmap, "en");
  const marathi = buildShareSummary({ ...fixture, landUnit: "gunthas", sampleDataActive: false }, roadmap, "mr");
  assert.match(acres, /Sample farm/);
  assert.match(acres, /2 Acres/);
  assert.match(gunthas, /80 Gunthas/);
  assert.match(marathi, /विहिरीचा प्लॉट/);
  assert.match(marathi, /गुंठे/);
});

test("empty fixture check-ins and backup parsing stay compatible",()=>{
  assert.deepEqual(createEmptyFixture().checkIns,[]);
  assert.deepEqual(parseFarmBackup(serializeFarmBackup(createEmptyFixture(),"2026-11-16T12:00:00.000Z")),createEmptyFixture());
});

test("regional baseline creates seven validated days with ET₀ values",()=>{
  const snapshot=createRegionalBaselineWeatherSnapshot({fieldId:"field-test",coordinate:[73.85,18.52],nowMs:Date.parse("2026-07-01T04:30:00.000Z")});
  const validated=WeatherSnapshotSchema.parse(snapshot);
  assert.equal(validated.daily.length,7);
  assert.ok(validated.daily.every(day=>day.referenceEvapotranspiration!==null&&Number.isFinite(day.referenceEvapotranspiration)));
  assert.equal(validated.source,"Balram Maharashtra seasonal baseline (Hargreaves ET₀)");
});

test("resolved weather metrics always provide finite positive ET₀ and alerts avoid obsolete blockers",()=>{
  const state={...createEmptyFixture(),now:null,hydrated:true,sampleOverlayActive:false,hydrationError:null,storageStatus:{mode:"memory",message:null},connection:"unknown",weatherStatus:{provider:"weather",state:"idle",provenance:"unavailable",requestId:null,updatedAt:null,error:null},weatherCached:false,weatherStale:false,soilStatus:{provider:"soil",state:"idle",provenance:"unavailable",requestId:null,updatedAt:null,error:null}} as unknown as BalramState;
  const metrics=resolvedWeatherMetrics(state);
  assert.ok(Number.isFinite(metrics.et0MmPerDay)&&metrics.et0MmPerDay>0);
  assert.equal(alertStatusMessages(state).some(message=>message.includes("No reference ET₀")||message.includes("Measured block flow is not confirmed")),false);
  const saved={...state,weatherSnapshot:createRegionalBaselineWeatherSnapshot({fieldId:"field-test",coordinate:[73.85,18.52],nowMs:null}),weatherStatus:{...state.weatherStatus,error:"upstream unavailable"}} as BalramState;
  assert.equal(resolvedWeatherMetrics(saved).et0Provenance,"maharashtra-baseline");
  assert.equal(selectedWeatherDay({...saved,now:Date.parse("2030-01-01T00:00:00.000Z")})?.date,saved.weatherSnapshot?.daily[0]?.date);
  assert.match(alertStatusMessages(saved).join(" "),/saved weather snapshot is still available/);
  const missingEt0={...saved,weatherSnapshot:{...saved.weatherSnapshot!,daily:saved.weatherSnapshot!.daily.map((day,index)=>index===0?{...day,referenceEvapotranspiration:null}:day)}} as BalramState;
  assert.equal(resolvedWeatherMetrics(missingEt0).et0Provenance,"hargreaves-fallback");
});

test("sample farm irrigation defaults are confirmed and all forecast days have ET₀",()=>{
  const sample=createSampleFixture();
  assert.deepEqual(sample.irrigationSetup,{method:"drip",systemFlowLitresPerHour:4800,applicationEfficiency:0.9,flowConfirmedByFarmer:true});
  assert.ok(sample.weatherSnapshot?.daily.every(day=>day.referenceEvapotranspiration!==null));
});

test("provider origin validation matches the forwarded deployment host",()=>{
  assert.equal(isSameProviderOrigin("https://balram-preview.vercel.app","balram-preview.vercel.app, internal.local","internal.local","internal.local"),true);
  assert.equal(isSameProviderOrigin("https://attacker.example","balram-preview.vercel.app","internal.local","internal.local"),false);
  assert.equal(isSameProviderOrigin("malformed-origin","balram-preview.vercel.app","internal.local","internal.local"),false);
});
