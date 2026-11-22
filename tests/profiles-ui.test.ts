import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test, { type TestContext } from "node:test";
import { runInNewContext } from "node:vm";
import * as react from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as i18n from "../src/config/i18n";
import * as cropMatrix from "../src/config/cropMatrix";
import * as profileNames from "../src/lib/domain/profileNames";
import { extractFarmSlice, summarizeProfile } from "../src/lib/domain/profiles";
import * as areaConversion from "../src/lib/domain/areaConversion";
import * as landUnits from "../src/lib/domain/landUnits";
import * as backups from "../src/lib/storage/backup";
import { buildFarmCardSvg } from "../src/lib/ui/farmCardSvg";
import * as format from "../src/lib/ui/format";
import { buildShareSummary } from "../src/lib/ui/shareSummary";
import * as cssVar from "../src/lib/ui/useCssVar";
import * as fixtures from "../src/mocks/fixtures";
import { createBalramStore, persistedSlice, type BalramState } from "../src/store/useBalramStore";
import * as domain from "../src/types/domain";

const timestamp = "2026-11-22T12:00:00+05:30";

function browser(t: TestContext) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { indexedDB: undefined } });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else Reflect.deleteProperty(globalThis, "window");
  });
}

function loadComponent<T>(file: string, modules: Record<string, unknown>, globals = {}): T {
  const source = readFileSync(new URL(`../src/components/${file}`, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } });
  const imports: Record<string, unknown> = { react, "react/jsx-runtime": jsxRuntime, ...modules };
  const exports = {};
  runInNewContext(outputText, {
    ...globals, exports, require: (id: string) => {
      assert.ok(Object.hasOwn(imports, id), `unexpected component import: ${id}`);
      return imports[id];
    },
  });
  return exports as T;
}

test("switching named farms updates both localized shares without exposing coordinates or polygons", async (t) => {
  browser(t);
  const source = createBalramStore();
  await source.initialize();
  const state = source.store.getState;
  const names = ["River Field", "घरचे शेत"] as const;
  const farmIds: string[] = [];
  const coordinate: domain.Coordinate = [73.87654321, 18.56789123];
  const points: domain.Coordinate[] = [
    coordinate, [73.87754321, 18.56789123], [73.87754321, 18.56889123], coordinate,
  ];

  for (const [index, name] of names.entries()) {
    await state().createFarmProfile(name);
    farmIds.push(state().activeProfileId!);
    state().setFieldGeometry({
      fieldId: `private-field-id-${index}`, center: coordinate, areaSquareMetres: 8000,
      boundary: { type: "Polygon", coordinates: [points] },
    });
  }

  for (const locale of ["en", "mr"] as const) {
    state().setLocale(locale);
    for (const [index, id] of farmIds.entries()) {
      await state().switchFarmProfile(id);
      const current = state();
      const summary = buildShareSummary(current, [], locale);
      const svg = buildFarmCardSvg({ state: current, roadmap: [] });
      assert.equal(summary.split("\n")[0], names[index]);
      assert.ok(svg.includes(names[index]));
      for (const output of [summary, svg]) {
        assert.ok(!output.includes(names[1 - index]));
        for (const secret of points.flat().map(String)) assert.ok(!output.includes(secret));
        assert.doesNotMatch(output, /private-field-id|coordinates|Polygon/i);
      }
    }
  }
});

