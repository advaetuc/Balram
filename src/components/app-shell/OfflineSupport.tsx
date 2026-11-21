"use client";

import { useEffect, useState } from "react";
import { useBalramStore } from "@/store/useBalramStore";

export function OfflineSupport() {
  const locale = useBalramStore((state) => state.locale);
  const [status, setStatus] = useState("preparing");
  useEffect(() => {
    let active = true;
    if (process.env.NODE_ENV !== "production") { setStatus("development"); return; }
    if (!("serviceWorker" in navigator) || !window.isSecureContext) {
      setStatus("unavailable"); return;
    }
    const timeout = window.setTimeout(() => {
      if (active) setStatus("incomplete");
    }, 45_000);
    void navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then(() => navigator.serviceWorker.ready)
      .then(() => { window.clearTimeout(timeout); if (active) setStatus("ready"); })
      .catch(() => { window.clearTimeout(timeout); if (active) setStatus("failed"); });
    return () => { active = false; window.clearTimeout(timeout); };
  }, []);
  const messages = locale === "mr" ? {
    preparing: "ऑफलाइन वापरासाठी अनुप्रयोगाची माहिती तयार होत आहे…", development: "ऑफलाइन माहिती जतन करण्याची सुविधा उत्पादन आवृत्तीत उपलब्ध आहे.",
    unavailable: "या ब्राउझरमध्ये ऑफलाइन पुन्हा उघडता येणार नाही. जतन केलेली माहिती ब्राउझरमध्ये राहील.",
    incomplete: "ऑफलाइन तयारी पूर्ण झाली नाही. पुन्हा जोडणी करून बलराम उघडा; जतन केलेली माहिती ब्राउझरमध्ये राहील.",
    ready: "अनुप्रयोग ऑफलाइन उघडण्यासाठी तयार आहे. नकाशाचे टाइल जतन केलेले नाहीत.",
    failed: "ऑफलाइन तयारी पूर्ण होऊ शकली नाही. पुन्हा जोडणी करून बलराम उघडा.",
  } : {
    preparing: "Preparing offline application files…", development: "Offline application caching is available in production builds.",
    unavailable: "Offline reopening is unavailable in this browser. Saved inputs remain in browser storage.",
    incomplete: "Offline setup is incomplete. Reconnect and reopen Balram to retry; saved inputs remain in browser storage.",
    ready: "Application ready to reopen offline. Map tiles are not saved.", failed: "Offline application setup could not finish. Reconnect and reopen Balram to retry.",
  };
  return <p className="mx-auto mt-3 max-w-7xl text-sm leading-body" role="status">{messages[status as keyof typeof messages]}</p>;
}
