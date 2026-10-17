import type {
  EssencePromptProfile,
  EssencePromptVariant,
  EssencePromptVariantList,
} from "@shared/essence-prompts";

export async function fetchPromptProfiles(): Promise<EssencePromptProfile[]> {
  const res = await fetch("/api/essence/prompts/prompt-profiles", { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`prompt_profiles_failed:${res.status}`);
  }
  const payload = (await res.json()) as { profiles?: EssencePromptProfile[] };
  return Array.isArray(payload?.profiles) ? payload.profiles : [];
}

export async function updatePromptProfile(
  id: string,
  patch: Partial<
    Pick<EssencePromptProfile, "name" | "baseTemplate" | "baseScript" | "isActive" | "keywords" | "globs" | "ignore">
  >,
): Promise<EssencePromptProfile> {
  const res = await fetch(`/api/essence/prompts/prompt-profiles/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(msg || `prompt_profile_update_failed:${res.status}`);
  }
  const payload = (await res.json()) as { profile?: EssencePromptProfile };
  if (!payload?.profile) {
    throw new Error("prompt_profile_update_missing_payload");
  }
  return payload.profile;
}

export async function fetchPromptVariants(params?: { profileId?: string; refresh?: boolean }): Promise<EssencePromptVariant[]> {
  const search = new URLSearchParams();
  if (params?.profileId) search.set("profileId", params.profileId);
  if (params?.refresh) search.set("refresh", "1");
  const res = await fetch(`/api/essence/prompts/prompt-variants${search.toString() ? `?${search}` : ""}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(msg || `prompt_variants_failed:${res.status}`);
  }
  const payload = (await res.json()) as EssencePromptVariantList;
  return Array.isArray(payload?.variants) ? payload.variants : [];
}

export async function runPromptVariant(params?: { profileId?: string; targetPaths?: string[] }): Promise<EssencePromptVariant> {
  const res = await fetch("/api/essence/prompts/prompt-variants/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params ?? {}),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(msg || `prompt_variant_run_failed:${res.status}`);
  }
  const payload = (await res.json()) as { variant?: EssencePromptVariant };
  if (!payload?.variant) {
    throw new Error("prompt_variant_run_missing_payload");
  }
  return payload.variant;
}
