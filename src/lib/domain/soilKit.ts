import { SoilKitReadingSchema, type NutrientLevel, type SoilKitReading } from "@/types/domain";
import { z } from "zod";
import { t } from "@/config/i18n";
import { classifyNutrientKgPerHa, SOIL_PRESET_RANGES } from "./soilChemistry";
export type SoilPhCategory="strongly_acidic"|"slightly_acidic"|"optimal_neutral"|"moderately_alkaline"|"strongly_alkaline";
export interface SoilEnrichmentStep {readonly id:string;readonly parameter:"ph"|"nitrogen"|"phosphorus"|"potassium"|"organic_carbon"|"salinity"|"moisture";readonly severity:"good"|"attention"|"critical";readonly badgeLabel:{readonly en:string;readonly mr:string};readonly plainExplanation:{readonly en:string;readonly mr:string};readonly actionStep:{readonly en:string;readonly mr:string}}
export interface SoilKitInterpretation {readonly phCategory:SoilPhCategory;readonly overallHealth:"optimal"|"needs_enrichment"|"critical_amendment";readonly headline:{readonly en:string;readonly mr:string};readonly assayNotes:{readonly en:string;readonly mr:string};readonly steps:readonly SoilEnrichmentStep[]}
// Alkaline KMnO₄ available N thresholds: Subbiah & Asija (1956), as adopted by India's Soil Health Card guidance.
export const ALKALINE_KMNO4_N_LOW_MAX=SOIL_PRESET_RANGES.nitrogen.mediumMin;
// Olsen available P thresholds: Olsen et al. (1954), as adopted by India's Soil Health Card guidance.
export const OLSEN_P_LOW_MAX=SOIL_PRESET_RANGES.phosphorus.mediumMin;
const nonnegativeLabValue=z.number().finite().nonnegative();
export function classifyNitrogenKgPerHa(kgPerHa:number):NutrientLevel {
 return classifyNutrientKgPerHa("nitrogen",nonnegativeLabValue.parse(kgPerHa));
}
export function classifyPhosphorusKgPerHa(kgPerHa:number):NutrientLevel {
 return classifyNutrientKgPerHa("phosphorus",nonnegativeLabValue.parse(kgPerHa));
}
export function createSoilHealthCardReading(input:{ph:number;nitrogenKgPerHa:number;phosphorusKgPerHa:number;testedAt:string}):SoilKitReading {
 return SoilKitReadingSchema.parse({kitType:"soil_health_card",...input,
  nitrogenLevel:classifyNitrogenKgPerHa(input.nitrogenKgPerHa),phosphorusLevel:classifyPhosphorusKgPerHa(input.phosphorusKgPerHa),
  potassiumLevel:"untested",organicCarbon:"untested",salinity:"untested"});
}
const phText:Record<SoilPhCategory,{label:[string,string];explanation:[string,string];action:[string,string];severity:"good"|"attention"|"critical"}>={
 strongly_acidic:{label:["Acidic","आम्लीय"],explanation:["Acidity can restrict roots and phosphorus availability.","आम्लीय मातीमुळे मुळांची वाढ आणि स्फुरदाचे शोषण कमी होऊ शकते."],action:["Before sowing, ask a local soil adviser about agricultural lime and add well-decomposed FYM.","पेरणीपूर्वी कृषी तज्ज्ञांचा सल्ला घेऊन शेतीचा चुना वापरा आणि चांगले कुजलेले शेणखत मिसळा."],severity:"critical"},
 slightly_acidic:{label:["Slightly acidic","किंचित आम्लीय"],explanation:["Mild acidity may limit availability of some nutrients.","किंचित आम्लीय मातीत काही अन्नद्रव्ये पिकांना कमी उपलब्ध होऊ शकतात."],action:["Add compost or FYM and avoid acid-forming fertilizers unless advised.","कंपोस्ट किंवा शेणखत घाला; सल्ल्याशिवाय आम्लता वाढवणारी खते टाळा."],severity:"attention"},
 optimal_neutral:{label:["Good pH","योग्य सामू"],explanation:["This pH generally supports root growth and nutrient availability.","या सामूमुळे मुळांची वाढ आणि अन्नद्रव्यांची उपलब्धता साधारणपणे चांगली राहते."],action:["Maintain organic matter and follow crop-specific soil-test guidance.","सेंद्रिय पदार्थ टिकवा आणि पिकानुसार माती चाचणीचा सल्ला पाळा."],severity:"good"},
 moderately_alkaline:{label:["Moderately alkaline","मध्यम विम्ल"],explanation:["In black Vertisol, alkalinity can slow phosphorus and iron or zinc uptake.","काळ्या वर्टिसोल मातीत विम्लता वाढल्यास स्फुरद, लोह आणि जस्ताचे शोषण मंदावू शकते."],action:["Mix FYM or compost before sowing and place fertilizer near the root zone.","पेरणीपूर्वी शेणखत किंवा कंपोस्ट मिसळा आणि खत मुळांच्या जवळ द्या."],severity:"attention"},
 strongly_alkaline:{label:["Strongly alkaline","जास्त विम्ल"],explanation:["High alkalinity can restrict roots and water entry; gypsum is appropriate only when sodicity or salinity is confirmed.","जास्त विम्लतेमुळे मुळे आणि पाणी मुरण्यास अडथळा येऊ शकतो; क्षारता किंवा सोडिकपणा सिद्ध झाल्यावरच जिप्समचा विचार करा."],action:["Incorporate FYM or compost and green manure, band fertilizer near roots, and test soil EC before choosing an amendment.","शेणखत किंवा कंपोस्ट आणि हिरवळीचे खत मिसळा, खत मुळांजवळ द्या; मातीची EC तपासून मगच सुधारक निवडा."],severity:"critical"},
};
export function interpretSoilKitReading(input:z.input<typeof SoilKitReadingSchema>):SoilKitInterpretation{
 const r=SoilKitReadingSchema.parse(input),ph=r.ph,range=SOIL_PRESET_RANGES.ph;
 const cat:SoilPhCategory=ph<range.slightlyAcidicMin?"strongly_acidic":ph<range.neutralMin?"slightly_acidic":ph<=range.neutralMax?"optimal_neutral":ph<=range.moderatelyAlkalineMax?"moderately_alkaline":"strongly_alkaline";
 const steps:SoilEnrichmentStep[]=[];
 const add=(parameter:SoilEnrichmentStep["parameter"],severity:SoilEnrichmentStep["severity"],label:[string,string],explanation:[string,string],action:[string,string])=>steps.push({id:parameter,parameter,severity,badgeLabel:{en:label[0],mr:label[1]},plainExplanation:{en:explanation[0],mr:explanation[1]},actionStep:{en:action[0],mr:action[1]}});
 const phInfo=phText[cat];let phAction=phInfo.action;
 if(cat==="strongly_alkaline"&&(r.salinity==="elevated"||r.salinity==="high"))phAction=["Elevated salinity/sodicity is reported. Ask a local soil adviser whether gypsum is appropriate, and plan drainage and organic matter.","मातीमध्ये क्षारता किंवा सोडिकपणा वाढलेला आहे. जिप्सम योग्य आहे का हे कृषी तज्ज्ञांकडून तपासा; निचरा आणि सेंद्रिय पदार्थांची व्यवस्था करा."];
 add("ph",phInfo.severity,phInfo.label,phInfo.explanation,phAction);
 const en = t("en").soilInterpretation;
 const mr = t("mr").soilInterpretation;
 if (r.moistureLevel !== "untested") {
  const enMoisture = en.moisture[r.moistureLevel];
  const mrMoisture = mr.moisture[r.moistureLevel];
  add("moisture", r.moistureLevel === "moist" ? "good" : "attention",
   [enMoisture.label, mrMoisture.label],
   [enMoisture.explanation, mrMoisture.explanation],
   [enMoisture.action, mrMoisture.action]);
 }
 const nLabel:Record<string,[string,string]>={low:["Low nitrogen","नत्र कमी"],medium:["Medium nitrogen","नत्र मध्यम"],high:["High nitrogen","नत्र जास्त"]};
 const nEx:Record<string,[string,string]>={low:["The alkaline KMnO₄ test indicates low available nitrogen.","अल्कलाइन KMnO₄ चाचणीत उपलब्ध नत्र कमी असल्याचे दिसते."],medium:["The test indicates a moderate available nitrogen level.","चाचणीत उपलब्ध नत्राची पातळी मध्यम दिसते."],high:["The test indicates high available nitrogen.","चाचणीत उपलब्ध नत्राची पातळी जास्त दिसते."]};
 const nAct:Record<string,[string,string]>={low:["Use split nitrogen doses and consider a legume such as groundnut; follow local crop guidance.","नत्राची मात्रा विभागून द्या; भुईमुगासारख्या कडधान्याचा विचार करा आणि स्थानिक पीक सल्ला पाळा."],medium:["Follow a balanced maintenance dose for the crop.","पिकानुसार संतुलित निगा मात्रा द्या."],high:["Avoid excess basal urea; high nitrogen can cause excessive leafy growth.","पायाभूत युरिया जास्त देऊ नका; नत्रामुळे पानांची अनावश्यक वाढ होऊ शकते."]};
 add("nitrogen",r.nitrogenLevel==="low"?"attention":"good",nLabel[r.nitrogenLevel],nEx[r.nitrogenLevel],nAct[r.nitrogenLevel]);
 const pLabel:Record<string,[string,string]>={low:["Low phosphorus","स्फुरद कमी"],medium:["Medium phosphorus","स्फुरद मध्यम"],high:["High phosphorus","स्फुरद जास्त"]};
 const pEx:Record<string,[string,string]>={low:["Olsen and molybdenum-blue results indicate low available phosphorus, which young roots need.","ओल्सेन व मॉलिब्डेनम-ब्लू चाचणीत उपलब्ध स्फुरद कमी दिसतो; कोवळ्या मुळांना त्याची गरज असते."],medium:["The test indicates a moderate available phosphorus level.","चाचणीत उपलब्ध स्फुरदाची पातळी मध्यम दिसते."],high:["The test indicates high available phosphorus.","चाचणीत उपलब्ध स्फुरदाची पातळी जास्त दिसते."]};
 const pAct:Record<string,[string,string]>={low:["At sowing, place SSP or DAP near the root zone instead of broadcasting on the surface.","पेरणीवेळी SSP किंवा DAP जमिनीवर पसरवण्याऐवजी मुळांच्या जवळ द्या."],medium:["Follow the crop-specific soil-test recommendation.","पिकानुसार माती चाचणीची शिफारस पाळा."],high:["Avoid adding extra phosphorus unless a crop-specific soil test recommends it.","पिकासाठीच्या माती चाचणीत सांगितल्याशिवाय अतिरिक्त स्फुरद देऊ नका."]};
 add("phosphorus",r.phosphorusLevel==="low"?"attention":"good",pLabel[r.phosphorusLevel],pEx[r.phosphorusLevel],pAct[r.phosphorusLevel]);
 if(r.potassiumLevel!=="untested"){const low=r.potassiumLevel==="low";add("potassium",low?"attention":"good",[`${r.potassiumLevel} potassium`,low?"पालाश कमी":`पालाश ${r.potassiumLevel==="medium"?"मध्यम":"जास्त"}`],[`The rapid kit reports ${r.potassiumLevel} potassium.`, `जलद किटमध्ये पालाशाची पातळी ${r.potassiumLevel==="low"?"कमी":r.potassiumLevel==="medium"?"मध्यम":"जास्त"} दिसते.`],[low?"Confirm with a soil test and plan potassium for the crop stage.":"Use potassium fertilizer only as advised for this crop.",low?"माती चाचणीने खात्री करून पिकाच्या अवस्थेनुसार पालाशाचे नियोजन करा.":"या पिकासाठीच्या सल्ल्यानुसारच पालाशयुक्त खत वापरा."]);}
 if(r.organicCarbon!=="untested"){const low=r.organicCarbon==="low";add("organic_carbon",low?"attention":"good",[`${r.organicCarbon} organic carbon`,low?"सेंद्रिय कर्ब कमी":`सेंद्रिय कर्ब ${r.organicCarbon==="medium"?"मध्यम":"जास्त"}`],[`The rapid kit reports ${r.organicCarbon} organic carbon.`,`जलद किटमध्ये सेंद्रिय कर्ब ${r.organicCarbon==="low"?"कमी":r.organicCarbon==="medium"?"मध्यम":"जास्त"} दिसतो.`],[low?"Add well-decomposed organic matter such as compost or FYM.":"Maintain organic matter with suitable crop residues and compost.",low?"कंपोस्ट किंवा शेणखतासारखे चांगले कुजलेले सेंद्रिय पदार्थ घाला.":"योग्य पिकांचे अवशेष आणि कंपोस्ट वापरून सेंद्रिय पदार्थ टिकवा."]);}
 if(r.salinity!=="untested"){const concern=r.salinity!=="normal";const salMr=r.salinity==="normal"?"सामान्य":r.salinity==="elevated"?"वाढलेली":"जास्त";add("salinity",concern?"attention":"good",[`${r.salinity} salinity`,`क्षारता ${salMr}`],[`The kit indicates ${r.salinity} salinity.`,`किटमध्ये क्षारता ${salMr} असल्याचे दिसते.`],[concern?"Test soil and irrigation-water EC and check drainage before selecting an amendment.":"Continue monitoring soil and irrigation water if white crust appears.",concern?"उपाय निवडण्यापूर्वी माती व सिंचनाच्या पाण्याची EC तपासा आणि निचरा पाहा.":"पांढरा थर दिसल्यास माती आणि सिंचनाच्या पाण्याची तपासणी करा."]);}
 const overallHealth=steps.some(s=>s.severity==="critical")?"critical_amendment":steps.some(s=>s.severity==="attention")?"needs_enrichment":"optimal";
 const assayNotes = {
  en: "N is from alkaline KMnO₄ and P from Olsen colorimetry. These are screening results, not a laboratory prescription.",
  mr: "नत्रासाठी अल्कलाइन KMnO₄ आणि स्फुरदासाठी ओल्सेन रंगमिती वापरली. हे प्राथमिक निष्कर्ष आहेत, प्रयोगशाळेची अंतिम शिफारस नाही.",
 };
 if (r.dataStatus === "simulated") {
  assayNotes.en += ` ${en.simulatedNote}`;
  assayNotes.mr += ` ${mr.simulatedNote}`;
 }
 return {phCategory:cat,overallHealth,headline:{en:overallHealth==="optimal"?"Soil results look balanced":"Review these soil improvements before planting",mr:overallHealth==="optimal"?"मातीचे निष्कर्ष संतुलित":"लागवडीपूर्वी माती सुधारणा तपासा"},assayNotes,steps};
}
