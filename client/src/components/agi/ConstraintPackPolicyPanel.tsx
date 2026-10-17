import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";
import type {
  ConstraintPack,
  ConstraintPackConstraint,
  ConstraintPackConstraintOverride,
  ConstraintPackOverride,
  ConstraintPackPolicyProfile,
  ConstraintPackPolicyProfileInput,
} from "@shared/schema";

type ConstraintPackListResponse = {
  packs: ConstraintPack[];
};

type PolicyProfileListResponse = {
  profiles: ConstraintPackPolicyProfile[];
};

type PolicyProfileSaveResponse = {
  profile: ConstraintPackPolicyProfile;
};

const CUSTOMER_STORAGE_KEY = "helix.policy.customerId";
const activeProfileKey = (customerId: string) =>
  `helix.policy.profile.${customerId}`;

const PACKS_PLACEHOLDER = `[
  {
    "packId": "tool-use-budget",
    "constraints": [
      { "id": "step_limit", "max": 12 },
      { "id": "cost_ceiling_usd", "max": 2 }
    ]
  }
]`;

const formatTimestamp = (value?: string) => {
  if (!value) return "n/a";
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime())
    ? parsed.toLocaleString()
    : value;
};

const buildConstraintOverride = (
  constraint: ConstraintPackConstraint,
): ConstraintPackConstraintOverride => {
  const override: ConstraintPackConstraintOverride = { id: constraint.id };
  if (constraint.max !== undefined) override.max = constraint.max;
  if (constraint.min !== undefined) override.min = constraint.min;
  if (constraint.limit !== undefined) override.limit = constraint.limit;
  if (constraint.op) override.op = constraint.op;
  return override;
};

const buildPackTemplate = (pack: ConstraintPack): ConstraintPackOverride => ({
  packId: pack.id,
  constraints: pack.constraints.map(buildConstraintOverride),
});

const normalizeOverrides = (
  raw: string,
): { value?: ConstraintPackOverride[]; error?: string } => {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { error: "Provide at least one pack override." };
  }
  try {
    const parsed = JSON.parse(trimmed);
    const list = Array.isArray(parsed) ? parsed : [parsed];
    if (!list.length) {
      return { error: "Pack overrides cannot be empty." };
    }
    for (const entry of list) {
      if (!entry || typeof entry !== "object") {
        return { error: "Each pack override must be an object." };
      }
      if (!("packId" in entry)) {
        return { error: "Each pack override must include packId." };
      }
    }
    return { value: list as ConstraintPackOverride[] };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid JSON payload.";
    return { error: `Parse error: ${message}` };
  }
};

