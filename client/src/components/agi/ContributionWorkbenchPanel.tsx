import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import type {
  ContributionDraftRecord,
  TruthFunctionDraftRecord,
} from "@shared/contributions/contribution-storage.schema";
import type {
  ContributionKind,
  PrivacyShareLevel,
  TruthFunctionStage,
} from "@shared/contributions/contributions.schema";
import {
  createContributionReceipt,
  fetchContributionDrafts,
  fetchContributionReceipts,
  ingestContribution,
  mintContributionReceipt,
  reviewContributionReceipt,
  revokeContributionReceipt,
  verifyContributionDraft,
  type ContributionReceiptDisclosure,
  type ReceiptStatus,
} from "@/lib/agi/contributions";

type ReceiptFilter = ReceiptStatus | "all";

const CONTRIBUTION_KINDS: ContributionKind[] = [
  "truth-correction",
  "test-case",
  "protocol",
  "local-context",
  "interpretation",
];

const TRUTH_STAGES: TruthFunctionStage[] = [
  "exploratory",
  "reduced-order",
  "diagnostic",
  "certified",
];

const SHARE_LEVELS: PrivacyShareLevel[] = ["local", "partial", "public"];

const RECEIPT_FILTERS: Array<{ label: string; value: ReceiptFilter }> = [
  { label: "All", value: "all" },
  { label: "Cooldown", value: "cooldown" },
  { label: "Minted", value: "minted" },
  { label: "Revoked", value: "revoked" },
  { label: "Rejected", value: "rejected" },
];

const formatTimestamp = (value?: string) => {
  if (!value) return "n/a";
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleString() : value;
};

const formatOptional = (value?: string | null) => {
  if (!value) return "n/a";
  const trimmed = value.trim();
  return trimmed.length ? trimmed : "n/a";
};

const formatFlag = (value?: boolean) => {
  if (value === undefined) return "n/a";
  return value ? "yes" : "no";
};