test("BackupControls exports stashed farms and imports them additively with capacity feedback", async (t) => {
  browser(t);
  const source = createBalramStore();
  const target = createBalramStore();
  await source.initialize();
  await target.initialize();
  const sourceState = source.store.getState;
  const targetState = target.store.getState;

  for (const [index, name] of ["River Field", "Well Field", "Hill Field"].entries()) {
    await sourceState().createFarmProfile(name, { fromSample: true });
    const reading = sourceState().soilKitReading!;
    sourceState().setSoilKitReading({ ...reading, ph: 6 + index / 2 });
    const [first, ...rest] = sourceState().cropAllocations;
    sourceState().setCropAllocations([{ ...first, plotName: `Source plot ${index}` }, ...rest]);
  }
  for (const name of ["River Field", "Local Orchard", "West Field", "Home Field"]) {
    await targetState().createFarmProfile(name);
  }
  const beforeImport = persistedSlice(targetState());

  type Props = {
    children?: react.ReactNode;
    onClick?: () => void;
    onChange?: (event: { currentTarget: { files: File[]; value: string } }) => void;
  };
  function elements(node: react.ReactNode): react.ReactElement<Props>[] {
    if (Array.isArray(node)) return node.flatMap(elements);
    return react.isValidElement<Props>(node) ? [node, ...elements(node.props.children)] : [];
  }

  const cells = new Map<number, unknown>();
  let hook = 0;
  let getState = sourceState;
  let downloaded: Blob | undefined;
  let downloadName = "";
  const { BackupControls } = loadComponent<{ BackupControls: () => react.ReactNode }>("home/BackupControls.tsx", {
    react: {
      useRef: () => ({ current: null }),
      useState: (initial: unknown) => {
        const index = hook++;
        if (!cells.has(index)) cells.set(index, initial);
        return [cells.get(index), (value: unknown) => cells.set(index, value)];
      },
    },
    "@/config/i18n": i18n,
    "@/lib/storage/backup": backups,
    "@/lib/ui/format": format,
    "@/store/useBalramStore": { persistedSlice, useBalramStore: (select: (state: BalramState) => unknown) => select(getState()) },
  }, {
    Blob,
    URL: { createObjectURL: (blob: Blob) => { downloaded = blob; return "blob:backup"; }, revokeObjectURL() {} },
    document: { createElement: () => ({ click(this: { download: string }) { downloadName = this.download; } }) },
  });
  const render = () => { hook = 0; return BackupControls(); };
  const button = (label: string) => elements(render()).find((node) => node.type === "button" && node.props.children === label);

  button(i18n.t("en").backupExport)!.props.onClick!();
  assert.match(downloadName, /^balram-farm-backup-.*\.json$/);
  const raw = await downloaded!.text();
  const envelope = JSON.parse(raw);
  assert.equal(envelope.version, 6);
  assert.deepEqual(envelope.farm, persistedSlice(sourceState()));
  assert.equal(Object.keys(envelope.farm.farmStash).length, 2);
  assert.equal(sourceState().profiles.length, 3);

  const allImports = createBalramStore();
  await allImports.initialize();
  getState = allImports.store.getState;
  cells.clear();
  async function importFile(contents: string) {
    const input = { files: [new File([contents], "farms.json")], value: "farms.json" };
    elements(render()).find((node) => node.type === "input")!.props.onChange!({ currentTarget: input });
    assert.equal(input.value, "");
    await new Promise<void>((resolve) => setImmediate(resolve));
    return renderToStaticMarkup(render());
  }

  const full = await importFile(raw);
  assert.match(full, /Added 3 farms\./);
  assert.ok(full.includes("Hill Field"));
  const fullyImported = allImports.store.getState();
  for (const [index, imported] of fullyImported.profiles.entries()) {
    const original = sourceState().profiles[index];
    const originalSlice = original.id === envelope.farm.activeProfileId
      ? envelope.farm : envelope.farm.farmStash[original.id];
    const importedSlice = imported.id === fullyImported.activeProfileId
      ? fullyImported : fullyImported.farmStash[imported.id];
    assert.deepEqual(importedSlice.cropAllocations, originalSlice.cropAllocations);
    assert.deepEqual(importedSlice.soilKitReading, originalSlice.soilKitReading);
  }

  getState = targetState;
  cells.clear();
  const feedback = await importFile(raw);
  assert.match(feedback, /role="status"/);
  assert.match(feedback, /Added 2\. Skipped 1/);
  assert.ok(feedback.includes("River Field (2)"));
  assert.ok(feedback.includes("Well Field"));
  const finalState = targetState();
  assert.equal(finalState.activeProfileId, beforeImport.activeProfileId);
  assert.deepEqual(extractFarmSlice(finalState), extractFarmSlice(beforeImport));
  assert.deepEqual(finalState.profiles.slice(0, 4), beforeImport.profiles);
  assert.equal(finalState.profiles.length, 6);
  for (const [index, imported] of finalState.profiles.slice(4).entries()) {
    const original = sourceState().farmStash[sourceState().profiles[index].id];
    const saved = finalState.farmStash[imported.id];
    assert.equal(imported.origin, "imported");
    assert.deepEqual(saved.cropAllocations, original.cropAllocations);
    assert.deepEqual(saved.soilKitReading, original.soilKitReading);
  }

  targetState().setLocale("mr");
  const capped = await importFile(raw);
  assert.match(capped, /या उपकरणावर आधीच सहा शेते असल्यामुळे ३ वगळली/);
  assert.doesNotMatch(capped, /\{[01]\}/);
  const empty = await importFile(backups.serializeFarmBackup(fixtures.createEmptyFixture(), timestamp));
  assert.ok(empty.includes(i18n.t("mr").backupImportEmpty));
});

