"use client";

import { useBalramStore } from "@/store/useBalramStore";

export function PrivacyNotice() {
  const locale = useBalramStore((state) => state.locale);
  const mr = locale === "mr";
  return <section aria-labelledby="privacy-title" className="mx-auto mt-4 max-w-7xl text-sm leading-6">
    <details><summary id="privacy-title" className="inline-flex min-h-12 cursor-pointer items-center rounded-full border border-forest/20 bg-white px-4 font-semibold text-forest hover:bg-forest/5">{mr ? "माहितीचा वापर व गोपनीयता" : "Data & privacy"}</summary>
      <div className="max-w-3xl space-y-3 pb-3">
        {mr ? <p>तुमची माहिती, शेताची सीमा, पिके, सिंचन नोंदी आणि शेवटचे उपलब्ध निकाल या ब्राउझरच्या स्थानिक साठ्यातच राहतात.
          बलराममध्ये खाते किंवा दूरस्थ शेत-माहितीचा साठा नाही. ब्राउझरची माहिती पुसल्यास तुमचे नियोजन हटेल; हा ब्राउझर वापरणाऱ्या इतरांना ते दिसू शकते.</p> : <p>Your profile, boundary, crops, irrigation inputs and last-good results stay in this browser’s IndexedDB.
          Balram has no accounts or remote farm database. Clearing browser storage removes your plan; other people using this browser may access it.</p>
        }
        {mr ? <p>तुमच्या कृतीनंतरच निर्देशांक पाठवले जातात: हवामान मागवल्यावर शेताचे केंद्र आमच्या सर्व्हरमार्फत ओपन-मेटिओकडे जाते;
          सुविधा सुरू असल्यास प्रायोगिक माती माहिती मातीच्या नमुना सेवेकडे जाते. सेवा निर्देशांक चार दशांश स्थळांपर्यंत गोल केले जातात.
          जागेच्या शोधातील मजकूर शोध सेवेकडे जातो. शेताची संपूर्ण सीमा आणि वैयक्तिक माहिती अपलोड केली जात नाही.</p> : <p>Coordinates are transmitted only after an explicit action: requesting weather sends the field center through our server to Open-Meteo;
          requesting experimental soil data sends it to ISRIC SoilGrids when enabled. Provider coordinates are rounded to four decimal places.
          Nominatim receives submitted place-search text. Full boundary polygons and farm profiles are never uploaded.</p>
        }
        {mr ? <p>“ऑनलाइन नकाशा दाखवा” निवडल्यानंतर नकाशाचे टाइल उघडतात. ओपनस्ट्रीटमॅपला दिसणाऱ्या टाइलची ठिकाणे आणि तुमचा इंटरनेट पत्ता कळतो;
          नकाशा हलवल्यावर नवीन टाइल मागवल्या जातात. ऑफलाइन वापरासाठी बलराम टाइल डाउनलोड किंवा जतन करत नाही.
          “माझे स्थान वापरा” ब्राउझरची परवानगी घेऊन स्थानिक नोंदी भरते; माहिती सेवा प्रदात्याकडे पाठवत नाही.</p> : <p>Map tiles load after you choose “Load online map”. OpenStreetMap receives visible tile locations and your IP address;
          subsequent map movements request visible tiles. Balram never downloads or stores tiles for offline use.
          “Use my location” asks the browser for permission and fills local inputs; it does not submit them to a data provider.</p>
        }
        {mr ? <p>आमची होस्टिंग सेवा शोध विनंत्या, शेताचे पाठवलेले केंद्र आणि जोडणीशी संबंधित माहिती प्रक्रिया करते.
          सार्वजनिक सेवा प्रदाते त्यांच्या धोरणांनुसार विनंत्या प्रक्रिया करतात. बलराम निर्देशांक नोंदवत नाही किंवा शोध निकाल सार्वजनिकरीत्या साठवत नाही.
          ऑफलाइन साठ्यात फक्त अनुप्रयोगाच्या फाईल्स असतात; जतन केलेल्या माहितीच्या मूळ तारखा व स्रोत तसेच राहतात.</p> : <p>Our hosting service processes lookup requests, including the submitted field center, and connection metadata.
          Public providers process requests under their own policies. Balram does not log coordinates or publicly cache lookup responses.
          The offline cache holds application files only; saved data retains its original dates and sources.</p>
        }
        {mr ? <p>ओपन-मेटिओ आणि ओपनस्ट्रीटमॅप या सार्वजनिक सेवा आहेत; त्यांना प्रवेश-कळ लागत नाही, वापर मर्यादा आहेत आणि उपलब्धतेची हमी नाही.
          प्रायोगिक माती सेवा आणि बाजारभाव सेवा सध्या बंद आहेत. हवामान व मातीचे मूल्य हे नमुना-आधारित अंदाज आहेत, प्रत्यक्ष मोजमाप नाहीत;
          सिंचन नियोजन स्थानिक पातळीवर तपासा. ओपन-मेटिओची विनामूल्य सेवा व्यावसायिक वापरासाठी नाही.</p> : <p>Open-Meteo, Nominatim and OpenStreetMap are public, keyless services with usage limits and no guaranteed availability.
          SoilGrids is experimental and disabled for release. Agmarknet is disabled. Weather and soil values are modeled estimates,
          not field measurements; verify irrigation plans locally. Open-Meteo’s free endpoint requires non-commercial use.</p>
        }
        <div className="flex flex-wrap gap-x-5">
          <a className="inline-flex items-center underline" href="https://open-meteo.com/en/terms" target="_blank" rel="noreferrer">{mr ? "ओपन-मेटिओच्या अटी" : "Open-Meteo terms"}</a>
          <a className="inline-flex items-center underline" href="https://operations.osmfoundation.org/policies/nominatim/" target="_blank" rel="noreferrer">{mr ? "जागा शोध सेवेचे धोरण" : "Nominatim policy"}</a>
          <a className="inline-flex items-center underline" href="https://osmfoundation.org/wiki/Privacy_Policy" target="_blank" rel="noreferrer">{mr ? "ओपनस्ट्रीटमॅपचे गोपनीयता धोरण" : "OpenStreetMap privacy"}</a>
        </div>
      </div>
    </details>
  </section>;
}
