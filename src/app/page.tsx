"use client";

import { useBalramStore } from "@/store/useBalramStore";

const card = "min-w-0 rounded-2xl border border-forest/15 bg-white p-5 sm:p-6";

export default function Home() {
  const state = useBalramStore((value) => value);
  return (
    <section id="farm-overview" aria-labelledby="overview-title" aria-busy={!state.hydrated}>
      <p className="mb-3 text-sm font-bold uppercase tracking-widest text-forest">Farm overview</p>
      <h1 id="overview-title" className="max-w-3xl break-words text-3xl font-bold tracking-tight sm:text-4xl">
        {state.farmProfile?.name ?? "A clear starting point for your farm."}
      </h1>
      <p className="mt-4 max-w-2xl text-base leading-7">
        Keep your field, crop choices and irrigation setup together. Explore the labelled sample to see how a saved farm is organised.
      </p>
      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <article className={card}>
          <h2 className="text-lg font-bold text-forest">Field</h2>
          <p className="mt-3 text-2xl font-semibold">{state.fieldGeometry?.areaSquareMetres != null
            ? `${(state.fieldGeometry.areaSquareMetres / 4046.8564224).toFixed(2)} acres` : "No field selected"}</p>
          <p className="mt-2 text-sm">{state.farmProfile?.district ?? "Your saved field location will appear here."}</p>
        </article>
        <article className={card}>
          <h2 className="text-lg font-bold text-forest">Crop allocation</h2>
          {state.cropAllocations.length ? <ul className="mt-3 space-y-3">
            {state.cropAllocations.map((crop) => <li key={crop.cropId} className="flex justify-between gap-4">
              <span className="capitalize">{crop.cropId.replaceAll("_", " ")}</span><strong>{crop.percentage}%</strong>
            </li>)}
          </ul> : <p className="mt-3">No crops allocated.</p>}
        </article>
        <article className={`${card} border-t-4 border-t-sky`}>
          <h2 className="text-lg font-bold text-forest">Irrigation setup</h2>
          <p className="mt-3 capitalize">{state.irrigationSetup?.method ?? "Not configured"}</p>
          <p className="mt-2 text-sm leading-6">Runtime estimates require confirmed system flow and application efficiency.</p>
        </article>
      </div>
      <aside className="mt-6 rounded-xl border-l-4 border-sky bg-sky/10 p-5 text-sm leading-6">
        {state.sampleDataActive
          ? "Sample data is illustrative, dated 1 October 2026, and is not a current forecast or irrigation recommendation. Exit sample to return to an empty workspace."
          : "No live weather is connected. Weather model output, when available, describes a regional grid rather than measurements from your field."}
      </aside>
    </section>
  );
}
