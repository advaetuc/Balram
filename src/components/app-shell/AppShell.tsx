"use client";

import { RadioChoices } from "@/components/ui/RadioChoices";

import { useCallback, useEffect, useRef, useState } from "react";
import { useBalramStore } from "@/store/useBalramStore";
import { t, stationLabel } from "@/config/i18n";
import { deriveJourney, type JourneyStationId } from "@/lib/domain/journey";
import { JourneyShell } from "@/components/journey/JourneyShell";
import { DailyHome } from "@/components/home/DailyHome";
import { WeatherStation } from "@/components/journey/WeatherStation";
import { useCssVar } from "@/lib/ui/useCssVar";
import { formatNumber } from "@/lib/ui/format";
import { ToastHost, type Toast } from "@/components/ui/ToastHost";
import { NameFarmView } from "@/components/profiles/NameFarmView";
import { MyFarmsView } from "@/components/profiles/MyFarmsView";
import type { DeletedProfileSnapshot } from "@/lib/domain/profileOperations";

type View = "landing" | "name-farm" | "farms" | "journey" | "daily";
type FarmToast = { id: number } & (
  | { kind: "removed"; snapshot: DeletedProfileSnapshot }
  | { kind: "restored"; name: string }
  | { kind: "undoFailed" }
);
function nextStation(stations:ReturnType<typeof deriveJourney>):JourneyStationId {
  return stations.find(station=>station.status==="current"||station.status==="needs_update"||station.status==="ready")?.id??"land";
}

