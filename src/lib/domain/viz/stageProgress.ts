import { MaharashtraCropMatrix, type CropId } from "@/config/cropMatrix";
import { LifecycleStageSchema, type LifecycleStage } from "@/types/domain";
import { z } from "zod";

const calendarDate = z.string().date();
const WEEK_MS = 7 * 86_400_000;

export function estimateWeeksToNextStage({ cropId, lifecycleStage, plantingDate, todayIso }: {
  cropId: string;
  lifecycleStage: LifecycleStage;
  plantingDate: string | null;
  todayIso: string | null;
}): { weeksRemaining: number; nextStage: LifecycleStage | null } | null {
  if (todayIso === null || !calendarDate.safeParse(todayIso).success || lifecycleStage === "harvesting" ||
      !Object.hasOwn(MaharashtraCropMatrix, cropId)) return null;

  const stages = LifecycleStageSchema.options;
  const index = stages.indexOf(lifecycleStage);
  const nextStage = stages[index + 1];
  const { phaseWeeks } = MaharashtraCropMatrix[cropId as CropId];
  if (plantingDate === null) return { weeksRemaining: phaseWeeks[lifecycleStage], nextStage };
  if (!calendarDate.safeParse(plantingDate).success) return null;

  const stageEndWeeks = stages.slice(0, index + 1).reduce((sum, stage) => sum + phaseWeeks[stage], 0);
  const elapsedWeeks = Math.max(0, (Date.parse(todayIso) - Date.parse(plantingDate)) / WEEK_MS);
  return { weeksRemaining: Math.max(1, Math.ceil(stageEndWeeks - elapsedWeeks)), nextStage };
}
