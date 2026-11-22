import { useId } from "react";
import type { SkyCondition } from "@/lib/domain/viz/skyCondition";
import type { VisualWeatherProvenance } from "@/lib/domain/viz/waterRibbon";
import type { LifecycleStage, Locale } from "@/types/domain";
import { patternFill, ProvenanceStroke, provenanceStrokeDasharray, SAMPLE_PATTERN_ID } from "./ProvenanceStroke";

const skyColors = {
  clear_hot: ["#F9DC94", "#FFF8E5"],
  clear_mild: ["#E0F2FE", "#FDF9E8"],
  partly_cloudy: ["#C5E4F0", "#F6FAF2"],
  light_rain: ["#B1CDDF", "#EAF4F1"],
  heavy_rain: ["#9CB8CE", "#E8F0F1"],
} as const;

const fieldPlants = {
  planned: <>
    <path d="M-13 0q12-7 25 0M-8 4q9-3 17 0" fill="none" stroke="#C9A97B" strokeWidth="1.4" />
    <path d="M0 0v-8m0 4c-6-1-7-5-8-7 4 0 7 2 8 5m0-2c2-4 5-5 8-5-1 4-3 6-8 7" fill="#B8D8AA" stroke="#B8D8AA" strokeWidth="1.2" />
    <ellipse cx="-5" cy="2" rx="2.8" ry="1.5" fill="#F4CC73" transform="rotate(-16 -5 2)" />
  </>,
  vegetative: <>
    <path d="M0 0v-29M0-9c-10 0-17-7-17-15 7 0 15 7 17 15Zm0-7c9 0 16-8 16-16C9-31 2-24 0-16Zm0-6c-7-1-10-6-10-12 6 2 9 5 10 12Z"
      fill="#A6CE86" stroke="#D7E6A8" strokeWidth="1.2" />
    <path d="M-13-20 0-9m13-18L0-16" stroke="#5F8570" strokeWidth="1.2" />
  </>,
  flowering_fruiting: <>
    <path d="M0 0v-31m0 22c-11 1-15-5-17-12 8 0 14 4 17 12Zm0-6c6-9 14-11 19-11-1 7-9 12-19 11Z"
      fill="#ADD08B" stroke="#D7E6A8" strokeWidth="1.5" />
    <path d="M-3-36c-8 0-7-9 0-8 2-6 10-4 10 2 6 3 4 9-2 10-1 5-9 5-10-1Z" fill="#F8D8CF" stroke="#AB654E" strokeWidth="1.2" />
    <circle cx="1" cy="-37" r="3" fill="#FFBF00" />
    <circle cx="18" cy="-24" r="4" fill="#EDAF88" stroke="#F8D8CF" strokeWidth="1.2" />
  </>,
  harvesting: <>
    <path d="M0 0q1-18 0-37M0-7c-6-10-11-10-16-13M0-9c8-9 14-11 18-11"
      fill="none" stroke="#F4CC73" strokeWidth="2" />
    <path d="M0-32c-6-5-4-11 0-14 4 3 6 9 0 14Zm0 6c-6-1-10-5-9-11 6 2 9 6 9 11Zm0 0c6-1 10-5 9-11-6 2-9 6-9 11Zm0 7c-6-1-10-5-9-11 6 2 9 6 9 11Zm0 0c6-1 10-5 9-11-6 2-9 6-9 11Z"
      fill="#F4CC73" stroke="#A16207" strokeWidth="1.15" />
  </>,
};

const plants = [
  [347, 241, 0.42], [383, 246, 0.48], [415, 253, 0.55], [441, 258, 0.56],
  [669, 246, 0.45], [699, 252, 0.48], [734, 261, 0.58], [781, 271, 0.62],
  [88, 292, 0.78], [124, 286, 0.7], [164, 292, 0.82], [195, 301, 0.85],
  [232, 313, 1], [260, 316, 0.9], [299, 326, 1.12],
  [557, 299, 0.76], [593, 306, 0.83], [626, 318, 1.05], [666, 327, 1.14],
  [726, 328, 1.2], [773, 329, 1.3], [813, 327, 1.12],
] as const;