export function AppShell(){
  const state=useBalramStore(s=>s),text=t(state.locale);
  const [view,setView]=useState<View>("landing");
  const [farmViewVersion, setFarmViewVersion] = useState(0);
  const [samplePending,setSamplePending]=useState(false);
  const [farmToast, setFarmToast] = useState<FarmToast | null>(null);
  const toastId = useRef(0);
  const content = useRef<HTMLDivElement>(null);
  const hasContent = useRef(false);
  const farmView = view === "journey" || view === "daily";
  // Explicit farm navigation resets the tabs. An import can activate the first farm in place.
  const viewKey = farmView ? `${view}:${state.sampleDataActive ? "sample" : farmViewVersion}` : view;
  const dismissToast = useCallback((id: Toast["id"]) => {
    setFarmToast((current) => current?.id === id ? null : current);
  }, []);
  const openFarm = useCallback((setupComplete: boolean) => {
    setFarmViewVersion((version) => version + 1);
    setView(setupComplete ? "daily" : "journey");
  }, []);
  const persistenceRequested=useRef(false);
  const progressRef=useRef<HTMLDivElement>(null);
  const nowIso=state.now===null?null:new Date(state.now).toISOString();
  const journey=deriveJourney(state,nowIso);
  const completedSteps = journey.filter(({ status }) => status === "done" || status === "skipped").length;
  useCssVar(progressRef,"--p",journey.length===0?0:completedSteps/journey.length);
  useEffect(() => {
    if (!state.hydrated) return;
    document.documentElement.lang = state.locale;
    document.title = state.locale === "mr" ? "बलराम | शेत नियोजन" : "Balram | Farm planning";
  }, [state.hydrated, state.locale]);
  useEffect(() => {
    if (!state.hydrated) return;
    if (hasContent.current) {
      const heading = content.current?.querySelector("h1");
      heading?.setAttribute("tabindex", "-1");
      heading?.focus();
    }
    hasContent.current = true;
  }, [state.hydrated, viewKey]);
  const openManager = useCallback(async (next: "name-farm" | "farms") => {
    await state.setSampleData(false);
    setView(next);
  }, [state.setSampleData]);
  useEffect(() => {
    if (!state.hydrated) return;
    const returnToLanding = () => setView("landing");
    const showFarms = () => { void openManager("farms"); };
    const newFarm = () => { void openManager("name-farm"); };
    const showFarm = (event: Event) => {
      if (event instanceof CustomEvent && typeof event.detail === "boolean") openFarm(event.detail);
    };
    window.addEventListener("balram:show-landing", returnToLanding);
    window.addEventListener("balram:show-farms", showFarms);
    window.addEventListener("balram:new-farm", newFarm);
    window.addEventListener("balram:open-farm", showFarm);
    return () => {
      window.removeEventListener("balram:show-landing", returnToLanding);
      window.removeEventListener("balram:show-farms", showFarms);
      window.removeEventListener("balram:new-farm", newFarm);
      window.removeEventListener("balram:open-farm", showFarm);
    };
  }, [state.hydrated, openFarm, openManager]);
  useEffect(()=>{
    if(!state.hydrated||persistenceRequested.current)return;
    persistenceRequested.current=true;
    try { void navigator.storage?.persist?.().catch(()=>false); } catch { /* Best-effort browser storage protection. */ }
  },[state.hydrated]);
  if(!state.hydrated)return <div className="space-y-5" aria-busy="true" role="status"><div className="h-8 w-56 rounded bg-forest/10"/><div className="h-48 rounded-2xl bg-white p-5 shadow-sm"><span className="sr-only">{text.loading}</span></div><div className="h-24 rounded-2xl bg-white p-5 shadow-sm"/></div>;
  const launchJourney = () => {
    if (state.sampleDataActive) setView("journey");
    else setView(state.profiles.length ? "journey" : "name-farm");
  };
  const onDeleted = (snapshot: DeletedProfileSnapshot) => {
    if (state.profiles.length === 1) setView("name-farm");
    setFarmToast({ id: ++toastId.current, kind: "removed", snapshot });
  };
  const toast: Toast | null = farmToast === null ? null : farmToast.kind === "removed" ? {
    id: farmToast.id,
    variant: "undo",
    message: text.profiles.removed.replace("{0}", () => farmToast.snapshot.meta.name),
    actionLabel: text.profiles.undo,
    onAction: () => {
      try {
        state.restoreFarmProfile(farmToast.snapshot);
        if (farmToast.snapshot.wasActive) setFarmViewVersion((version) => version + 1);
        setView((current) => current === "name-farm" ? "farms" : current);
        setFarmToast({ id: ++toastId.current, kind: "restored", name: farmToast.snapshot.meta.name });
      } catch {
        setFarmToast({ id: ++toastId.current, kind: "undoFailed" });
      }
    },
  } : {
    id: farmToast.id,
    variant: "info",
    message: farmToast.kind === "restored" ? text.profiles.restored.replace("{0}", () => farmToast.name) : text.profiles.undoFailed,
  };
  const openSample = async () => {
    setSamplePending(true);
    try {
      await state.setSampleData(true);
      state.setLocale(state.locale);
      setView("daily");
    } finally {
      setSamplePending(false);
    }
  };
  return <>
    <WeatherStation visible={false}/>
    <div ref={content} key={viewKey} className="view-enter">
    {view==="landing"&&<div id="balram-home" className="mx-auto max-w-3xl space-y-6">
      <section className="rounded-3xl bg-forest p-6 text-white sm:p-10"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-bold uppercase tracking-widest">Balram · {state.locale==="mr"?"महाराष्ट्र":"Maharashtra"}</p><h1 className="mt-3 text-3xl leading-heading font-bold sm:text-4xl">{state.locale==="mr"?"तुमचे शेत. तुमचा वाढीचा मार्ग.":"Your farm. A clearer growing path."}</h1><p className="mt-3 max-w-2xl leading-7">{state.locale==="mr"?"जमीन, माती, पिके आणि पाणी यांचे स्थानिक नियोजन—तुमच्या ब्राउझरमध्ये सुरक्षित.":"Plan land, soil, crops and water locally, with your information kept in this browser."}</p></div><RadioChoices label={text.languageSelector} value={state.locale} onChange={state.setLocale}
        className="light-focus flex flex-wrap gap-2 rounded-xl bg-white/10 p-2"
        options={[{ value: "en", label: state.locale === "mr" ? "इंग्रजी" : "English" }, { value: "mr", label: "मराठी" }]} /></div></section>
      <section className="bento-card"><p className="text-sm leading-body font-bold uppercase tracking-widest text-forest">{text.myFarm}</p><h2 className="mt-1 text-2xl leading-heading font-bold [overflow-wrap:anywhere]">{state.farmProfile?.name??text.myFarm}</h2>
        <div className="mt-3 flex items-center gap-3">
          <div role="progressbar" aria-label={text.stepsComplete} aria-valuemin={0} aria-valuemax={journey.length}
            aria-valuenow={completedSteps} className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-muted">
            <div ref={progressRef} aria-hidden="true" className="fill-x h-full w-full rounded-full bg-forest" />
          </div>
          <span className="shrink-0 text-sm text-muted-foreground">{completedSteps} / {journey.length}</span>
        </div>
        {state.setupCompletedAt?<><p className="mt-2 text-sm">{state.locale==="mr"?"तुमचे शेत नियोजन तयार आहे.":"Your farm setup is complete."}</p><div className="mt-4 flex flex-wrap gap-3"><button type="button" className="button-primary min-h-14" onClick={()=>setView("daily")}>{text.openDailyHome}</button><button type="button" className="button-secondary" onClick={launchJourney}>{text.editSetup}</button></div></>
          :<><p className="mt-2 text-sm">{state.locale==="mr"?"जमीन, हवामान, माती, पिके आणि पुढील कामांचे सहा सोपे टप्पे.":"Six guided steps for land, weather, soil, crops and your next actions."}</p><div className="mt-4 flex flex-wrap items-center gap-3"><button type="button" className="button-primary min-h-14" onClick={launchJourney}>{state.fieldGeometry||state.cropAllocations.length?`${text.continueSetup}: ${text.step} ${journey.findIndex(item=>item.id===nextStation(journey))+1}, ${stationLabel(state.locale,nextStation(journey))}`:text.startSetup}</button></div></>}
        {state.profiles.length > 0 && <button type="button" className="button-secondary press mt-3 min-h-12"
          onClick={() => { void openManager("farms"); }}>
          {text.profiles.landingLink.replace("{0}", formatNumber(state.profiles.length, 0, state.locale))}
        </button>}
      </section>
      <section className="bento-card border-l-4 border-l-sky"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm leading-body font-bold uppercase tracking-widest text-forest">{text.provenance.sample}</p><h2 className="mt-1 text-xl font-bold">{text.sampleFarm}</h2><p className="mt-2 text-sm">{state.locale==="mr"?"नमुना शेतातील माहिती फक्त उदाहरणासाठी आहे. तुमचे जतन केलेले नियोजन बदलणार नाही.":"Explore an illustrative Pune farm without changing your saved farm."}</p></div><button type="button" className="button-secondary" disabled={state.sampleDataActive||samplePending} onClick={() => { void openSample(); }}>{samplePending?text.weatherLoading:state.sampleDataActive?text.openDailyHome:text.exploreSample}</button></div></section>
      {state.hydrationError&&<p role="alert" className="notice">{state.storageStatus.message??(state.locale==="mr"?"जतन केलेली माहिती उघडता आली नाही.":"Saved farm could not be opened.")}</p>}
    </div>}
    {view === "name-farm" && <NameFarmView onBack={() => setView("farms")} onCreated={openFarm} />}
    {view === "farms" && <MyFarmsView onNew={() => setView("name-farm")} onOpen={openFarm} onDeleted={onDeleted} />}
    {view==="journey"&&<JourneyShell onFinish={()=>setView("daily")} onHome={()=>setView("landing")}/>}
    {view==="daily"&&<DailyHome onSetup={launchJourney}/>}
    </div>
    <ToastHost toast={toast} locale={state.locale} onDismiss={dismissToast} />
  </>;
}