const formatBytes = (value: number) => {
  if (!Number.isFinite(value)) return "0 B";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

const toPreview = (value: string, limit = 120) => {
  const trimmed = value.trim();
  if (trimmed.length <= limit) return trimmed || "Untitled draft";
  return `${trimmed.slice(0, Math.max(0, limit - 3))}...`;
};

const parseNodeIds = (raw: string): string[] => {
  const nodes = raw
    .split(/[\n,]+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return Array.from(new Set(nodes));
};

const formatCooldown = (cooldown?: { startsAt: string; endsAt: string }) => {
  if (!cooldown) return "n/a";
  return `${formatTimestamp(cooldown.startsAt)} to ${formatTimestamp(cooldown.endsAt)}`;
};

const upsertById = <T extends { id: string }>(items: T[], next: T): T[] => {
  const index = items.findIndex((item) => item.id === next.id);
  if (index < 0) {
    return [next, ...items];
  }
  const updated = items.slice();
  updated[index] = next;
  return updated;
};

export default function ContributionWorkbenchPanel() {
  const [activeTab, setActiveTab] = useState<"drafts" | "receipts">("drafts");
  const [drafts, setDrafts] = useState<ContributionDraftRecord[]>([]);
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [draftIncludeAll, setDraftIncludeAll] = useState(false);
  const [draftLimitInput, setDraftLimitInput] = useState("60");
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [lastDraftLoadedAt, setLastDraftLoadedAt] = useState<number | null>(
    null,
  );

  const [draftText, setDraftText] = useState("");
  const [draftNodeIdsInput, setDraftNodeIdsInput] = useState("");
  const [draftContributorId, setDraftContributorId] = useState("");
  const [draftKind, setDraftKind] =
    useState<ContributionKind>("truth-correction");
  const [draftStage, setDraftStage] =
    useState<TruthFunctionStage>("exploratory");
  const [allowUnknownRefs, setAllowUnknownRefs] = useState(false);
  const [draftIngesting, setDraftIngesting] = useState(false);
  const [draftIngestError, setDraftIngestError] = useState<string | null>(null);
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);
  const [evidenceNote, setEvidenceNote] = useState("");

  const [verifyBusy, setVerifyBusy] = useState(false);

  const [receiptShareLevel, setReceiptShareLevel] =
    useState<PrivacyShareLevel>("local");
  const [receiptCooldownDays, setReceiptCooldownDays] = useState("30");
  const [receiptVcu, setReceiptVcu] = useState("1");
  const [receiptCapped, setReceiptCapped] = useState(true);
  const [receiptBusy, setReceiptBusy] = useState(false);

  const [receipts, setReceipts] = useState<ContributionReceiptDisclosure[]>([]);
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [receiptIncludeAll, setReceiptIncludeAll] = useState(false);
  const [receiptLimitInput, setReceiptLimitInput] = useState("80");
  const [receiptFilter, setReceiptFilter] = useState<ReceiptFilter>("cooldown");
  const [selectedReceiptId, setSelectedReceiptId] = useState<string | null>(
    null,
  );
  const [lastReceiptLoadedAt, setLastReceiptLoadedAt] = useState<number | null>(
    null,
  );

  const [reviewDecision, setReviewDecision] = useState<"approve" | "reject">(
    "approve",
  );
  const [reviewNotes, setReviewNotes] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);
  const [revokeReason, setRevokeReason] = useState("");
  const [revokeBusy, setRevokeBusy] = useState(false);
  const [mintBusy, setMintBusy] = useState(false);

  const draftLimit = Number.parseInt(draftLimitInput, 10);
  const receiptLimit = Number.parseInt(receiptLimitInput, 10);

  const loadDrafts = useCallback(async () => {
    setDraftLoading(true);
    setDraftError(null);
    try {
      const payload = await fetchContributionDrafts({
        includeAll: draftIncludeAll,
        limit: Number.isFinite(draftLimit) ? draftLimit : undefined,
      });
      setDrafts(payload);
      setLastDraftLoadedAt(Date.now());
    } catch (err) {
      setDraftError(err instanceof Error ? err.message : String(err));
    } finally {
      setDraftLoading(false);
    }
  }, [draftIncludeAll, draftLimit]);

  const loadReceipts = useCallback(async () => {
    setReceiptLoading(true);
    setReceiptError(null);
    try {
      const payload = await fetchContributionReceipts({
        includeAll: receiptIncludeAll,
        limit: Number.isFinite(receiptLimit) ? receiptLimit : undefined,
        status: receiptFilter,
      });
      setReceipts(payload);
      setLastReceiptLoadedAt(Date.now());
    } catch (err) {
      setReceiptError(err instanceof Error ? err.message : String(err));
    } finally {
      setReceiptLoading(false);
    }
  }, [receiptIncludeAll, receiptLimit, receiptFilter]);

  useEffect(() => {
    void loadDrafts();
  }, [loadDrafts]);

  useEffect(() => {
    void loadReceipts();
  }, [loadReceipts]);

  useEffect(() => {
    if (!drafts.length) {
      setSelectedDraftId(null);
      return;
    }
    if (
      !selectedDraftId ||
      !drafts.some((draft) => draft.id === selectedDraftId)
    ) {
      setSelectedDraftId(drafts[0].id);
    }
  }, [drafts, selectedDraftId]);

  useEffect(() => {
    if (!receipts.length) {
      setSelectedReceiptId(null);
      return;
    }
    if (
      !selectedReceiptId ||
      !receipts.some((receipt) => receipt.id === selectedReceiptId)
    ) {
      setSelectedReceiptId(receipts[0].id);
    }
  }, [receipts, selectedReceiptId]);

  const selectedDraft = useMemo(
    () => drafts.find((draft) => draft.id === selectedDraftId) ?? null,
    [drafts, selectedDraftId],
  );

  const selectedReceipt = useMemo(
    () => receipts.find((receipt) => receipt.id === selectedReceiptId) ?? null,
    [receipts, selectedReceiptId],
  );

  const receiptSummary = useMemo(() => {
    const summary = {
      total: receipts.length,
      cooldown: 0,
      minted: 0,
      revoked: 0,
      rejected: 0,
      reviewPending: 0,
    };
    for (const receipt of receipts) {
      if (receipt.status === "cooldown") summary.cooldown += 1;
      if (receipt.status === "minted") summary.minted += 1;
      if (receipt.status === "revoked") summary.revoked += 1;
      if (receipt.status === "rejected") summary.rejected += 1;
      if (receipt.reviewSummary && !receipt.reviewSummary.ok) {
        summary.reviewPending += 1;
      }
    }
    return summary;
  }, [receipts]);

  const handleEvidenceFiles = (files: FileList | null) => {
    if (!files) {
      setEvidenceFiles([]);
      return;
    }
    setEvidenceFiles(Array.from(files));
  };

  const handleIngest = async () => {
    const text = draftText.trim();
    const nodeIds = parseNodeIds(draftNodeIdsInput);
    if (!text) {
      setDraftIngestError("Contribution text is required.");
      return;
    }
    if (!nodeIds.length) {
      setDraftIngestError("Provide at least one node ID.");
      return;
    }
    setDraftIngestError(null);
    setDraftIngesting(true);
    try {
      const draft = await ingestContribution({
        text,
        nodeIds,
        contributorId: draftContributorId.trim() || undefined,
        kind: draftKind,
        stage: draftStage,
        allowUnknownRefs,
      });
      setDrafts((prev) => upsertById(prev, draft));
      setSelectedDraftId(draft.id);
      setDraftText("");
      setDraftNodeIdsInput("");
      setDraftContributorId("");
      setEvidenceFiles([]);
      setEvidenceNote("");
      toast({
        title: "Draft created",
        description: `Draft ${draft.id} saved.`,
      });
    } catch (err) {
      setDraftIngestError(err instanceof Error ? err.message : String(err));
    } finally {
      setDraftIngesting(false);
    }
  };

  const handleVerify = async () => {
    if (!selectedDraft) return;
    setVerifyBusy(true);
    try {
      const updated = await verifyContributionDraft(selectedDraft.id, {
        allowUnknownRefs,
      });
      setDrafts((prev) => upsertById(prev, updated));
      toast({
        title: "Verification complete",
        description: updated.verification?.ok ? "Pass" : "Fail",
      });
    } catch (err) {
      toast({
        title: "Verification failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setVerifyBusy(false);
    }
  };

  const handleCreateReceipt = async () => {
    if (!selectedDraft?.verification) {
      toast({
        title: "Verification required",
        description: "Run verification before minting a receipt.",
        variant: "destructive",
      });
      return;
    }
    setReceiptBusy(true);
    try {
      const cooldownDays = Number.parseInt(receiptCooldownDays, 10);
      const vcu = Number.parseFloat(receiptVcu);
      const payload = await createContributionReceipt(selectedDraft.id, {
        shareLevel: receiptShareLevel,
        cooldownDays: Number.isFinite(cooldownDays) ? cooldownDays : undefined,
        vcu: Number.isFinite(vcu) ? vcu : undefined,
        capped: receiptCapped,
      });
      const receipt = payload.receipt;
      if (receipt) {
        setReceipts((prev) => upsertById(prev, receipt));
        setSelectedReceiptId(receipt.id);
        toast({
          title: "Receipt created",
          description: `Receipt ${receipt.id} stored.`,
        });
      } else {
        toast({
          title: "Receipt created",
          description: "Receipt stored without disclosure payload.",
        });
      }
    } catch (err) {
      toast({
        title: "Receipt create failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setReceiptBusy(false);
    }
  };

  const handleReview = async () => {
    if (!selectedReceipt) return;
    setReviewBusy(true);
    try {
      const payload = await reviewContributionReceipt(selectedReceipt.id, {
        decision: reviewDecision,
        notes: reviewNotes.trim() || undefined,
      });
      const receipt = payload.receipt;
      if (receipt) {
        setReceipts((prev) => upsertById(prev, receipt));
      }
      toast({
        title: "Review submitted",
        description: payload.reviewSummary?.ok
          ? "Review requirements met."
          : "Review stored.",
      });
    } catch (err) {
      toast({
        title: "Review failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setReviewBusy(false);
    }
  };

  const handleMint = async () => {
    if (!selectedReceipt) return;
    setMintBusy(true);
    try {
      const payload = await mintContributionReceipt(selectedReceipt.id);
      const receipt = payload.receipt;
      if (receipt) {
        setReceipts((prev) => upsertById(prev, receipt));
      }
      const ledgerOk =
        payload.ledger?.ok ?? receipt?.status === "minted";
      toast({
        title: ledgerOk ? "Minted" : "Mint blocked",
        description: payload.ledger?.reason ?? "Ledger processed.",
      });
    } catch (err) {
      toast({
        title: "Mint failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setMintBusy(false);
    }
  };

  const handleRevoke = async () => {
    if (!selectedReceipt) return;
    setRevokeBusy(true);
    try {
      const payload = await revokeContributionReceipt(
        selectedReceipt.id,
        revokeReason.trim() || undefined,
      );
      const receipt = payload.receipt;
      if (receipt) {
        setReceipts((prev) => upsertById(prev, receipt));
      }
      toast({
        title: "Receipt revoked",
        description: payload.ledger?.reason ?? "Ledger revocation complete.",
      });
    } catch (err) {
      toast({
        title: "Revoke failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setRevokeBusy(false);
    }
  };

  const renderTruthFunction = (entry: TruthFunctionDraftRecord) => {
    const truthFn = entry.truthFunction;
    const compileOk = entry.compilation.ok;
    return (
      <div
        key={truthFn.id}
        className={clsx(
          "rounded border p-3 text-xs",
          compileOk
            ? "border-emerald-500/40 bg-emerald-500/5"
            : "border-rose-500/40 bg-rose-500/5",
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="font-semibold text-slate-100">{truthFn.id}</div>
          <Badge variant={compileOk ? "secondary" : "destructive"}>
            {compileOk ? "compiled" : "compile error"}
          </Badge>
        </div>
        <div className="mt-2 text-slate-300">
          Stage {truthFn.stage} - Status {truthFn.status} - Risk {truthFn.risk}
        </div>
        <div className="mt-2 text-slate-400">
          Predicate {truthFn.predicate.kind}: {truthFn.predicate.ref}
        </div>
        {truthFn.inputs.length > 0 && (
          <div className="mt-2 text-slate-500">
            Inputs{" "}
            {truthFn.inputs
              .map((input) => `${input.kind}:${input.refs.join(",")}`)
              .join(" | ")}
          </div>
        )}
        {!compileOk && entry.compilation.errors?.length ? (
          <div className="mt-2 space-y-1 text-rose-300">
            {entry.compilation.errors.map((error, index) => (
              <div key={`${truthFn.id}-err-${index}`}>
                {error.kind}: {error.message}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
  };

  const canReview =
    selectedReceipt?.status !== "revoked" &&
    selectedReceipt?.status !== "rejected";
  const canMint = selectedReceipt?.status === "cooldown";
  const canRevoke = selectedReceipt?.status !== "revoked";

  return (
    <div className="h-full w-full overflow-auto bg-slate-950/80 p-4 text-slate-100">
      <Card className="border-slate-800 bg-slate-900/60">
        <CardHeader>
          <CardTitle>Contribution Workbench</CardTitle>
          <CardDescription>
            Draft contributions, run verification traces, and review receipts
            that mint VCUs.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs
            value={activeTab}
            onValueChange={(value) =>
              setActiveTab(value as "drafts" | "receipts")
            }
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="drafts">Drafts</TabsTrigger>
              <TabsTrigger value="receipts">Receipts</TabsTrigger>
            </TabsList>

            <TabsContent value="drafts" className="mt-4">
              <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
                <div className="space-y-3">
                  <div className="rounded border border-slate-800/70 bg-slate-950/60 p-3">
                    <div className="flex items-center justify-between">
                      <div className="text-xs uppercase tracking-wide text-slate-400">
                        Drafts
                      </div>
                      {draftLoading && (
                        <Badge variant="secondary">Loading</Badge>
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                      <Button size="sm" variant="outline" onClick={loadDrafts}>
                        Refresh
                      </Button>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={draftIncludeAll}
                          onCheckedChange={(value) =>
                            setDraftIncludeAll(Boolean(value))
                          }
                          id="draft-include-all"
                        />
                        <Label
                          htmlFor="draft-include-all"
                          className="text-xs text-slate-400"
                        >
                          Include all
                        </Label>
                      </div>
                      <Input
                        type="number"
                        value={draftLimitInput}
                        onChange={(event) =>
                          setDraftLimitInput(event.currentTarget.value)
                        }
                        className="h-8 w-20 bg-slate-950/70 text-xs"
                        min={1}
                      />
                    </div>
                    <div className="mt-2 text-[11px] text-slate-500">
                      Last sync:{" "}
                      {lastDraftLoadedAt
                        ? new Date(lastDraftLoadedAt).toLocaleTimeString()
                        : "never"}
                    </div>
                  </div>

                  <ScrollArea className="h-[520px] pr-3">
                    {draftError && (
                      <div className="mb-2 text-xs text-rose-300">
                        {draftError}
                      </div>
                    )}
                    {drafts.length === 0 ? (
                      <div className="text-xs text-slate-500">
                        No drafts yet.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {drafts.map((draft) => {
                          const selected = draft.id === selectedDraftId;
                          const verification = draft.verification;
                          const verificationLabel = verification
                            ? verification.ok
                              ? "verified"
                              : "failed"
                            : "pending";
                          return (
                            <button
                              type="button"
                              key={draft.id}
                              onClick={() => setSelectedDraftId(draft.id)}
                              className={clsx(
                                "w-full rounded border px-3 py-2 text-left text-xs transition",
                                selected
                                  ? "border-emerald-400/60 bg-emerald-500/10"
                                  : "border-slate-800/70 bg-slate-950/60 hover:border-slate-700",
                              )}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="truncate font-semibold text-slate-100">
                                    {draft.id}
                                  </div>
                                  <div className="truncate text-slate-400">
                                    {toPreview(draft.text, 80)}
                                  </div>
                                </div>
                                <div className="flex flex-col items-end gap-1">
                                  <Badge variant="secondary">
                                    {draft.kind ?? "draft"}
                                  </Badge>
                                  <Badge
                                    variant={
                                      verification?.ok
                                        ? "secondary"
                                        : verification
                                          ? "destructive"
                                          : "outline"
                                    }
                                  >
                                    {verificationLabel}
                                  </Badge>
                                </div>
                              </div>
                              <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-500">
                                <span>nodes {draft.nodeIds.length}</span>
                                <span>claims {draft.claims.length}</span>
                                <span>truth {draft.truthFunctions.length}</span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </ScrollArea>
                </div>

                <div className="space-y-4">
                  <div className="rounded border border-slate-800/70 bg-slate-950/60 p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-xs uppercase tracking-wide text-slate-400">
                        New contribution
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={handleIngest}
                        disabled={draftIngesting}
                      >
                        {draftIngesting ? "Saving..." : "Create draft"}
                      </Button>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div>
                        <Label className="text-xs text-slate-400">
                          Contributor ID (optional)
                        </Label>
                        <Input
                          value={draftContributorId}
                          onChange={(event) =>
                            setDraftContributorId(event.currentTarget.value)
                          }
                          placeholder="persona-id"
                          className="mt-1 h-9 bg-slate-950/70 text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-400">
                          Node IDs
                        </Label>
                        <Input
                          value={draftNodeIdsInput}
                          onChange={(event) =>
                            setDraftNodeIdsInput(event.currentTarget.value)
                          }
                          placeholder="verification-checklist,data-dignity"
                          className="mt-1 h-9 bg-slate-950/70 text-sm"
                        />
                      </div>
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <div>
                        <Label className="text-xs text-slate-400">Kind</Label>
                        <Select
                          value={draftKind}
                          onValueChange={(value) =>
                            setDraftKind(value as ContributionKind)
                          }
                        >
                          <SelectTrigger className="mt-1 h-9 bg-slate-950/70 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CONTRIBUTION_KINDS.map((kind) => (
                              <SelectItem key={kind} value={kind}>
                                {kind}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs text-slate-400">
                          Truth stage
                        </Label>
                        <Select
                          value={draftStage}
                          onValueChange={(value) =>
                            setDraftStage(value as TruthFunctionStage)
                          }
                        >
                          <SelectTrigger className="mt-1 h-9 bg-slate-950/70 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {TRUTH_STAGES.map((stage) => (
                              <SelectItem key={stage} value={stage}>
                                {stage}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="mt-3">
                      <Label className="text-xs text-slate-400">
                        Contribution text
                      </Label>
                      <Textarea
                        value={draftText}
                        onChange={(event) =>
                          setDraftText(event.currentTarget.value)
                        }
                        placeholder="Describe the correction, test case, or protocol update."
                        rows={4}
                        className="mt-1 bg-slate-950/70 text-sm"
                      />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                      <Checkbox
                        checked={allowUnknownRefs}
                        onCheckedChange={(value) =>
                          setAllowUnknownRefs(Boolean(value))
                        }
                        id="allow-unknown-refs"
                      />
                      <Label
                        htmlFor="allow-unknown-refs"
                        className="text-xs text-slate-400"
                      >
                        Allow unknown refs in compilation
                      </Label>
                    </div>
                    <div className="mt-4 rounded border border-slate-800/70 bg-slate-950/70 p-3">
                      <div className="text-[11px] uppercase tracking-wide text-slate-500">
                        Evidence uploads (staged locally)
                      </div>
                      <Input
                        type="file"
                        multiple
                        onChange={(event) =>
                          handleEvidenceFiles(event.currentTarget.files)
                        }
                        className="mt-2 h-9 bg-slate-950/70 text-xs"
                      />
                      {evidenceFiles.length > 0 ? (
                        <div className="mt-2 space-y-1 text-[11px] text-slate-400">
                          {evidenceFiles.map((file) => (
                            <div key={file.name}>
                              {file.name} - {formatBytes(file.size)}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="mt-2 text-[11px] text-slate-500">
                          No files selected.
                        </div>
                      )}
                      <Textarea
                        value={evidenceNote}
                        onChange={(event) =>
                          setEvidenceNote(event.currentTarget.value)
                        }
                        placeholder="Optional evidence notes for reviewers."
                        rows={2}
                        className="mt-2 bg-slate-950/70 text-xs"
                      />
                    </div>
                    {draftIngestError && (
                      <div className="mt-2 text-xs text-rose-300">
                        {draftIngestError}
                      </div>
                    )}
                  </div>

                  <div className="rounded border border-slate-800/70 bg-slate-950/60 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs uppercase tracking-wide text-slate-400">
                        Selected draft
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleVerify}
                        disabled={!selectedDraft || verifyBusy}
                      >
                        {verifyBusy ? "Verifying..." : "Run verification"}
                      </Button>
                    </div>
                    {!selectedDraft ? (
                      <div className="mt-3 text-xs text-slate-500">
                        Select a draft to inspect details.
                      </div>
                    ) : (
                      <div className="mt-3 space-y-4 text-xs text-slate-300">
                        <div className="rounded border border-slate-800/70 bg-slate-950/70 p-3">
                          <div className="font-semibold text-slate-100">
                            {selectedDraft.id}
                          </div>
                          <div className="mt-1 text-slate-500">
                            Contributor {selectedDraft.contributorId} - Created{" "}
                            {formatTimestamp(selectedDraft.createdAt)}
                          </div>
                          <div className="mt-2 text-slate-400">
                            Nodes: {selectedDraft.nodeIds.join(", ")}
                          </div>
                          <Textarea
                            readOnly
                            value={selectedDraft.text}
                            rows={4}
                            className="mt-2 bg-slate-950/70 text-xs"
                          />
                        </div>

                        {selectedDraft.claims.length > 0 && (
                          <div className="rounded border border-slate-800/70 bg-slate-950/70 p-3">
                            <div className="text-[11px] uppercase tracking-wide text-slate-500">
                              Claims
                            </div>
                            <div className="mt-2 space-y-2">
                              {selectedDraft.claims.map((claim) => (
                                <div
                                  key={claim.id}
                                  className="rounded border border-slate-800/70 bg-slate-950/80 p-2"
                                >
                                  <div className="text-slate-200">
                                    {claim.text}
                                  </div>
                                  <div className="mt-1 text-[11px] text-slate-500">
                                    {claim.kind ?? "claim"} - {claim.id}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {selectedDraft.truthFunctions.length > 0 && (
                          <div className="rounded border border-slate-800/70 bg-slate-950/70 p-3">
                            <div className="text-[11px] uppercase tracking-wide text-slate-500">
                              Truth functions
                            </div>
                            <div className="mt-2 space-y-2">
                              {selectedDraft.truthFunctions.map(
                                renderTruthFunction,
                              )}
                            </div>
                          </div>
                        )}

                        <div className="rounded border border-slate-800/70 bg-slate-950/70 p-3">
                          <div className="flex items-center justify-between">
                            <div className="text-[11px] uppercase tracking-wide text-slate-500">
                              Verification
                            </div>
                            {selectedDraft.verification ? (
                              <Badge
                                variant={
                                  selectedDraft.verification.ok
                                    ? "secondary"
                                    : "destructive"
                                }
                              >
                                {selectedDraft.verification.ok
                                  ? "pass"
                                  : "fail"}
                              </Badge>
                            ) : (
                              <Badge variant="outline">not run</Badge>
                            )}
                          </div>
                          {selectedDraft.verification ? (
                            <div className="mt-2 space-y-2">
                              <div className="text-slate-400">
                                Mintable{" "}
                                {selectedDraft.verification.mintable
                                  ? "yes"
                                  : "no"}
                              </div>
                              <div className="text-slate-500">
                                Trace ID{" "}
                                {formatOptional(
                                  selectedDraft.verification.traceId,
                                )}
                              </div>
                              <div className="text-slate-500">
                                Certificate required{" "}
                                {formatFlag(
                                  selectedDraft.verification
                                    .certificateRequired,
                                )}
                              </div>
                              <div className="text-slate-500">
                                Certificate ok{" "}
                                {formatFlag(
                                  selectedDraft.verification.certificateOk,
                                )}
                              </div>
                              <div className="text-slate-500">
                                Certificate hash{" "}
                                {formatOptional(
                                  selectedDraft.verification.certificate
                                    ?.certificateHash,
                                )}
                              </div>
                              {selectedDraft.verification.errors?.length ? (
                                <div className="space-y-1 text-rose-300">
                                  {selectedDraft.verification.errors.map(
                                    (error, index) => (
                                      <div key={`verify-error-${index}`}>
                                        {error}
                                      </div>
                                    ),
                                  )}
                                </div>
                              ) : null}
                              {selectedDraft.verification.truthFunctions
                                .length > 0 && (
                                <div className="space-y-1 text-[11px] text-slate-400">
                                  {selectedDraft.verification.truthFunctions.map(
                                    (entry) => (
                                      <div key={entry.truthFunctionId}>
                                        {entry.truthFunctionId} -{" "}
                                        {entry.ok ? "ok" : "fail"}{" "}
                                        {entry.tier ? `tier ${entry.tier}` : ""}{" "}
                                        {entry.risk ? `risk ${entry.risk}` : ""}
                                      </div>
                                    ),
                                  )}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="mt-2 text-slate-500">
                              Run verification to attach trace info and tier
                              mapping.
                            </div>
                          )}
                        </div>

                        <div className="rounded border border-slate-800/70 bg-slate-950/70 p-3">
                          <div className="flex items-center justify-between">
                            <div className="text-[11px] uppercase tracking-wide text-slate-500">
                              Receipt and cooldown
                            </div>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={handleCreateReceipt}
                              disabled={
                                !selectedDraft.verification || receiptBusy
                              }
                            >
                              {receiptBusy ? "Saving..." : "Create receipt"}
                            </Button>
                          </div>
                          <div className="mt-3 grid gap-3 md:grid-cols-2">
                            <div>
                              <Label className="text-xs text-slate-400">
                                Share level
                              </Label>
                              <Select
                                value={receiptShareLevel}
                                onValueChange={(value) =>
                                  setReceiptShareLevel(
                                    value as PrivacyShareLevel,
                                  )
                                }
                              >
                                <SelectTrigger className="mt-1 h-8 bg-slate-950/70 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {SHARE_LEVELS.map((level) => (
                                    <SelectItem key={level} value={level}>
                                      {level}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label className="text-xs text-slate-400">
                                Cooldown (days)
                              </Label>
                              <Input
                                type="number"
                                value={receiptCooldownDays}
                                onChange={(event) =>
                                  setReceiptCooldownDays(
                                    event.currentTarget.value,
                                  )
                                }
                                className="mt-1 h-8 bg-slate-950/70 text-xs"
                              />
                            </div>
                          </div>
                          <div className="mt-3 grid gap-3 md:grid-cols-2">
                            <div>
                              <Label className="text-xs text-slate-400">
                                Planned VCU
                              </Label>
                              <Input
                                type="number"
                                value={receiptVcu}
                                onChange={(event) =>
                                  setReceiptVcu(event.currentTarget.value)
                                }
                                className="mt-1 h-8 bg-slate-950/70 text-xs"
                              />
                            </div>
                            <div className="flex items-center gap-2 pt-6 text-xs text-slate-400">
                              <Checkbox
                                checked={receiptCapped}
                                onCheckedChange={(value) =>
                                  setReceiptCapped(Boolean(value))
                                }
                                id="receipt-capped"
                              />
                              <Label
                                htmlFor="receipt-capped"
                                className="text-xs text-slate-400"
                              >
                                Apply cap
                              </Label>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="receipts" className="mt-4">
              <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
                <div className="space-y-3">
                  <div className="rounded border border-slate-800/70 bg-slate-950/60 p-3">
                    <div className="flex items-center justify-between">
                      <div className="text-xs uppercase tracking-wide text-slate-400">
                        Receipts
                      </div>
                      {receiptLoading && (
                        <Badge variant="secondary">Loading</Badge>
                      )}
                    </div>
                    <div className="mt-3 space-y-2 text-xs">
                      <Select
                        value={receiptFilter}
                        onValueChange={(value) =>
                          setReceiptFilter(value as ReceiptFilter)
                        }
                      >
                        <SelectTrigger className="h-8 bg-slate-950/70 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {RECEIPT_FILTERS.map((filter) => (
                            <SelectItem key={filter.value} value={filter.value}>
                              {filter.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={loadReceipts}
                        >
                          Refresh
                        </Button>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={receiptIncludeAll}
                            onCheckedChange={(value) =>
                              setReceiptIncludeAll(Boolean(value))
                            }
                            id="receipt-include-all"
                          />
                          <Label
                            htmlFor="receipt-include-all"
                            className="text-xs text-slate-400"
                          >
                            Include all
                          </Label>
                        </div>
                        <Input
                          type="number"
                          value={receiptLimitInput}
                          onChange={(event) =>
                            setReceiptLimitInput(event.currentTarget.value)
                          }
                          className="h-8 w-20 bg-slate-950/70 text-xs"
                          min={1}
                        />
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Last sync:{" "}
                        {lastReceiptLoadedAt
                          ? new Date(lastReceiptLoadedAt).toLocaleTimeString()
                          : "never"}
                      </div>
                    </div>
                    <div className="mt-3 rounded border border-slate-800/70 bg-slate-950/70 p-2 text-[11px] text-slate-400">
                      <div>Total {receiptSummary.total}</div>
                      <div>Cooldown {receiptSummary.cooldown}</div>
                      <div>Minted {receiptSummary.minted}</div>
                      <div>Revoked {receiptSummary.revoked}</div>
                      <div>Rejected {receiptSummary.rejected}</div>
                      <div>Review pending {receiptSummary.reviewPending}</div>
                    </div>
                  </div>

                  <ScrollArea className="h-[520px] pr-3">
                    {receiptError && (
                      <div className="mb-2 text-xs text-rose-300">
                        {receiptError}
                      </div>
                    )}
                    {receipts.length === 0 ? (
                      <div className="text-xs text-slate-500">
                        No receipts yet.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {receipts.map((receipt) => {
                          const selected = receipt.id === selectedReceiptId;
                          return (
                            <button
                              type="button"
                              key={receipt.id}
                              onClick={() => setSelectedReceiptId(receipt.id)}
                              className={clsx(
                                "w-full rounded border px-3 py-2 text-left text-xs transition",
                                selected
                                  ? "border-sky-400/60 bg-sky-500/10"
                                  : "border-slate-800/70 bg-slate-950/60 hover:border-slate-700",
                              )}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="truncate font-semibold text-slate-100">
                                    {receipt.id}
                                  </div>
                                  <div className="truncate text-slate-400">
                                    Status {receipt.status}
                                  </div>
                                </div>
                                <Badge
                                  variant={
                                    receipt.status === "minted"
                                      ? "secondary"
                                      : "outline"
                                  }
                                >
                                  {receipt.status}
                                </Badge>
                              </div>
                              <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-500">
                                <span>vcu {receipt.payout?.vcu ?? 0}</span>
                                <span>
                                  nodes {receipt.nodeIds?.length ?? 0}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </ScrollArea>
                </div>

                <div className="space-y-4">
                  <div className="rounded border border-slate-800/70 bg-slate-950/60 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs uppercase tracking-wide text-slate-400">
                        Receipt detail
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={handleMint}
                          disabled={!selectedReceipt || !canMint || mintBusy}
                        >
                          {mintBusy ? "Minting..." : "Mint now"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleRevoke}
                          disabled={
                            !selectedReceipt || !canRevoke || revokeBusy
                          }
                        >
                          {revokeBusy ? "Revoking..." : "Revoke"}
                        </Button>
                      </div>
                    </div>
                    {!selectedReceipt ? (
                      <div className="mt-3 text-xs text-slate-500">
                        Select a receipt to inspect details.
                      </div>
                    ) : (
                      <div className="mt-3 space-y-4 text-xs text-slate-300">
                        <div className="rounded border border-slate-800/70 bg-slate-950/70 p-3">
                          <div className="font-semibold text-slate-100">
                            {selectedReceipt.id}
                          </div>
                          <div className="mt-1 text-slate-500">
                            Status {selectedReceipt.status} - Created{" "}
                            {formatTimestamp(selectedReceipt.createdAt)}
                          </div>
                          <div className="mt-2 text-slate-400">
                            Draft {selectedReceipt.draftId ?? "n/a"}
                          </div>
                          <div className="mt-1 text-slate-400">
                            Contributor{" "}
                            {selectedReceipt.contributorId ??
                              selectedReceipt.contributorRef ??
                              "n/a"}
                          </div>
                          <div className="mt-2 text-slate-500">
                            Cooldown {formatCooldown(selectedReceipt.cooldown)}
                          </div>
                          <div className="mt-1 text-slate-500">
                            Share level{" "}
                            {selectedReceipt.privacy?.shareLevel ?? "n/a"}
                          </div>
                          <div className="mt-1 text-slate-500">
                            Payout VCU {selectedReceipt.payout?.vcu ?? 0}{" "}
                            {selectedReceipt.payout?.capped ? "(capped)" : ""}
                          </div>
                        </div>

                        {selectedReceipt.nodeIds?.length ? (
                          <div className="rounded border border-slate-800/70 bg-slate-950/70 p-3 text-slate-400">
                            Nodes: {selectedReceipt.nodeIds.join(", ")}
                          </div>
                        ) : null}

                        {selectedReceipt.verification ? (
                          <div className="rounded border border-slate-800/70 bg-slate-950/70 p-3">
                            <div className="text-[11px] uppercase tracking-wide text-slate-500">
                              Verification
                            </div>
                            <div className="mt-2 space-y-1 text-slate-400">
                              <div>
                                Verdict {selectedReceipt.verification.verdict}
                              </div>
                              <div>
                                Tier{" "}
                                {selectedReceipt.verification.tier ?? "n/a"}
                              </div>
                              <div>
                                Trace ID{" "}
                                {formatOptional(
                                  selectedReceipt.verification.traceId,
                                )}
                              </div>
                              <div>
                                Certificate{" "}
                                {formatOptional(
                                  selectedReceipt.verification.certificateHash,
                                )}
                              </div>
                              <div>
                                Integrity ok{" "}
                                {formatFlag(
                                  selectedReceipt.verification.integrityOk,
                                )}
                              </div>
                            </div>
                          </div>
                        ) : null}

                        <div className="rounded border border-slate-800/70 bg-slate-950/70 p-3">
                          <div className="flex items-center justify-between">
                            <div className="text-[11px] uppercase tracking-wide text-slate-500">
                              Review status
                            </div>
                            {selectedReceipt.reviewSummary ? (
                              <Badge
                                variant={
                                  selectedReceipt.reviewSummary.ok
                                    ? "secondary"
                                    : "outline"
                                }
                              >
                                {selectedReceipt.reviewSummary.ok
                                  ? "ok"
                                  : "pending"}
                              </Badge>
                            ) : (
                              <Badge variant="outline">n/a</Badge>
                            )}
                          </div>
                          {selectedReceipt.reviewSummary && (
                            <div className="mt-2 text-slate-400">
                              Required {selectedReceipt.reviewSummary.required}{" "}
                              - Approvals{" "}
                              {selectedReceipt.reviewSummary.approvals} -
                              Rejections{" "}
                              {selectedReceipt.reviewSummary.rejections}
                            </div>
                          )}
                          {selectedReceipt.reviews?.length ? (
                            <div className="mt-2 space-y-1 text-[11px] text-slate-500">
                              {selectedReceipt.reviews.map((review) => (
                                <div key={review.id}>
                                  {review.reviewerId} {review.decision}{" "}
                                  {formatTimestamp(review.createdAt)}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="mt-2 text-[11px] text-slate-500">
                              No reviews yet.
                            </div>
                          )}
                        </div>

                        <div className="rounded border border-slate-800/70 bg-slate-950/70 p-3">
                          <div className="text-[11px] uppercase tracking-wide text-slate-500">
                            Submit review
                          </div>
                          <div className="mt-2 grid gap-3 md:grid-cols-2">
                            <div>
                              <Label className="text-xs text-slate-400">
                                Decision
                              </Label>
                              <Select
                                value={reviewDecision}
                                onValueChange={(value) =>
                                  setReviewDecision(
                                    value as "approve" | "reject",
                                  )
                                }
                              >
                                <SelectTrigger className="mt-1 h-8 bg-slate-950/70 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="approve">
                                    approve
                                  </SelectItem>
                                  <SelectItem value="reject">reject</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label className="text-xs text-slate-400">
                                Notes
                              </Label>
                              <Input
                                value={reviewNotes}
                                onChange={(event) =>
                                  setReviewNotes(event.currentTarget.value)
                                }
                                className="mt-1 h-8 bg-slate-950/70 text-xs"
                                placeholder="Optional notes"
                              />
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={handleReview}
                            disabled={
                              !selectedReceipt || !canReview || reviewBusy
                            }
                            className="mt-3"
                          >
                            {reviewBusy ? "Saving..." : "Submit review"}
                          </Button>
                        </div>

                        <div className="rounded border border-slate-800/70 bg-slate-950/70 p-3">
                          <div className="text-[11px] uppercase tracking-wide text-slate-500">
                            Revoke reason
                          </div>
                          <Input
                            value={revokeReason}
                            onChange={(event) =>
                              setRevokeReason(event.currentTarget.value)
                            }
                            placeholder="Reason for revocation"
                            className="mt-2 h-8 bg-slate-950/70 text-xs"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