export function SkyScene({ condition, dominantStage, provenance, ariaLabel, locale }: {
  condition: SkyCondition | null;
  dominantStage: LifecycleStage | null;
  provenance: VisualWeatherProvenance | null;
  ariaLabel: string;
  locale: Locale;
}) {
  const prefix = `sky-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}-`;
  const id = (name: string) => prefix + name;
  const fill = (name: string) => `url(#${id(name)})`;
  const [skyTop, skyBottom] = condition === null ? ["#DCE9E8", "#FAF8EC"] : skyColors[condition];
  const hot = condition === "clear_hot";
  const sunny = hot || condition === "clear_mild";
  const wet = condition === "light_rain" || condition === "heavy_rain";
  const heavy = condition === "heavy_rain";
  const cloudy = wet || condition === "partly_cloudy";

  return <svg role="img" aria-label={ariaLabel} lang={locale} viewBox="0 0 840 324"
    className="block h-auto w-full" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <clipPath id={id("frame")}><rect x="2" y="2" width="836" height="320" rx="16" /></clipPath>
      <linearGradient id={id("sky")} x2="0" y2="1">
        <stop stopColor={skyTop} /><stop offset="1" stopColor={skyBottom} />
      </linearGradient>
      <linearGradient id={id("earth")} x2="0" y2="1">
        <stop stopColor="#476A4C" /><stop offset="0.55" stopColor="#21492F" /><stop offset="1" stopColor="#29372E" />
      </linearGradient>
      <linearGradient id={id("cloud")} x2="0" y2="1">
        <stop stopColor={heavy ? "#5D7E96" : "#FCFFFF"} />
        <stop offset="1" stopColor={heavy ? "#41657F" : wet ? "#8DAFC4" : "#D7E8ED"} />
      </linearGradient>
      {dominantStage && <g id={id("plant")}>{fieldPlants[dominantStage]}</g>}
    </defs>
    {provenance === "sample" && <ProvenanceStroke idPrefix={prefix} />}

    <g clipPath={fill("frame")}>
      <rect width="840" height="324" fill={fill("sky")} />
      <path d="M-20 164q212-40 441-27 238 13 439-13v73H-20Z" fill="#FFF8EC" opacity=".35" />
      {sunny && <g transform="translate(636 82)">
        <circle r="56" fill={hot ? "#FFBF00" : "#FFDE91"} opacity=".15" />
        <circle r="43" fill={hot ? "#FFBF00" : "#FFF1B9"} opacity=".28" />
        <path d="M0-63v-10m0 136v10M63 0h10M-63 0h-10m117-44 8-8m-96 96-8 8m96-8 8 8m-96-96-8-8"
          fill="none" stroke={hot ? "#A16207" : "#CF9B38"} strokeWidth="2.3" strokeLinecap="round" />
        <circle r="29" fill={hot ? "#FFBF00" : "#FFDA80"} stroke="#A16207" strokeWidth="1.5" />
        <path d="M-19 6a21 21 0 0 1 17-25" fill="none" stroke="#FFF5D2" strokeWidth="2" strokeLinecap="round" />
      </g>}
      {cloudy && <g className={condition === "partly_cloudy" ? "sky-cloud-drift" : undefined}>
        <path d="M132 78c0-8 11-14 20-13 7-15 29-16 39-3 17-4 30 6 32 16Z"
          fill={fill("cloud")} opacity=".82" />
        <path d="M476 107c3-12 15-20 32-20 5-18 19-31 43-31 21 0 38 10 45 24 7-5 16-8 29-7 12 0 24 9 29 16 22-1 42 8 49 18Z"
          fill={fill("cloud")} stroke={wet ? "#65869C" : "#C7DBE2"} strokeWidth="1.5" />
        <path d="M519 98c16-7 35-8 57-6m37 4q18-4 33 2" fill="none" stroke="#EFF7FB" strokeWidth="1.6" opacity={heavy ? ".42" : ".78"} strokeLinecap="round" />
      </g>}
      {wet && <g fill="none" stroke="#0369A1" strokeWidth={heavy ? "2.8" : "2.2"} strokeLinecap="round" opacity={heavy ? ".88" : ".73"}>
        <path d="m529 116-10 20m40-15-11 20m49-21-10 21m45-20-11 20m47-23-10 19" />
        {heavy && <path d="m511 144-10 20m41-16-10 22m49-20-11 22m45-22-10 21m46-23-11 22m61-52-10 19m-8 13-10 20" />}
      </g>}

      <path d="M0 180c46-13 71-20 114-28l21-16h84l20 15c44 1 79 13 125 33 50-8 91-23 127-29l26-19h117l26 21c56 1 117 11 180 26v55H0Z" fill="#769589" />
      <path d="M0 204c80-31 145-39 214-33 69 7 103 27 168 27 83 0 147-37 232-37 91-2 162 18 226 40v46H0Z" fill="#9CB29A" />
      <path d="M0 215c71-26 146-35 217-24 78 12 131 24 218 19 103-6 156-32 230-32 67 1 118 14 175 32v47H0Z" fill="#5F8570" />
      <path d="M0 219c107-25 189-21 272-6 86 16 172 10 267-5 121-21 201-19 301 14v102H0Z" fill={fill("earth")} />

      <path d="M-12 261c140-36 283-36 471-18 145 14 259 25 397 5v16c-152 20-279 15-421-1-167-19-308-15-447 21Z" fill="#5F8570" opacity=".55" />
      <path d="M-12 305c108-34 218-37 351-22 172 19 347 27 517-7v17c-177 34-334 29-516 10-132-13-234-9-352 29Z" fill="#665941" opacity=".66" />
      <path d="M0 322c147-32 242-21 349-7 145 17 288 20 491-1v10H0Z" fill="#1E5631" />
      <g fill="none" strokeLinecap="round">
        <path d="M21 244c106-17 179-17 252-11m28 4 18 2m110 10q49 5 83 4m22 1 24 1m110 4c60 1 117-3 153-9M8 291c82-24 181-30 255-25m33 3 22 2m125 11 30 3m231 9c42-1 85-7 127-15"
          stroke="#C4CC9C" strokeWidth="1.5" opacity=".45" />
        <path d="M50 313q79-19 147-18m22 1 25 2m101 9 20 2m113 9q79 7 153 3m94-6 28-2m29-4 22-4"
          stroke="#C9A97B" strokeWidth="1.35" opacity=".6" />
      </g>
      {dominantStage && plants.map(([x, y, scale], index) => <use key={x} href={`#${id("plant")}`}
        transform={`translate(${x} ${y}) scale(${index % 2 ? -scale : scale} ${scale})`} />)}
      {provenance === "sample" && <g>
        <rect x="18" y="18" width="72" height="21" rx="6" fill="#FFF4D4" stroke="#1E5631" strokeWidth="1.5" />
        <rect x="19" y="19" width="70" height="19" rx="5" fill={patternFill(SAMPLE_PATTERN_ID, prefix)} />
      </g>}
    </g>

    <rect x="2" y="2" width="836" height="320" rx="16" fill="none"
      stroke={provenance === null ? "#5F8570" : "#1E5631"} strokeWidth="1.6" vectorEffect="non-scaling-stroke"
      strokeLinecap="round" strokeDasharray={provenance === null ? undefined : provenanceStrokeDasharray(provenance)} />
  </svg>;
}
