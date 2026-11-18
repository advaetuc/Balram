import { MaharashtraCropMatrix } from "@/config/cropMatrix";
import type { CropAllocation, LifecycleStage } from "@/types/domain";
import type { SoilKitInterpretation } from "./soilKit";
import { calculatePhaseWaterBreakdown } from "./irrigation";
import { displayPlotName } from "./landUnits";

export type RoadmapBucket = "this_week" | "next_two_weeks" | "later";
export type RoadmapKind = "sowing" | "soil_amendment" | "fertilizer" | "irrigation" | "harvest";
export type ProvenanceTag = "measured_by_kit" | "forecast" | "estimated" | "you_entered" | "assumed";
export interface RoadmapItem {
  readonly id: string;
  readonly bucket: RoadmapBucket;
  readonly kind: RoadmapKind;
  readonly priority: number;
  readonly plotId: string | null;
  readonly title: { readonly en: string; readonly mr: string };
  readonly detail: { readonly en: string; readonly mr: string };
  readonly provenance: ProvenanceTag;
}

type PhaseBreakdown = ReturnType<typeof calculatePhaseWaterBreakdown>;
const phaseName = (stage: LifecycleStage, locale: "en" | "mr") => locale === "en"
  ? ({ planned: "planned", vegetative: "vegetative", flowering_fruiting: "flowering and fruiting", harvesting: "harvesting" } as const)[stage]
  : ({ planned: "नियोजन", vegetative: "वाढ", flowering_fruiting: "फुलोरा व फळधारणा", harvesting: "काढणी" } as const)[stage];

function sowingBucket(todayIso: string, plantingDate: string | null): { bucket: RoadmapBucket; provenance: ProvenanceTag } {
  if (!plantingDate) return { bucket: "next_two_weeks", provenance: "assumed" };
  const daysUntil = Math.ceil((Date.parse(`${plantingDate}T00:00:00Z`) - Date.parse(`${todayIso}T00:00:00Z`)) / 86_400_000);
  return { bucket: daysUntil <= 7 ? "this_week" : daysUntil <= 21 ? "next_two_weeks" : "later", provenance: "you_entered" };
}

function plotName(allocation: CropAllocation): string { return allocation.plotName ?? "Plot"; }
function plotStage(allocation: CropAllocation): LifecycleStage { return allocation.lifecycleStage ?? "planned"; }

/** Creates a prioritized, bilingual plan from farmer inputs and existing domain estimates. */
export function generateRoadmap(input: {
  allocations: readonly CropAllocation[];
  soilInterpretation: SoilKitInterpretation | null;
  waterBreakdownByPlot: Record<string, PhaseBreakdown>;
  todayIso: string;
}): RoadmapItem[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.todayIso) || !Number.isFinite(Date.parse(`${input.todayIso}T00:00:00Z`))) {
    throw new RangeError("todayIso must be a valid YYYY-MM-DD date.");
  }
  const items: RoadmapItem[] = [];
  const add = (item: RoadmapItem) => items.push(item);

  for (const step of input.soilInterpretation?.steps ?? []) {
    if (step.severity === "good") continue;
    const bucket: RoadmapBucket = step.severity === "critical" ? "this_week" : "next_two_weeks";
    const kind: RoadmapKind = step.parameter === "ph" || step.parameter === "salinity" ? "soil_amendment" : "fertilizer";
    add({
      id: `soil:${step.id}`, bucket, kind, priority: step.severity === "critical" ? 1 : 2, plotId: null,
      title: { en: step.badgeLabel.en, mr: step.badgeLabel.mr },
      detail: { en: step.actionStep.en, mr: step.actionStep.mr }, provenance: "measured_by_kit",
    });
  }

  for (const allocation of input.allocations) {
    const name = plotName(allocation);
    const nameMr = displayPlotName(allocation.plotName, "mr");
    const crop = MaharashtraCropMatrix[allocation.cropId as keyof typeof MaharashtraCropMatrix];
    const cropNameEn = crop?.name ?? allocation.cropId;
    const cropNameMr = crop?.marathiName ?? allocation.cropId;
    const stage = plotStage(allocation);
    if (stage === "planned") {
      const timing = sowingBucket(input.todayIso, allocation.plantingDate);
      add({
        id: `sowing:${allocation.plotId ?? allocation.cropId}`, bucket: timing.bucket, kind: "sowing", priority: 3,
        plotId: allocation.plotId ?? null,
        title: { en: `Prepare ${name} for sowing`, mr: `${nameMr} पेरणीसाठी तयार करा` },
        detail: { en: `${cropNameEn} is marked as planned. Check the sowing date and local crop guidance.`, mr: `${cropNameMr} नियोजित आहे. पेरणीची तारीख आणि स्थानिक पीक सल्ला तपासा.` },
        provenance: timing.provenance,
      });
    } else if (stage === "harvesting") {
      add({
        id: `harvest:${allocation.plotId ?? allocation.cropId}`, bucket: "this_week", kind: "harvest", priority: 1,
        plotId: allocation.plotId ?? null,
        title: { en: `Check harvest readiness in ${name}`, mr: `${nameMr} मधील काढणीची तयारी तपासा` },
        detail: { en: `${cropNameEn} is marked as harvesting. Follow local maturity and safe-storage guidance.`, mr: `${cropNameMr} काढणीच्या अवस्थेत आहे. पक्वता आणि सुरक्षित साठवणुकीचा स्थानिक सल्ला पाळा.` },
        provenance: "you_entered",
      });
    }

    const phases = input.waterBreakdownByPlot[allocation.plotId ?? allocation.cropId];
    const phase = phases?.find((entry) => entry.stage === stage) ?? phases?.[0];
    if (phase) {
      const weeklyLitres = phase.weeklyGrossLitres;
      add({
        id: `irrigation:${allocation.plotId ?? allocation.cropId}:${phase.stage}`, bucket: "this_week", kind: "irrigation", priority: 2,
        plotId: allocation.plotId ?? null,
        title: { en: `Plan this week's water for ${name}`, mr: `${nameMr} साठी या आठवड्याच्या पाण्याचे नियोजन करा` },
        detail: { en: `Estimated delivery need is ${weeklyLitres.toFixed(0)} L for the ${phaseName(phase.stage, "en")} phase. Confirm field moisture before irrigating.`, mr: `${phaseName(phase.stage, "mr")} अवस्थेसाठी अंदाजे ${weeklyLitres.toFixed(0)} लिटर पाणी लागेल. सिंचनापूर्वी शेतातील ओलावा तपासा.` },
        provenance: "estimated",
      });
    }
  }

  const bucketRank: Record<RoadmapBucket, number> = { this_week: 0, next_two_weeks: 1, later: 2 };
  return items.sort((a, b) => bucketRank[a.bucket] - bucketRank[b.bucket] || a.priority - b.priority || a.id.localeCompare(b.id));
}
