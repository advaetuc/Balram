"use client";

import { useBalramStore } from "@/store/useBalramStore";
import { OfflineSupport } from "./OfflineSupport";
import { PrivacyNotice } from "./PrivacyNotice";

export function Footer() {
  const locale = useBalramStore((state) => state.locale);
  return <footer lang={locale} className="border-t border-forest/15 px-4 py-6 text-sm sm:px-6">
    <p className="mx-auto max-w-7xl">{locale === "mr" ? "Balram · महाराष्ट्रातील शेत नियोजन. जतन केलेल्या माहितीच्या मूळ तारखा व स्रोत तसेच राहतात." : "Balram · Maharashtra farm planning. Saved data retains its original dates and sources."}</p>
    <OfflineSupport />
    <PrivacyNotice />
  </footer>;
}
