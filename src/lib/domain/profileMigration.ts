import { PersistedFarmSchema, ProfileMetaSchema, type PersistedFarm, type ProfileMeta } from "@/types/domain";
import { defaultProfileName, fitProfileName, normalizeProfileName } from "./profileNames";

/** Promote an unprofiled legacy farm without using a clock or an ID generator. */
export function upgradeLegacyFarmProfiles(saved: unknown): PersistedFarm {
  const legacy = saved as Partial<PersistedFarm>;
  const locale = legacy.locale ?? "en";
  const oldProfile = legacy.farmProfile;
  const rawName = typeof oldProfile?.name === "string" ? normalizeProfileName(oldProfile.name) : "";
  const oldId = ProfileMetaSchema.shape.id.safeParse(oldProfile?.id);
  const id = oldId.success && oldId.data !== "sample-farm" ? oldId.data : "profile-migrated-1";
  const name = fitProfileName(rawName) || defaultProfileName(locale);
  const farm = PersistedFarmSchema.parse({
    ...legacy,
    farmProfile: oldProfile && typeof oldProfile === "object"
      ? { ...oldProfile, id, name }
      : oldProfile,
    profiles: [],
    activeProfileId: null,
    farmStash: {},
  });
  const hasData = Boolean(farm.fieldGeometry || farm.cropAllocations.length || farm.soilKitReading ||
    farm.checkIns.length || farm.setupCompletedAt || rawName);
  if (!hasData) return { ...farm, farmProfile: null };

  const updatedAt = farm.planningUpdatedAt ?? farm.farmProfile?.updatedAt ?? "2026-01-01T00:00:00+05:30";
  const meta: ProfileMeta = { id, name, createdAt: updatedAt, updatedAt, origin: "blank" };
  return {
    ...farm,
    farmProfile: {
      id, name, district: farm.farmProfile?.district ?? null,
      locale: farm.locale, timezone: "Asia/Kolkata", updatedAt,
    },
    profiles: [meta],
    activeProfileId: id,
  };
}
