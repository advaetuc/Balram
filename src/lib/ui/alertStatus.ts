import type { BalramState } from "@/store/useBalramStore";

/** Data quality notes for the collapsible status section; weather ET₀ and flow are resolved separately. */
export function alertStatusMessages(state: BalramState): string[] {
  const mr=state.locale==="mr",messages:string[]=[];
  if(state.sampleDataActive)messages.push(mr?"नमुना माहिती केवळ उदाहरणासाठी आहे.":"Sample mode is active. Values are illustrative.");
  if(state.connection==="offline")messages.push(mr?"ऑफलाइन स्थिती: सेवा शोध थांबले आहेत; जतन केलेली माहिती उपलब्ध आहे.":"Offline. Provider lookups are paused; saved information remains available.");
  if(state.weatherStale)messages.push(mr?"हवामानाचा अंदाज जुना आहे; तारीख तपासा.":"Weather snapshot is stale; review its dates.");
  if(state.weatherStatus.error)messages.push(state.weatherSnapshot
    ?(mr?"ताजा अंदाज मिळाला नाही; जतन केलेला हवामान अंदाज वापरला जात आहे.":`Live weather refresh failed; the saved weather snapshot is still available. ${state.weatherStatus.error}`)
    :(mr?"हवामान सेवा उपलब्ध नाही; जोडणी तपासा.":state.weatherStatus.error));
  if(state.soilStatus.error)messages.push(mr?"मातीची माहिती उपलब्ध नाही; पुन्हा प्रयत्न करा.":state.soilStatus.error);
  if(state.storageStatus.mode==="memory")messages.push(mr?"ब्राउझर संचयन उपलब्ध नसल्याने बदल फक्त या टॅबमध्ये आहेत.":"Edits are held in this tab only because browser storage is unavailable.");
  return messages;
}