test("profile views and the store-free ribbon render bilingual HTML without a browser or inline styles", () => {
  let snapshot: domain.PersistedFarm & { hydrated: boolean } = { ...fixtures.createEmptyFixture(), hydrated: false };
  const shared = {
    "@/config/i18n": i18n, "@/config/cropMatrix": cropMatrix,
    "@/lib/domain/profileNames": profileNames, "@/lib/domain/areaConversion": areaConversion,
    "@/lib/domain/landUnits": landUnits, "@/lib/domain/profiles": { summarizeProfile },
    "@/lib/ui/format": format, "@/lib/ui/useCssVar": cssVar, "@/types/domain": domain,
    "@/mocks/fixtures": fixtures,
  };
  const store = { "@/store/useBalramStore": { useBalramStore: (select: (value: typeof snapshot) => unknown) => select(snapshot) } };
  const strokes = loadComponent("viz/ProvenanceStroke.tsx", shared);
  const ribbon = loadComponent<{ MiniFarmRibbon: react.ComponentType<{ segments: ReturnType<typeof summarizeProfile>["segments"]; plotCount: number; locale: domain.Locale }> }>("profiles/MiniFarmRibbon.tsx", {
    ...shared, "@/components/viz/ProvenanceStroke": strokes,
  });
  const sprout = loadComponent("profiles/SproutMark.tsx", shared);
  const dialog = loadComponent("profiles/FarmDialog.tsx", shared);
  const details = loadComponent("profiles/farmCardDetails.ts", shared);
  const provenance = loadComponent("ui/ProvenanceBadge.tsx", shared);
  const { NameFarmView } = loadComponent<{ NameFarmView: react.ComponentType<{ onBack: () => void; onCreated: () => void }> }>(
    "profiles/NameFarmView.tsx", { ...shared, ...store, "./SproutMark": sprout });
  const { MyFarmsView } = loadComponent<{ MyFarmsView: react.ComponentType<{ onNew: () => void; onOpen: () => void; onDeleted: () => void }> }>(
    "profiles/MyFarmsView.tsx", { ...shared, ...store, "./FarmDialog": dialog, "./farmCardDetails": details, "./MiniFarmRibbon": ribbon, "@/components/ui/ProvenanceBadge": provenance });
  const { FarmSwitcher } = loadComponent<{ FarmSwitcher: react.ComponentType }>(
    "profiles/FarmSwitcher.tsx", { ...shared, ...store, "./FarmDialog": dialog, "./farmCardDetails": details, "./SproutMark": sprout });

  const noop = () => {};
  const switcher = () => renderToStaticMarkup(react.createElement(FarmSwitcher));
  assert.equal(switcher(), "");
  for (const locale of ["en", "mr"] as const) {
    const text = i18n.t(locale).profiles;
    const sample = fixtures.createSampleFixture();
    const meta: domain.ProfileMeta = { id: "example", name: text.sampleName, origin: "sample_copy", createdAt: timestamp, updatedAt: timestamp };
    snapshot = { ...sample, locale, hydrated: true, sampleDataActive: false, weatherSnapshot: null, profiles: [meta], activeProfileId: meta.id };
    const name = renderToStaticMarkup(react.createElement(NameFarmView, { onBack: noop, onCreated: noop }));
    const gallery = renderToStaticMarkup(react.createElement(MyFarmsView, { onNew: noop, onOpen: noop, onDeleted: noop }));
    const details = summarizeProfile(meta, extractFarmSlice(sample));
    const mini = renderToStaticMarkup(react.createElement(ribbon.MiniFarmRibbon, { segments: details.segments, plotCount: 2, locale }));
    assert.ok(name.includes(text.nameTitle) && name.includes(text.suggestions.well));
    assert.ok(gallery.includes(text.title) && gallery.includes(text.origin.sample_copy));
    assert.ok(gallery.includes(meta.name));
    const switcherHtml = switcher();
    assert.ok(switcherHtml.includes(text.manage));
    assert.match(switcherHtml, /aria-haspopup="dialog" aria-controls="([^"]+)".*<dialog id="\1"/);
    assert.ok(mini.includes(text.ribbon));
    assert.match(mini, /<rect[^>]*fill="url\(#mini-farm-.*pat-stripes\)"/);
    for (const markup of [name, gallery, switcherHtml, mini]) assert.doesNotMatch(markup, /\sstyle=/);
  }

  const source = (file: string) => readFileSync(new URL(`../src/components/${file}`, import.meta.url), "utf8");
  const vizFiles = readdirSync(new URL("../src/components/viz", import.meta.url)).filter((file) => file.endsWith(".tsx"));
  for (const file of ["profiles/MiniFarmRibbon.tsx", ...vizFiles.map((file) => `viz/${file}`)]) {
    assert.doesNotMatch(source(file), /useBalramStore|from\s+["'][^"']*\/store\//, file);
  }
  assert.match(source("report/FarmReport.tsx"), /<p className="[^"]*\[overflow-wrap:anywhere\][^"]*">\{state\.farmProfile\?\.name/);
});
