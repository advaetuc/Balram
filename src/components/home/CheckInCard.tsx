"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ProvenanceBadge } from "@/components/ui/ProvenanceBadge";
import { RadioChoices } from "@/components/ui/RadioChoices";
import { StageIllustration } from "@/components/viz/StageIllustration";
import { lifecycleLabel, t } from "@/config/i18n";
import { isCheckInDue } from "@/lib/domain/checkIns";
import { createFieldId } from "@/lib/domain/geometry";
import { displayPlotName } from "@/lib/domain/landUnits";
import { useNow } from "@/lib/ui/useNow";
import { useBalramStore } from "@/store/useBalramStore";
import {
  CheckInEventSchema, growthToLifecycleStage, LifecycleStageSchema,
  type CheckInEvent, type CropAllocation, type LifecycleStage,
} from "@/types/domain";

function PictureChoices<T extends LifecycleStage | CheckInEvent>({ legend, labels, options, value, onChange, className }: {
  legend: string;
  labels: Record<T, string>;
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  className: string;
}) {
  const name = useId();
  const legendId = `${name}-label`;

  return <fieldset className="min-w-0">
    <legend id={legendId} className="font-semibold">{legend}</legend>
    <div role="radiogroup" aria-labelledby={legendId} className={`mt-2 grid gap-2 ${className}`}>
      {options.map(option => {
        const id = `${name}-${option}`;
        return <div key={option} className="min-w-0">
          <input type="radio" role="radio" name={name} id={id} value={option}
            checked={value === option} onChange={() => onChange(option)} className="peer sr-only min-h-0 min-w-0" />
          <label htmlFor={id}
            className="choice-target press relative flex h-full min-h-[96px] min-w-12 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-border-strong bg-white px-2 py-2 text-center text-sm font-bold leading-snug text-ink peer-checked:border-forest peer-checked:bg-success-subtle peer-checked:ring-2 peer-checked:ring-forest">
            <StageIllustration kind={option} className="size-10" />
            <span className="min-w-0 max-w-full [overflow-wrap:anywhere]">{labels[option]}</span>
            {value === option && <span aria-hidden="true"
              className="check-badge absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full bg-forest text-xs text-white">✓</span>}
          </label>
        </div>;
      })}
    </div>
  </fieldset>;
}

function plotKey(plot: CropAllocation, index: number) {
  return plot.plotId === undefined ? `legacy:${index}` : `plot:${plot.plotId}`;
}

function plotStage(plot: CropAllocation): LifecycleStage {
  return plot.lifecycleStage ?? growthToLifecycleStage(plot.growthStage);
}

