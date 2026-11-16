import test from "node:test";
import assert from "node:assert/strict";
import { createEmptyFixture, createSampleFixture } from "../src/mocks/fixtures";
import { isCheckInDue } from "../src/lib/domain/checkIns";
import { serializeFarmBackup, parseFarmBackup, BACKUP_FORMAT } from "../src/lib/storage/backup";
import { buildShareSummary } from "../src/lib/ui/shareSummary";
import { createBalramStore } from "../src/store/useBalramStore";
import type { RoadmapItem } from "../src/lib/domain/roadmap";
import { PersistedFarmSchema } from "../src/types/domain";

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

test("empty fixture check-ins and backup parsing stay compatible",()=>{
  assert.deepEqual(createEmptyFixture().checkIns,[]);
  assert.deepEqual(parseFarmBackup(serializeFarmBackup(createEmptyFixture(),"2026-11-16T12:00:00.000Z")),createEmptyFixture());
});
