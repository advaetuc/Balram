import { MaharashtraCropMatrix, type CropId } from "@/config/cropMatrix";
import { t } from "@/config/i18n";
import type { CropAllocation, SoilKitReading, WeatherSnapshot } from "@/types/domain";
import { displayPlotName } from "./landUnits";
export type FieldVoicePriority = "urgent" | "action" | "tip";
type FieldVoiceRule ="heat_vertisol_cracking"|"vegetative_nitrogen_low"|"sowing_phosphorus_low"|"alkaline_lockup_warning"|"flowering_peak_water"|"rabi_cold_night_guard"|"harvest_rain_warning"|"general_seasonal_guidance"
  | "dry_soil_moisture_alert" | "wet_soil_waterlogging_guard" | "rain_fertilizer_washout_guard"
  | "acidic_soil_ph_guard" | "high_nitrogen_restraint";
type Bilingual = Readonly<{ en: string; mr: string }>;

export interface FieldVoiceAdvisory {
  readonly id: string;
  readonly ruleId: FieldVoiceRule;
  readonly priority: FieldVoicePriority;
  readonly plotId: string | null;
  readonly plotName: string | null;
  readonly cropId: CropId | null;
  readonly headline: Bilingual;
  readonly reason: Bilingual;
  readonly message: Bilingual;
  readonly actionLabel: Bilingual;
}
export function generateFieldVoiceAdvisories(input:{allocations:readonly CropAllocation[];soilKitReading:SoilKitReading|null;weatherSnapshot:WeatherSnapshot|null;nowMs?:number|null}):FieldVoiceAdvisory[]{
 const headlines:Record<FieldVoiceAdvisory["ruleId"],{en:string;mr:string}>={
  heat_vertisol_cracking:{en:"High heat & black soil cracking risk",mr:"तीव्र उन्हामुळे काळी जमीन भेगाळण्याचा धोका"},
  vegetative_nitrogen_low:{en:"Low nitrogen during active leaf growth",mr:"वाढीच्या काळात नत्राची (N) कमतरता"},
  sowing_phosphorus_low:{en:"Low phosphorus for root establishment",mr:"मुळांच्या वाढीसाठी स्फुरदाची (P) कमतरता"},
  alkaline_lockup_warning:{en:"High alkalinity may lock up nutrients",mr:"जास्त सामूमुळे (pH) अन्नद्रव्ये अडकण्याचा धोका"},
  flowering_peak_water:{en:"Peak water need during flowering",mr:"फुलोरा व फळधारणेच्या काळात पाण्याची मुख्य गरज"},
  rabi_cold_night_guard:{en:"Cold night alert for onion plot",mr:"कांदा प्लॉटसाठी रात्रीच्या थंडीचा इशारा"},
  harvest_rain_warning:{en:"Rain forecast during harvest window",mr:"काढणीच्या काळात पावसाची शक्यता"},
  general_seasonal_guidance: { en: "A quick look around the field", mr: "शेताची एक छोटी फेरी" },
  dry_soil_moisture_alert: { en: "Dry soil needs a closer look", mr: "कोरड्या मातीतील ओलावा तपासा" },
  wet_soil_waterlogging_guard: { en: "Give wet soil time to drain", mr: "ओल्या मातीतले जादा पाणी निचरू द्या" },
  rain_fertilizer_washout_guard: { en: "Wait out the rain before top-dressing", mr: "वरखत देण्यापूर्वी पाऊस ओसरेपर्यंत थांबा" },
  acidic_soil_ph_guard: { en: "Check acidic soil before sowing", mr: "पेरणीपूर्वी आम्लीय माती तपासा" },
  high_nitrogen_restraint: { en: "Save on extra urea", mr: "अतिरिक्त युरियाचा खर्च वाचवा" },
 };
 const actions:Record<FieldVoiceAdvisory["ruleId"],{en:string;mr:string}>={
  heat_vertisol_cracking:{en:"Plan an early-morning watering",mr:"सकाळी लवकर पाणी देण्याचे नियोजन करा"},vegetative_nitrogen_low:{en:"Check nitrogen dose with a local adviser",mr:"स्थानिक कृषी सल्लागाराकडून नत्राची मात्रा तपासा"},sowing_phosphorus_low:{en:"Plan root-zone phosphorus at sowing",mr:"पेरणीवेळी मुळांजवळ स्फुरद देण्याचे नियोजन करा"},alkaline_lockup_warning:{en:"Check soil amendment options locally",mr:"माती सुधारणेचे पर्याय स्थानिक पातळीवर तपासा"},flowering_peak_water:{en:"Prioritize this plot if water is available",mr:"पाणी उपलब्ध असल्यास या प्लॉटला प्राधान्य द्या"},rabi_cold_night_guard:{en:"Check local onion cold-weather guidance",mr:"कांद्यासाठी थंडीतील स्थानिक सल्ला तपासा"},harvest_rain_warning:{en:"Protect produce from forecast rain",mr:"अंदाजित पावसापासून उत्पादन सुरक्षित ठेवा"},general_seasonal_guidance: { en: "Note one change on your next field walk", mr: "पुढच्या शेतफेरीत दिसलेला एखादा बदल नोंदवा" },
  dry_soil_moisture_alert: { en: "Check moisture at root depth and inspect the drip lines", mr: "मुळांच्या खोलीवर ओलावा आणि ठिबक नळ्या तपासा" },
  wet_soil_waterlogging_guard: { en: "Pause irrigation and clear drainage channels", mr: "सिंचन थांबवा आणि निचऱ्याच्या चरांतील अडथळे काढा" },
  rain_fertilizer_washout_guard: { en: "Reschedule top-dressing after the rain", mr: "पाऊस ओसरल्यावर वरखताचे नियोजन करा" },
  acidic_soil_ph_guard: { en: "Ask a local adviser about agricultural lime", mr: "शेतीच्या चुन्याबद्दल स्थानिक कृषी तज्ज्ञांना विचारा" },
  high_nitrogen_restraint: { en: "Skip the extra basal urea", mr: "पायाभूत मात्रेत अतिरिक्त युरिया टाळा" },
 };
 const { soilKitReading: soil, weatherSnapshot, allocations } = input;
 const out: FieldVoiceAdvisory[] = [];
 const days = weatherSnapshot?.daily ?? [];
 const d = days[0];
 const outlook = days.slice(0, 3);
 const rain = outlook.reduce((sum, day) => sum + (day.precipitation ?? 0), 0);
 const rainKnown = !weatherSnapshot?.source?.includes("seasonal baseline")
  && outlook.some(day => day.precipitation != null);
 const numberMr = (value: number) => new Intl.NumberFormat("mr-IN", { maximumFractionDigits: 20 }).format(value);
 const add = (ruleId: FieldVoiceRule, priority: FieldVoicePriority, plot: CropAllocation | null,
  en: string, mr: string, reasonEn: string, reasonMr: string) => {
  out.push({
   id: `${ruleId}:${plot?.plotId ?? plot?.cropId ?? "farm"}`,
   ruleId, priority, plotId: plot?.plotId ?? null, plotName: plot?.plotName ?? null,
   cropId: plot && plot.cropId in MaharashtraCropMatrix ? plot.cropId as CropId : null,
   headline: headlines[ruleId], reason: { en: reasonEn, mr: reasonMr },
   message: { en, mr }, actionLabel: actions[ruleId],
  });
 };

 if (soil?.moistureLevel === "dry") {
  const moisture = soil.moisturePercent;
  const reasonEn = moisture == null ? "Your saved soil reading is marked dry." : `Your saved soil moisture is ${moisture}%.`;
  const reasonMr = moisture == null ? "जतन केलेल्या नोंदीत माती कोरडी आहे." : `जतन केलेल्या नोंदीनुसार मातीत ${numberMr(moisture)}% ओलावा आहे.`;
  const littleRain = rainKnown && rain < 5 && outlook.length === 3 && outlook.every(day => day.precipitation != null);
  add("dry_soil_moisture_alert", "urgent", null,
   "Feel the soil at root depth. If it is still dry, water early in the morning. Check that your mulch covers bare soil and that drip emitters are flowing.",
   "मुळांच्या खोलीवर मातीचा ओलावा पाहा. माती अजूनही कोरडी असल्यास पहाटे पाणी द्या. उघड्या मातीवर आच्छादन आहे का आणि ठिबक तोट्यांतून पाणी येते का ते पाहा.",
   littleRain ? `${reasonEn} The next three days' outlook shows only ${rain} mm of rain.` : reasonEn,
   littleRain ? `${reasonMr} पुढील तीन दिवसांत फक्त ${numberMr(rain)} मिमी पावसाचा अंदाज आहे.` : reasonMr);
 }
 if (soil?.moistureLevel === "wet") {
  const wetWeather = rainKnown && rain >= 5;
  add("wet_soil_waterlogging_guard", wetWeather ? "urgent" : "action", null,
   "Pause irrigation. In black soil, open or clear drainage channels where water collects so roots can get air.",
   "सिंचन थांबवा. काळ्या मातीत पाणी साचत असेल तर निचऱ्याचे चर उघडा किंवा साफ करा, म्हणजे मुळांना हवा मिळेल.",
   wetWeather ? `Your soil is already wet and the three-day outlook shows ${rain} mm of rain.` : "Your saved soil reading is wet. Standing water can deprive roots of air.",
   wetWeather ? `माती आधीच ओली आहे आणि पुढील तीन दिवसांत ${numberMr(rain)} मिमी पावसाचा अंदाज आहे.` : "जतन केलेल्या नोंदीनुसार माती ओली आहे. पाणी साचल्यास मुळांना हवा कमी मिळते.");
 }
 if (rainKnown && rain >= 15 && (soil?.nitrogenLevel === "low" || soil?.phosphorusLevel === "low")) {
  add("rain_fertilizer_washout_guard", "urgent", null,
   "Hold off on top-dressing. Once the heavy rain has passed and the soil has drained, check the field before applying fertilizer.",
   "आत्ता वरखत देणे थांबवा. जोराचा पाऊस ओसरून जादा पाणी निचरल्यावर शेत पाहा आणि मग खत द्या.",
   `The soil reading shows low nitrogen or phosphorus, but ${rain} mm of rain in the three-day outlook could wash fertilizer away.`,
   `मातीच्या नोंदीत नत्र किंवा स्फुरद कमी आहे. पुढील तीन दिवसांत ${numberMr(rain)} मिमी पावसाचा अंदाज असल्याने खत वाहून जाऊ शकते.`);
 }
 if (soil && soil.ph < 5.8) {
  add("acidic_soil_ph_guard", "action", null,
   "Work in well-rotted farmyard manure or compost. Before sowing, ask a local soil adviser whether agricultural lime is suitable for your soil and crop.",
   "चांगले कुजलेले शेणखत किंवा कंपोस्ट मातीत मिसळा. पेरणीपूर्वी तुमच्या मातीला व पिकाला शेतीचा चुना योग्य आहे का, हे स्थानिक कृषी तज्ज्ञांना विचारा.",
   `Your saved soil pH is ${soil.ph}. Acidity can make some nutrients harder for roots to take up.`,
   `जतन केलेल्या नोंदीनुसार मातीचा सामू ${numberMr(soil.ph)} आहे. आम्लीय मातीत मुळांना काही अन्नद्रव्ये कमी मिळू शकतात.`);
 }
 if (soil?.nitrogenLevel === "high") {
  add("high_nitrogen_restraint", "tip", null,
   "Your soil already has high available nitrogen. Avoid extra basal urea to save money and keep leafy growth in check.",
   "मातीत उपलब्ध नत्र आधीच जास्त आहे. पायाभूत मात्रेत जादा युरिया टाळल्याने खर्च वाचतो आणि पानांची अनावश्यक वाढ कमी होते.",
   "The saved soil test shows high nitrogen. Extra urea can encourage too much leafy growth.",
   "जतन केलेल्या चाचणीत नत्र जास्त आहे. जादा युरियामुळे पालवीची अनावश्यक वाढ होऊ शकते.");
 }

 if (allocations.length === 0 && soil) {
  if (soil.nitrogenLevel === "low") add("vegetative_nitrogen_low", "action", null,
   "Keep this low nitrogen result in mind when you choose a crop. A local adviser can help you plan split applications if the crop needs them.",
   "पीक निवडताना नत्र कमी असल्याची नोंद लक्षात ठेवा. पिकाला गरज असल्यास नत्राची विभागून मात्रा ठरवण्यासाठी स्थानिक सल्ला घ्या.",
   "Your saved soil test shows low nitrogen. The crop will help determine when it needs more.",
   "जतन केलेल्या माती चाचणीत नत्र कमी आहे. अधिक नत्र कधी द्यायचे हे पिकावर अवलंबून आहे.");
  if (soil.phosphorusLevel === "low") add("sowing_phosphorus_low", "action", null,
   "Take the low phosphorus result into your sowing plan. Once you choose a crop, check its phosphorus needs with a local adviser.",
   "पेरणीचे नियोजन करताना स्फुरद कमी असल्याची नोंद लक्षात घ्या. पीक ठरल्यावर त्याची स्फुरदाची गरज स्थानिक तज्ज्ञांकडून तपासून घ्या.",
   "Your saved soil test shows low phosphorus. Young roots need enough phosphorus to establish well.",
   "जतन केलेल्या चाचणीत स्फुरद कमी आहे. कोवळी मुळे नीट वाढण्यासाठी पुरेसे स्फुरद लागते.");
  if (soil.ph >= 8.2) add("alkaline_lockup_warning", "action", null,
   "Well-rotted compost can help build soil organic matter. Ask a local soil adviser to check the reading before choosing an amendment.",
   "चांगले कुजलेले कंपोस्ट मातीतील सेंद्रिय पदार्थ वाढवण्यास मदत करते. सुधारक निवडण्यापूर्वी स्थानिक कृषी तज्ज्ञांकडून नोंद तपासून घ्या.",
   `Your saved soil pH is ${soil.ph}. At this pH, some nutrients can be harder for roots to take up.`,
   `जतन केलेल्या नोंदीनुसार मातीचा सामू ${numberMr(soil.ph)} आहे. या सामूवर मुळांना काही अन्नद्रव्ये कमी मिळू शकतात.`);
 }
 for(const p of input.allocations){const nameEn=displayPlotName(p.plotName,"en"),nameMr=displayPlotName(p.plotName,"mr"),cropInfo=MaharashtraCropMatrix[p.cropId as CropId],crop=cropInfo?.name??p.cropId,cropMr=cropInfo?.marathiName??p.cropId,stage=p.lifecycleStage;
 if((stage==="planned"||stage==="vegetative")&&d?.temperatureMax!==null&&d?.temperatureMax!==undefined&&d.temperatureMax>=35&&rain<2)add("heat_vertisol_cracking","urgent",p,`Your black soil may dry and crack in the heat. Water this ${nameEn} early in the morning.`,`उष्णतेत काळी जमीन कोरडी पडू शकते. ${nameMr} ला सकाळी लवकर पाणी द्या.`,`The forecast maximum is ${d.temperatureMax}°C and the next three forecast days total ${rain} mm of rain.`,`अंदाजातील कमाल तापमान ${d.temperatureMax}°C आहे आणि पुढील तीन दिवसांचा पाऊस ${rain} मिमी आहे.`);
 if(stage==="vegetative"&&input.soilKitReading?.nitrogenLevel==="low"&&p.cropId!=="groundnut")add("vegetative_nitrogen_low","action",p,`${crop} in ${nameEn} is growing leaves, but the soil test shows low nitrogen. Plan a split dose with local advice.`,`${nameMr} मधील ${cropMr} वाढत आहे; चाचणीत नत्र कमी आहे. स्थानिक सल्ल्याने विभाजित मात्रा द्या.`,`The saved soil-kit reading says nitrogen is low, and this plot is in the vegetative stage.`,`माती किटच्या नोंदीत नत्र कमी आहे आणि हा प्लॉट वाढीच्या अवस्थेत आहे.`);
 if((stage==="planned"||stage==="vegetative")&&input.soilKitReading?.phosphorusLevel==="low")add("sowing_phosphorus_low","action",p,`The soil test shows low phosphorus for ${nameEn}. Place SSP or DAP near roots at sowing.`,`${nameMr} साठी स्फुरद कमी आहे. पेरणीवेळी SSP किंवा DAP मुळाजवळ द्या.`,`The saved soil-kit reading says phosphorus is low, and this plot is planned or vegetative.`,`माती किटच्या नोंदीत स्फुरद कमी आहे आणि हा प्लॉट नियोजित किंवा वाढीच्या अवस्थेत आहे.`);
 if(input.soilKitReading&&input.soilKitReading.ph>=8.2&&(p.cropId==="onion"||p.cropId==="sugarcane"))add("alkaline_lockup_warning","action",p,`Soil pH ${input.soilKitReading.ph} may restrict nutrients in ${nameEn}. Get local advice on compost or gypsum.`,`${nameMr} मधील सामू ${input.soilKitReading.ph} आहे; पोषण अडू शकते. कंपोस्ट किंवा जिप्समबाबत स्थानिक सल्ला घ्या.`,`The saved soil-kit pH is ${input.soilKitReading.ph}, and this plot has ${crop}.`,`माती किटमधील सामू ${input.soilKitReading.ph} आहे आणि या प्लॉटवर ${cropMr} आहे.`);
 if(stage==="flowering_fruiting"&&(d?.referenceEvapotranspiration??0)>=4.5)add("flowering_peak_water","urgent",p,`${crop} in ${nameEn} is flowering. Prioritize this plot if water is available.`,`${nameMr} मधील ${cropMr} फुलोऱ्यात आहे. पाणी उपलब्ध असल्यास या प्लॉटला प्राधान्य द्या.`,`The plot is in flowering/fruiting and forecast reference evapotranspiration is ${d?.referenceEvapotranspiration} mm/day.`,`हा प्लॉट फुलोरा/फळधारणेत आहे आणि अंदाजित संदर्भ बाष्पोत्सर्जन ${d?.referenceEvapotranspiration} मिमी/दिवस आहे.`);
 if(p.cropId==="onion"&&(d?.temperatureMin??99)<=10)add("rabi_cold_night_guard","urgent",p,`A cold night may affect onion in ${nameEn}. Check local crop guidance before irrigating.`,`${nameMr} मधील कांद्याला थंडीचा धोका आहे. पाणी देण्यापूर्वी स्थानिक मार्गदर्शन घ्या.`,`The forecast minimum temperature is ${d?.temperatureMin}°C, at or below the 10°C onion alert threshold.`,`अंदाजित किमान तापमान ${d?.temperatureMin}°C आहे, म्हणजे कांद्यासाठीच्या 10°C इशारा मर्यादेइतके किंवा त्याहून कमी.`);
 if(stage==="harvesting"&&rain>=5)add("harvest_rain_warning","urgent",p,`Rain is forecast while ${crop} in ${nameEn} is ready. Protect harvested produce and avoid extra irrigation.`,`${nameMr} मधील ${cropMr} काढणीला तयार असताना पाऊस शक्य आहे. माल झाकून ठेवा.`,`The plot is in harvesting and the next three forecast days total ${rain} mm of rain.`,`हा प्लॉट काढणीच्या अवस्थेत आहे आणि पुढील तीन दिवसांचा अंदाजित पाऊस ${rain} मिमी आहे.`);
 }
 if (out.length === 0) {
  const moisture = soil?.moistureLevel ?? "untested";
  const moistureEn = t("en").soilLab.moisture.levels[moisture].toLowerCase();
  const moistureMr = t("mr").soilLab.moisture.levels[moisture];
  add("general_seasonal_guidance", "tip", null,
   soil ? "You have a soil reading to work from. On your next walk, feel the soil near the roots and note any changes."
    : "A short walk is a good start. Feel the soil near the roots and look for any changes in leaves or standing water.",
   soil ? "तुमची मातीची नोंद जतन आहे. पुढच्या फेरीत मुळांजवळची माती हाताने पाहा आणि काही बदल दिसला तर नोंदवा."
    : "शेताची छोटी फेरी मारून सुरुवात करा. मुळांजवळची माती हाताने पाहा आणि पानांत काही बदल किंवा साचलेले पाणी दिसते का ते तपासा.",
   soil ? `Your saved soil pH is ${soil.ph}, and moisture is marked ${moistureEn}.`
    : "A quick field note gives you something to compare on your next visit.",
   soil ? `जतन केलेला सामू ${numberMr(soil.ph)} आहे. ओलाव्याची नोंद ${moistureMr} अशी आहे.`
    : "आजची छोटी नोंद पुढच्या फेरीत बदल ओळखायला मदत करेल.");
 }
 const rank = { urgent: 0, action: 1, tip: 2 };
 return out.sort((a, b) => rank[a.priority] - rank[b.priority] || a.id.localeCompare(b.id));
}
