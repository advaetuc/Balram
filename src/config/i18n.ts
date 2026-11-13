import type { Locale, LifecycleStage } from "@/types/domain";
import type { CropId } from "@/config/cropMatrix";

const dictionary = {
  en: {
    tagline:"Your field. Your plan.", overview:"Farm overview", exploreSample:"Explore sample", exitSample:"Exit sample",
    online:"Online", offline:"Offline · saved data only", stale:"Stale data · check dates", saved:"Saved in this browser", saving:"Saving in this browser…", loading:"Loading saved farm…",
    field:"Define your field", location:"Location & acreage", fieldArea:"Field area", acres:"Acres", gunthas:"Gunthas", totalLand:"Total farm land", allocated:"Allocated to plots", fallow:"Unassigned / fallow land",
    plots:"Your farm plots", addPlot:"Add new plot", crop:"Crop", stage:"Lifecycle stage", weather:"Weather & water demand", conditions:"Field conditions",
    soil:"On-site soil test", kit:"Your kit · your field", advisor:"Crop advisor", seasonWeather:"Season, soil & weather", voice:"Balram's Field Voice", voiceEyebrow:"Plain-language field advisor",
    irrigation:"Plan water for your plots", irrigationEyebrow:"Saved forecast and simple estimates", report:"Farm planning report", print:"Print farm report", soilPlan:"Soil Enrichment Plan",
    low:"Low", medium:"Medium", high:"High", drip:"Drip Line", sprinkler:"Sprinkler Set", canal:"Canal / Flood",
    stages:{planned:"Planned (Seed & Soil Prep)",vegetative:"Vegetative (Active Growth)",flowering_fruiting:"Flowering / Fruiting (Peak Need)",harvesting:"Harvesting (Ready for Market)"},
    cropNames:{sugarcane:"Sugarcane",rabi_jowar:"Rabi Jowar",onion:"Onion",bajra:"Bajra",pomegranate:"Pomegranate",groundnut:"Groundnut"},
    stageNames:{planned:"Planned",vegetative:"Vegetative",flowering_fruiting:"Flowering / Fruiting",harvesting:"Harvesting"},
  },
  mr: {
    tagline:"तुमचे शेत. तुमचे नियोजन.", overview:"शेताचा आढावा", exploreSample:"नमुना पहा", exitSample:"नमुना बंद करा",
    online:"ऑनलाइन", offline:"ऑफलाइन · जतन केलेली माहिती", stale:"जुनी माहिती · तारीख तपासा", saved:"या ब्राउझरमध्ये जतन", saving:"या ब्राउझरमध्ये जतन होत आहे…", loading:"जतन केलेले शेत उघडत आहे…",
    field:"तुमचे शेत ठरवा", location:"ठिकाण व क्षेत्रफळ", fieldArea:"शेताचे क्षेत्रफळ", acres:"एकर", gunthas:"गुंठे", totalLand:"एकूण जमीन", allocated:"वाटप केलेली जमीन", fallow:"शिल्लक / पडीक जमीन",
    plots:"तुमचे शेताचे प्लॉट", addPlot:"नवीन प्लॉट जोडा", crop:"पीक", stage:"पीक अवस्था", weather:"हवामान व पाण्याची गरज", conditions:"शेताची स्थिती",
    soil:"शेतातील माती चाचणी", kit:"तुमची किट · तुमचे शेत", advisor:"पीक सल्ला", seasonWeather:"हंगाम, माती व हवामान", voice:"बलरामचा शेत-सल्ला", voiceEyebrow:"सोप्या भाषेतील शेत मार्गदर्शन",
    irrigation:"प्लॉटसाठी पाणी नियोजन", irrigationEyebrow:"जतन केलेला अंदाज व सोपी गणना", report:"शेत नियोजन अहवाल", print:"शेत अहवाल छापा", soilPlan:"माती सुधारणा नियोजन",
    low:"कमी", medium:"मध्यम", high:"जास्त", drip:"ठिबक सिंचन", sprinkler:"तुषार सिंचन", canal:"पाटपाणी / कालवा",
    stages:{planned:"नियोजित (बियाणे व मशागत)",vegetative:"वाढीचा काळ (पाने व खोड वाढ)",flowering_fruiting:"फुलोरा व फळधारणा (पाण्याची मुख्य गरज)",harvesting:"काढणी (कापणीस तयार)"},
    cropNames:{sugarcane:"ऊस",rabi_jowar:"रब्बी ज्वारी",onion:"कांदा",bajra:"बाजरी",pomegranate:"डाळिंब",groundnut:"भुईमूग"},
    stageNames:{planned:"नियोजित",vegetative:"वाढीचा काळ",flowering_fruiting:"फुलोरा / फळधारणा",harvesting:"काढणी"},
  },
} as const;
export function t(locale:Locale){return dictionary[locale]}
export function unitLabel(locale:Locale,unit:"acres"|"gunthas"){return t(locale)[unit]}
export function lifecycleLabel(locale:Locale,stage:LifecycleStage){return t(locale).stages[stage]}
export function cropLabel(locale:Locale,id:CropId){return t(locale).cropNames[id]}
