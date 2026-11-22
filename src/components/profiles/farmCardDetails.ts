import { t } from "@/config/i18n";
import { formatArea } from "@/lib/domain/landUnits";
import { squareMetresToGunthas } from "@/lib/domain/areaConversion";
import { createEmptyFixture } from "@/mocks/fixtures";
import type { PersistedFarm, ProfileMeta } from "@/types/domain";

const emptyFarm = createEmptyFixture();

export function farmCardDetails(state: PersistedFarm, meta: ProfileMeta) {
  const active = state.activeProfileId === meta.id;
  const stashed = Object.hasOwn(state.farmStash, meta.id) ? state.farmStash[meta.id] : emptyFarm;
  const slice = active ? state : stashed;
  const text = t(state.locale).profiles;
  return {
    ...meta,
    slice,
    setupComplete: slice.setupCompletedAt !== null,
    active,
    area: slice.fieldGeometry?.areaSquareMetres == null
      ? text.areaMissing : formatArea(squareMetresToGunthas(slice.fieldGeometry.areaSquareMetres), state.landUnit, state.locale),
    plots: slice.cropAllocations.length.toLocaleString(state.locale === "mr" ? "mr-IN" : "en-IN"),
  };
}
