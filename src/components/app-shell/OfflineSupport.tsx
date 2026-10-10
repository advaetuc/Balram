"use client";

import { useEffect, useState } from "react";

export function OfflineSupport() {
  const [status, setStatus] = useState("Preparing offline application files…");
  useEffect(() => {
    let active = true;
    if (process.env.NODE_ENV !== "production") { setStatus("Offline application caching is available in production builds."); return; }
    if (!("serviceWorker" in navigator) || !window.isSecureContext) {
      setStatus("Offline reopening is unavailable in this browser. Saved inputs remain in browser storage."); return;
    }
    const timeout = window.setTimeout(() => {
      if (active) setStatus("Offline setup is incomplete. Reconnect and reopen Balram to retry; saved inputs remain in browser storage.");
    }, 45_000);
    void navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then(() => navigator.serviceWorker.ready)
      .then(() => { window.clearTimeout(timeout); if (active) setStatus("Application ready to reopen offline. Map tiles are not saved."); })
      .catch(() => { window.clearTimeout(timeout); if (active) setStatus("Offline application setup could not finish. Reconnect and reopen Balram to retry."); });
    return () => { active = false; window.clearTimeout(timeout); };
  }, []);
  return <p className="mx-auto mt-3 max-w-7xl text-xs leading-6" role="status">{status}</p>;
}