export default function ConstraintPackPolicyPanel() {
  const queryClient = useQueryClient();
  const [customerId, setCustomerId] = useState("");
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [draftId, setDraftId] = useState("");
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftPacksJson, setDraftPacksJson] = useState("");
  const [draftError, setDraftError] = useState<string | null>(null);
  const [templatePackId, setTemplatePackId] = useState<string>("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedCustomer = window.localStorage.getItem(CUSTOMER_STORAGE_KEY);
    if (storedCustomer) {
      setCustomerId(storedCustomer);
      const storedProfile = window.localStorage.getItem(
        activeProfileKey(storedCustomer),
      );
      if (storedProfile) {
        setSelectedProfileId(storedProfile);
      }
    }
  }, []);

  const normalizedCustomerId = customerId.trim();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (normalizedCustomerId) {
      window.localStorage.setItem(CUSTOMER_STORAGE_KEY, normalizedCustomerId);
    } else {
      window.localStorage.removeItem(CUSTOMER_STORAGE_KEY);
    }
  }, [normalizedCustomerId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!normalizedCustomerId) return;
    const key = activeProfileKey(normalizedCustomerId);
    if (selectedProfileId) {
      window.localStorage.setItem(key, selectedProfileId);
    } else {
      window.localStorage.removeItem(key);
    }
  }, [normalizedCustomerId, selectedProfileId]);

  const packsQuery = useQuery({
    queryKey: ["/api/agi/constraint-packs"],
  });

  const packs =
    (packsQuery.data as ConstraintPackListResponse | undefined)?.packs ?? [];
  const profilesUrl = normalizedCustomerId
    ? `/api/agi/constraint-packs/policies?customerId=${encodeURIComponent(
        normalizedCustomerId,
      )}`
    : null;

  const profilesQuery = useQuery({
    queryKey: profilesUrl ? [profilesUrl] : ["constraint-pack-policies", "disabled"],
    enabled: Boolean(profilesUrl),
  });

  const profiles =
    (profilesQuery.data as PolicyProfileListResponse | undefined)?.profiles ?? [];

  useEffect(() => {
    if (!selectedProfileId) return;
    if (!profiles.some((profile) => profile.id === selectedProfileId)) {
      setSelectedProfileId(null);
    }
  }, [profiles, selectedProfileId]);

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === selectedProfileId) ?? null,
    [profiles, selectedProfileId],
  );

  const saveMutation = useMutation({
    mutationFn: async (payload: ConstraintPackPolicyProfileInput) => {
      const res = await apiRequest(
        "POST",
        "/api/agi/constraint-packs/policies",
        payload,
      );
      return (await res.json()) as PolicyProfileSaveResponse;
    },
    onSuccess: (result) => {
      if (profilesUrl) {
        queryClient.invalidateQueries({ queryKey: [profilesUrl] });
      }
      const profile = result.profile;
      setSelectedProfileId(profile.id);
      setDraftId(profile.id);
      setDraftName(profile.name ?? "");
      setDraftDescription(profile.description ?? "");
      setDraftPacksJson(JSON.stringify(profile.packs, null, 2));
      setDraftError(null);
      toast({
        title: "Policy profile saved",
        description: `Profile ${profile.id} updated.`,
      });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : String(error);
      toast({
        title: "Failed to save profile",
        description: message,
        variant: "destructive",
      });
    },
  });

  const refreshProfiles = () => {
    if (!profilesUrl) {
      setDraftError("Enter a customer ID to load profiles.");
      return;
    }
    profilesQuery.refetch();
  };

  const handleLoadSelected = () => {
    if (!selectedProfile) return;
    setDraftId(selectedProfile.id);
    setDraftName(selectedProfile.name ?? "");
    setDraftDescription(selectedProfile.description ?? "");
    setDraftPacksJson(JSON.stringify(selectedProfile.packs, null, 2));
    setDraftError(null);
  };

  const handleNewDraft = () => {
    setDraftId("");
    setDraftName("");
    setDraftDescription("");
    setDraftPacksJson("");
    setDraftError(null);
  };

  const handleInsertTemplate = (mode: "replace" | "append") => {
    const pack = packs.find((entry) => entry.id === templatePackId);
    if (!pack) {
      setDraftError("Select a pack to create a template.");
      return;
    }
    const template = buildPackTemplate(pack);
    if (mode === "replace") {
      setDraftPacksJson(JSON.stringify([template], null, 2));
      setDraftError(null);
      return;
    }
    if (!draftPacksJson.trim()) {
      setDraftPacksJson(JSON.stringify([template], null, 2));
      setDraftError(null);
      return;
    }
    const normalized = normalizeOverrides(draftPacksJson);
    if (normalized.error) {
      setDraftError(normalized.error);
      return;
    }
    const updated = [...(normalized.value ?? []), template];
    setDraftPacksJson(JSON.stringify(updated, null, 2));
    setDraftError(null);
  };

  const handleCopy = (value: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(value).catch(() => {
        toast({
          title: "Copy failed",
          description: "Clipboard unavailable.",
          variant: "destructive",
        });
      });
      return;
    }
    if (typeof window !== "undefined") {
      window.prompt("Copy value:", value);
    }
  };

  const handleSave = () => {
    if (!normalizedCustomerId) {
      setDraftError("Customer ID is required.");
      return;
    }
    const normalized = normalizeOverrides(draftPacksJson);
    if (normalized.error) {
      setDraftError(normalized.error);
      return;
    }
    const payload: ConstraintPackPolicyProfileInput = {
      ...(draftId.trim() ? { id: draftId.trim() } : {}),
      customerId: normalizedCustomerId,
      name: draftName.trim() || undefined,
      description: draftDescription.trim() || undefined,
      packs: normalized.value ?? [],
    };
    saveMutation.mutate(payload);
  };

  const packOptions = packs.map((pack) => ({
    id: pack.id,
    label: `${pack.id} v${pack.version}`,
  }));

  return (
    <div className="h-full w-full overflow-auto bg-slate-950/80 p-4 text-slate-100">
      <Card className="border-slate-800 bg-slate-900/60">
        <CardHeader>
          <CardTitle>Constraint Pack Policy Profiles</CardTitle>
          <CardDescription>
            Create and select customer policy profiles to override pack budgets and thresholds.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
            <div className="space-y-4">
              <div className="rounded border border-slate-800/70 bg-slate-950/60 p-3">
                <Label className="text-xs uppercase tracking-wide text-slate-400">
                  Customer ID
                </Label>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Input
                    value={customerId}
                    onChange={(event) => setCustomerId(event.currentTarget.value)}
                    placeholder="customer-id"
                    className="h-9 flex-1 bg-slate-950/70 text-sm"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={refreshProfiles}
                    disabled={!normalizedCustomerId || profilesQuery.isFetching}
                  >
                    Refresh
                  </Button>
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  Profiles are scoped per customerId.
                </div>
              </div>

              <div className="rounded border border-slate-800/70 bg-slate-950/60 p-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs uppercase tracking-wide text-slate-400">
                    Profiles
                  </div>
                  {profilesQuery.isFetching && (
                    <Badge variant="secondary">Loading</Badge>
                  )}
                </div>
                <ScrollArea className="mt-3 h-56 pr-3">
                  {profiles.length === 0 ? (
                    <div className="text-xs text-slate-500">
                      {normalizedCustomerId
                        ? "No profiles yet."
                        : "Enter a customer ID to load profiles."}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {profiles.map((profile) => {
                        const isSelected = profile.id === selectedProfileId;
                        return (
                          <div
                            key={profile.id}
                            className={`rounded border px-3 py-2 text-xs ${
                              isSelected
                                ? "border-emerald-400/60 bg-emerald-500/10"
                                : "border-slate-800/70 bg-slate-950/60"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <div className="font-semibold text-slate-100">
                                  {profile.name || "Untitled profile"}
                                </div>
                                <div className="truncate text-slate-500">
                                  {profile.id}
                                </div>
                              </div>
                              <Button
                                variant={isSelected ? "secondary" : "outline"}
                                size="sm"
                                onClick={() => setSelectedProfileId(profile.id)}
                              >
                                {isSelected ? "Selected" : "Select"}
                              </Button>
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                              <span>packs {profile.packs.length}</span>
                              <span>version {profile.version}</span>
                              <span>{formatTimestamp(profile.updatedAt)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </ScrollArea>
                {selectedProfile && (
                  <div className="mt-3 rounded border border-slate-800/70 bg-slate-950/70 p-3 text-xs">
                    <div className="flex items-center justify-between">
                      <div className="text-slate-300">Active profile</div>
                      <Badge variant="secondary">v{selectedProfile.version}</Badge>
                    </div>
                    <div className="mt-2 truncate font-mono text-[11px] text-slate-400">
                      {selectedProfile.id}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleCopy(selectedProfile.id)}
                      >
                        Copy ID
                      </Button>
                      <Button size="sm" variant="secondary" onClick={handleLoadSelected}>
                        Load into draft
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded border border-slate-800/70 bg-slate-950/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs uppercase tracking-wide text-slate-400">
                    Profile draft
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="ghost" onClick={handleNewDraft}>
                      New
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={handleSave}
                      disabled={saveMutation.isPending}
                    >
                      {saveMutation.isPending ? "Saving..." : "Save profile"}
                    </Button>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div>
                    <Label className="text-xs text-slate-400">Profile ID (optional)</Label>
                    <Input
                      value={draftId}
                      onChange={(event) => setDraftId(event.currentTarget.value)}
                      placeholder="auto-generated"
                      className="mt-1 h-9 bg-slate-950/70 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-slate-400">Name</Label>
                    <Input
                      value={draftName}
                      onChange={(event) => setDraftName(event.currentTarget.value)}
                      placeholder="tight-budgets"
                      className="mt-1 h-9 bg-slate-950/70 text-sm"
                    />
                  </div>
                </div>
                <div className="mt-3">
                  <Label className="text-xs text-slate-400">Description</Label>
                  <Input
                    value={draftDescription}
                    onChange={(event) =>
                      setDraftDescription(event.currentTarget.value)
                    }
                    placeholder="Short notes for this policy profile"
                    className="mt-1 h-9 bg-slate-950/70 text-sm"
                  />
                </div>
                <div className="mt-4 rounded border border-slate-800/70 bg-slate-950/70 p-3">
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">
                    Pack template
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Select value={templatePackId} onValueChange={setTemplatePackId}>
                      <SelectTrigger className="h-8 w-[220px] bg-slate-950/70 text-xs">
                        <SelectValue placeholder="Select a pack" />
                      </SelectTrigger>
                      <SelectContent>
                        {packOptions.map((pack) => (
                          <SelectItem key={pack.id} value={pack.id}>
                            {pack.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleInsertTemplate("replace")}
                      disabled={!packOptions.length}
                    >
                      Replace with template
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleInsertTemplate("append")}
                      disabled={!packOptions.length}
                    >
                      Append template
                    </Button>
                  </div>
                  {packOptions.length === 0 && (
                    <div className="mt-2 text-xs text-slate-500">
                      Pack list is unavailable.
                    </div>
                  )}
                </div>
                <div className="mt-4">
                  <Label className="text-xs text-slate-400">Pack overrides JSON</Label>
                  <Textarea
                    value={draftPacksJson}
                    onChange={(event) => setDraftPacksJson(event.currentTarget.value)}
                    placeholder={PACKS_PLACEHOLDER}
                    rows={12}
                    className="mt-2 bg-slate-950/70 text-xs font-mono"
                  />
                  {draftError && (
                    <div className="mt-2 text-xs text-rose-300">{draftError}</div>
                  )}
                </div>
              </div>

              {selectedProfile && (
                <div className="rounded border border-slate-800/70 bg-slate-950/60 p-4 text-xs">
                  <div className="text-xs uppercase tracking-wide text-slate-400">
                    Selected profile details
                  </div>
                  <div className="mt-2 text-slate-300">
                    {selectedProfile.name || "Untitled profile"} · packs{" "}
                    {selectedProfile.packs.length}
                  </div>
                  <div className="mt-2 text-slate-500">
                    Updated {formatTimestamp(selectedProfile.updatedAt)}
                  </div>
                  <div className="mt-3">
                    <Textarea
                      readOnly
                      value={JSON.stringify(selectedProfile.packs, null, 2)}
                      rows={6}
                      className="bg-slate-950/70 text-xs font-mono"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