export function CheckInCard() {
  const state = useBalramStore(s => s);
  const copy = t(state.locale);
  const { todayIso } = useNow();
  const [cadence, setCadence] = useState<7 | 30>(7);
  const [open, setOpen] = useState(false);
  const [selectedKey, setSelectedKey] = useState("");
  const [stage, setStage] = useState<LifecycleStage>("planned");
  const [event, setEvent] = useState<CheckInEvent>("none");
  const [note, setNote] = useState("");
  const start = useRef<HTMLButtonElement>(null);
  const editor = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  const due = isCheckInDue(state.checkIns, todayIso, cadence);
  const selectedPlot = state.cropAllocations.find((plot, index) => plotKey(plot, index) === selectedKey);
  const writable = state.hydrated && !state.sampleDataActive && !state.sampleOverlayActive && todayIso !== null;

  useEffect(() => {
    if (open) editor.current?.querySelector<HTMLElement>("select, input[type=radio]:checked")?.focus();
    else if (started.current) {
      started.current = false;
      start.current?.focus();
    }
  }, [open]);

  function selectPlot(key: string) {
    const plot = state.cropAllocations.find((item, index) => plotKey(item, index) === key);
    if (plot) {
      setSelectedKey(key);
      setStage(plotStage(plot));
    }
  }

  function startCheckIn() {
    const plot = state.cropAllocations[0];
    if (!writable || !plot) return;
    selectPlot(plotKey(plot, 0));
    started.current = true;
    setOpen(true);
  }

  function save() {
    if (!writable || !todayIso || !selectedPlot) return;
    state.addCheckIn({
      id: createFieldId().replace(/^field-/, "checkin-"),
      date: todayIso, plotId: selectedPlot.plotId ?? null, stage, event, note,
    });
    setOpen(false);
    setNote("");
    setEvent("none");
  }

  return <section className="bento-card space-y-4" aria-labelledby="check-in-title">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 id="check-in-title" className="text-xl font-bold">{due ? copy.checkInDueTitle : copy.checkInRecent}</h2>
        {due && <p className="mt-1 text-sm">{copy.checkInDueBody}</p>}
      </div>
      <RadioChoices<7 | 30> label={copy.checkInCadence} value={cadence} onChange={setCadence}
        options={[{ value: 7, label: copy.checkInWeekly }, { value: 30, label: copy.checkInMonthly }]} />
    </div>
    {!open ? <button ref={start} type="button" className="button-primary min-h-12"
      disabled={!writable || !state.cropAllocations.length} onClick={startCheckIn}>{copy.checkInStart}</button>
      : <div ref={editor} className="min-w-0 space-y-4 rounded-xl bg-daylight p-3 sm:p-4">
        {(state.cropAllocations.length > 1 || !selectedPlot) && <label className="block font-semibold">{copy.checkInPlot}
          <select className="form-input mt-2" value={selectedPlot ? selectedKey : ""} onChange={e => selectPlot(e.target.value)}>
            {!selectedPlot && <option value="" disabled>{copy.checkInPlot}</option>}
            {state.cropAllocations.map((plot, index) => {
              const key = plotKey(plot, index);
              return <option key={key} value={key}>{displayPlotName(plot.plotName, state.locale, index + 1)}</option>;
            })}
          </select>
        </label>}
        <PictureChoices legend={copy.checkInStage} labels={copy.stageNames} options={LifecycleStageSchema.options}
          value={stage} onChange={setStage} className="grid-cols-2" />
        <PictureChoices legend={copy.checkInEvent} labels={copy.checkInEvents} options={CheckInEventSchema.options}
          value={event} onChange={setEvent} className="grid-cols-2 sm:grid-cols-3" />
        <label className="block font-semibold">{copy.checkInNote}
          <textarea className="form-input mt-2" maxLength={280} value={note} onChange={e => setNote(e.target.value)} />
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="button-primary min-h-12" disabled={!writable || !selectedPlot} onClick={save}>{copy.checkInSave}</button>
          <button type="button" className="button-secondary min-h-12" onClick={() => setOpen(false)}>{copy.checkInCancel}</button>
        </div>
      </div>}
    <div>
      {due && <h3 className="font-bold">{copy.checkInRecent}</h3>}
      {state.checkIns.length === 0 ? <p className="mt-2 text-sm">{copy.checkInEmpty}</p>
        : <ul className="mt-2 space-y-2">{state.checkIns.slice(0, 5).map(item => {
          const index = state.cropAllocations.findIndex(plot => plot.plotId === item.plotId);
          const plot = state.cropAllocations[index];
          return <li key={item.id} className="rounded-xl border border-forest/15 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <b>{item.date}</b>
              <span>{plot ? displayPlotName(plot.plotName, state.locale, index + 1) : copy.checkInUnlinkedPlot}</span>
              <ProvenanceBadge provenance="you_entered" locale={state.locale} />
            </div>
            <p className="mt-1 text-sm">
              {item.stage ? lifecycleLabel(state.locale, item.stage) : "—"} · {copy.checkInEvents[item.event]}{item.note ? ` · ${item.note}` : ""}
            </p>
          </li>;
        })}</ul>}
    </div>
  </section>;
}
