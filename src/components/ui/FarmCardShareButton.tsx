"use client";

import { useRef, useState } from "react";
import { t } from "@/config/i18n";
import { indiaDate } from "@/lib/domain/calendar";
import type { RoadmapItem } from "@/lib/domain/roadmap";
import { buildFarmCardSvg, FARM_CARD_SIZE } from "@/lib/ui/farmCardSvg";
import type { PersistedFarm } from "@/types/domain";

async function renderPng(svg: string): Promise<Blob> {
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Farm card image could not be decoded."));
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });

  const canvas = document.createElement("canvas");
  canvas.width = FARM_CARD_SIZE;
  canvas.height = FARM_CARD_SIZE;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable.");
  context.drawImage(image, 0, 0, FARM_CARD_SIZE, FARM_CARD_SIZE);
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("PNG encoding failed.")), "image/png");
  });
}

function downloadPng(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  try {
    link.click();
  } finally {
    link.remove();
    // Allow the browser to start reading the download before releasing the URL.
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export function FarmCardShareButton({ state, roadmap, disabled = false }: {
  state: PersistedFarm;
  roadmap: readonly RoadmapItem[];
  disabled?: boolean;
}) {
  const dictionary = t(state.locale);
  const copy = dictionary.viz.farmCard;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const inFlight = useRef(false);

  async function share() {
    if (disabled || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setMessage("");
    try {
      const filename = `balram-farm-card-${indiaDate(Date.now())}.png`;
      const png = await renderPng(buildFarmCardSvg({ state, roadmap }));
      if (typeof File === "function" && typeof navigator.share === "function") {
        try {
          const file = new File([png], filename, { type: "image/png" });
          if (navigator.canShare?.({ files: [file] })) {
            await navigator.share({ files: [file], title: dictionary.shareTitle });
            return;
          }
        } catch (error) {
          if (error && typeof error === "object" && "name" in error && error.name === "AbortError") return;
        }
      }
      downloadPng(png, filename);
      setMessage(copy.downloaded);
    } catch {
      setMessage(copy.failed);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return <span className="inline-flex min-w-0 flex-col items-start gap-1 print:hidden">
    <button type="button" className="button-secondary press min-h-12 print:hidden" onClick={share}
      disabled={disabled || busy}>{busy ? copy.preparing : copy.share}</button>
    <span role="status" className="text-sm leading-body">{message}</span>
  </span>;
}
