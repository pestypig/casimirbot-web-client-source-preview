import React from "react";
import { Badge } from "@/components/ui/badge";
import type { TheoryRuntimeReceiptV1 } from "@shared/contracts/theory-runtime-receipt.v1";

type UnknownRecord = Record<string, unknown>;

type StatusObservation = {
  label: string;
  status: string;
};

type ArtifactSignal = {
  path: string;
  sha256: string | null;
  freshness: string | null;
  evidenceStatus: string | null;
  integrityStatus: string | null;
};

export type RuntimeReceiptStatusLamp = {
  status: string;
  detail: string;
};

export type RuntimeReceiptStatusLampProjection = {
  aggregate: RuntimeReceiptStatusLamp;
  evidence: RuntimeReceiptStatusLamp;
  provenance: RuntimeReceiptStatusLamp;
  certificate: RuntimeReceiptStatusLamp | null;
  gates: StatusObservation[];
  artifacts: ArtifactSignal[];
  concernSummary: string | null;
};

const CERTIFICATE_PATTERN = /(?:certificate|formal|lean)/i;
const PROVENANCE_GATE_PATTERN = /(?:runtime_execution_provenance|runtime_artifact_freshness|provenance|freshness)/i;
const POSITIVE_STATUS_PATTERN = /^(?:pass|passed|ok|valid|verified|complete|completed|computed|solved|fresh|bound|intact)$/;

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeStatus(value: unknown, fallback = "unknown"): string {
  const status = readString(value);
  return status ? status.toLowerCase().replace(/[\s-]+/g, "_") : fallback;
}

function readStatus(recordOrStatus: unknown): string | null {
  const direct = readString(recordOrStatus);
  if (direct) return normalizeStatus(direct);
  const record = asRecord(recordOrStatus);
  if (!record) return null;
  for (const key of [
    "status",
    "verdict",
    "reviewStatus",
    "evidenceStatus",
    "integrityStatus",
    "hashStatus",
    "certificateStatus",
    "bindingStatus",
    "freshnessStatus",
  ]) {
    const status = readString(record[key]);
    if (status) return normalizeStatus(status);
  }
  return null;
}

function statusSeverity(status: string): number {
  const normalized = normalizeStatus(status);
  if (/fail|failed|invalid|corrupt|mismatch|error|rejected/.test(normalized)) return 100;
  if (/stale|outdated|expired/.test(normalized)) return 96;
  if (/blocked|not_ready|unbound|missing/.test(normalized)) return 92;
  if (/review|provisional|conditional/.test(normalized)) return 88;
  if (/unknown|unverified|unreported|not_run|unavailable/.test(normalized)) return 84;
  if (/preexisting/.test(normalized)) return 70;
  if (/running|pending|queued|loaded|created/.test(normalized)) return 45;
  if (/not_applicable|skipped/.test(normalized)) return 20;
  if (POSITIVE_STATUS_PATTERN.test(normalized)) return 0;
  return 80;
}

function isPositiveStatus(status: string): boolean {
  return statusSeverity(status) === 0;
}

function worstObservation(observations: StatusObservation[], fallback = "unknown"): string {
  if (!observations.length) return fallback;
  return observations.reduce((worst, observation) =>
    statusSeverity(observation.status) > statusSeverity(worst) ? observation.status : worst,
  observations[0].status);
}

function statusTone(status: string): string {
  const normalized = normalizeStatus(status);
  if (isPositiveStatus(normalized)) return "border-emerald-700/80 bg-emerald-950/20 text-emerald-100";
  if (/fail|invalid|corrupt|mismatch|error|rejected/.test(normalized)) {
    return "border-rose-700/80 bg-rose-950/30 text-rose-100";
  }
  if (/running|pending|queued|loaded|created/.test(normalized)) {
    return "border-violet-700/80 bg-violet-950/20 text-violet-100";
  }
  if (/not_applicable|skipped/.test(normalized)) return "border-slate-700 bg-slate-950/30 text-slate-300";
  return "border-amber-700/80 bg-amber-950/25 text-amber-100";
}

function readArtifactPath(record: UnknownRecord): string | null {
  for (const key of ["path", "artifactPath", "file", "ref", "outputPath", "pathname"]) {
    const value = readString(record[key]);
    if (value) return value;
  }
  return null;
}

function readArtifactHash(record: UnknownRecord): string | null {
  for (const key of ["sha256", "artifactSha256", "contentSha256", "contentHash", "hash"]) {
    const value = readString(record[key]);
    if (value) return value;
  }
  return null;
}

function readArtifactFreshness(record: UnknownRecord): string | null {
  for (const key of ["freshness", "freshnessStatus", "classification", "changeStatus"]) {
    const value = readString(record[key]);
    if (value) return normalizeStatus(value);
  }
  return null;
}

function readArtifactEvidenceStatus(record: UnknownRecord): string | null {
  for (const key of ["evidenceStatus", "reviewStatus", "verdict", "status"]) {
    const value = readString(record[key]);
    if (value) return normalizeStatus(value);
  }
  return null;
}

function readArtifactIntegrityStatus(record: UnknownRecord): string | null {
  for (const key of ["integrityStatus", "hashStatus"]) {
    const value = readString(record[key]);
    if (value) return normalizeStatus(value);
  }
  const integrity = record.integrity;
  const direct = readString(integrity);
  if (direct) return normalizeStatus(direct);
  return readStatus(integrity);
}

function mergeArtifactSignal(target: ArtifactSignal[], signal: ArtifactSignal): void {
  const existing = target.find((candidate) => candidate.path === signal.path);
  if (!existing) {
    target.push(signal);
    return;
  }
  existing.sha256 ??= signal.sha256;
  existing.freshness ??= signal.freshness;
  existing.evidenceStatus ??= signal.evidenceStatus;
  existing.integrityStatus ??= signal.integrityStatus;
}

function addArtifactValues(target: ArtifactSignal[], value: unknown): void {
  if (!Array.isArray(value)) return;
  for (const entry of value) {
    const path = readString(entry);
    if (path) {
      mergeArtifactSignal(target, {
        path,
        sha256: null,
        freshness: null,
        evidenceStatus: null,
        integrityStatus: null,
      });
      continue;
    }
    const record = asRecord(entry);
    if (!record) continue;
    const recordPath = readArtifactPath(record);
    if (!recordPath) continue;
    mergeArtifactSignal(target, {
      path: recordPath,
      sha256: readArtifactHash(record),
      freshness: readArtifactFreshness(record),
      evidenceStatus: readArtifactEvidenceStatus(record),
      integrityStatus: readArtifactIntegrityStatus(record),
    });
  }
}

function collectArtifacts(receipt: UnknownRecord): ArtifactSignal[] {
  const artifacts: ArtifactSignal[] = [];
  const outputs = asRecord(receipt.outputs);
  const provenance = asRecord(receipt.provenance);
  const manifest = asRecord(outputs?.artifactManifest) ?? asRecord(receipt.artifactManifest);
  const outputManifest = asRecord(outputs?.outputManifest) ?? asRecord(receipt.outputManifest);

  addArtifactValues(artifacts, outputs?.artifacts);
  for (const value of [
    outputs?.artifactRecords,
    outputs?.artifactDetails,
    outputs?.artifactEvidence,
    manifest?.entries,
    outputManifest?.entries,
    outputManifest?.artifacts,
    provenance?.artifacts,
  ]) {
    addArtifactValues(artifacts, value);
  }
  return artifacts;
}

function collectGates(receipt: UnknownRecord): StatusObservation[] {
  const outputs = asRecord(receipt.outputs);
  const gates = asRecord(outputs?.gates);
  if (!gates) return [];
  return Object.entries(gates).map(([label, value]) => ({
    label,
    status: readStatus(value) ?? "unknown",
  }));
}

function summarizeObservations(observations: StatusObservation[], limit = 3): string | null {
  const concerns = observations.filter((observation) => !isPositiveStatus(observation.status));
  if (!concerns.length) return null;
  return concerns.slice(0, limit).map((observation) => `${observation.label} ${observation.status}`).join("; ");
}

function projectEvidenceLamp(gates: StatusObservation[], artifacts: ArtifactSignal[]): RuntimeReceiptStatusLamp {
  const artifactObservations: StatusObservation[] = [];
  for (const artifact of artifacts) {
    if (artifact.evidenceStatus) artifactObservations.push({ label: artifact.path, status: artifact.evidenceStatus });
    if (artifact.integrityStatus && !isPositiveStatus(artifact.integrityStatus)) {
      artifactObservations.push({ label: `${artifact.path} integrity`, status: artifact.integrityStatus });
    }
  }
  const observations = [...gates, ...artifactObservations];
  const status = observations.length
    ? worstObservation(observations)
    : artifacts.length
      ? "unknown"
      : "unavailable";
  const concern = summarizeObservations(observations);
  const detail = [
    `${artifacts.length} artifact${artifacts.length === 1 ? "" : "s"}`,
    `${gates.length} gate${gates.length === 1 ? "" : "s"}`,
    concern,
  ].filter(Boolean).join(" · ");
  return { status, detail };
}

function collectStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(readString).filter((item): item is string => Boolean(item)) : [];
}

function projectProvenanceLamp(receipt: UnknownRecord, artifacts: ArtifactSignal[]): RuntimeReceiptStatusLamp {
  const outputs = asRecord(receipt.outputs);
  const provenance = asRecord(receipt.provenance);
  const execution = asRecord(receipt.execution);
  const manifest = asRecord(outputs?.artifactManifest) ?? asRecord(receipt.artifactManifest);
  const claimBoundary = asRecord(receipt.claimBoundary);
  const blockers = [
    ...collectStringArray(outputs?.missingSignals),
    ...collectStringArray(outputs?.warnings),
    ...collectStringArray(claimBoundary?.promotionBlockedBy),
  ];
  const explicitStatuses: StatusObservation[] = [];
  for (const [label, value] of [
    ["provenance", provenance?.status],
    ["provenance binding", provenance?.bindingStatus],
    ["provenance freshness", provenance?.freshnessStatus],
    ["manifest", manifest?.status],
    ["manifest binding", manifest?.bindingStatus],
  ] as const) {
    const status = readString(value);
    if (status) explicitStatuses.push({ label, status: normalizeStatus(status) });
  }
  const outputGates = asRecord(outputs?.gates);
  for (const [gateId, value] of Object.entries(outputGates ?? {})) {
    if (!PROVENANCE_GATE_PATTERN.test(gateId)) continue;
    const status = readStatus(value);
    if (status) explicitStatuses.push({ label: gateId, status });
  }

  if (normalizeStatus(receipt.status) === "stale" || explicitStatuses.some(({ status }) => /stale|outdated/.test(status))) {
    return { status: "stale", detail: "Receipt or provenance explicitly reports stale runtime evidence." };
  }
  if (blockers.some((blocker) => /(?:runtime_artifact_freshness_unbound|provenance[^;]*unbound|freshness[^;]*unbound)/i.test(blocker))) {
    return { status: "unbound", detail: "Runtime artifact freshness is explicitly unbound." };
  }

  const missing: string[] = [];
  if (!readString(provenance?.gitSha)) missing.push("git SHA");
  if (!readString(provenance?.startedAt)) missing.push("start time");
  if (!readString(provenance?.completedAt)) missing.push("end time");
  if (readNumber(provenance?.durationMs) === null) missing.push("duration");
  if (!execution) {
    missing.push("execution record");
  } else {
    if (!readString(execution.command)) missing.push("executed command");
    if (!readString(execution.cwd)) missing.push("working directory");
    if (execution.outputDirectoryBound !== true || !readString(execution.outputDirectory)) {
      missing.push("execution output binding");
    }
  }
  if (!manifest) {
    missing.push("run manifest");
  } else {
    if (manifest.boundToExecution !== true) missing.push("manifest execution binding");
    if (!readString(manifest.requestId)) missing.push("manifest request ID");
    if (!readString(manifest.manifestPath)) missing.push("manifest path");
    if (!readString(manifest.manifestSha256)) missing.push("manifest SHA-256");
    if (!readString(manifest.outputDirectory)) missing.push("manifest output directory");
    if (!readString(manifest.gitSha) || manifest.gitSha !== provenance?.gitSha) missing.push("manifest git binding");
    if (!readString(manifest.startedAt) || manifest.startedAt !== provenance?.startedAt) missing.push("manifest start binding");
    if (!readString(manifest.completedAt) || manifest.completedAt !== provenance?.completedAt) missing.push("manifest end binding");
    if (readString(manifest.runtimeId) !== readString(receipt.runtimeId)) missing.push("manifest runtime binding");
    if (
      execution &&
      readString(manifest.outputDirectory) !== readString(execution.outputDirectory)
    ) {
      missing.push("output directory agreement");
    }
  }
  const entries = Array.isArray(manifest?.entries) ? manifest.entries : [];
  if (artifacts.length > 0 && entries.length === 0) missing.push("manifest entries");
  if (artifacts.some((artifact) => !artifact.sha256)) missing.push("artifact SHA-256");
  if (artifacts.some((artifact) => !artifact.freshness)) missing.push("artifact freshness");
  const outputDirectory = readString(manifest?.outputDirectory);
  if (outputDirectory) {
    const normalizedRoot = outputDirectory.replace(/\\/g, "/").replace(/\/+$/, "");
    if (artifacts.some((artifact) => {
      const normalizedPath = artifact.path.replace(/\\/g, "/");
      return normalizedPath !== normalizedRoot && !normalizedPath.startsWith(`${normalizedRoot}/`);
    })) {
      missing.push("artifact output-boundary agreement");
    }
  }

  const explicitWorst = explicitStatuses.length ? worstObservation(explicitStatuses, "bound") : "bound";
  if (missing.length) {
    const uniqueMissing = Array.from(new Set(missing));
    return {
      status: "unbound",
      detail: `Missing ${uniqueMissing.slice(0, 4).join(", ")}${uniqueMissing.length > 4 ? ` +${uniqueMissing.length - 4}` : ""}.`,
    };
  }
  if (!isPositiveStatus(explicitWorst)) {
    return { status: explicitWorst, detail: `Provenance explicitly reports ${explicitWorst}.` };
  }

  const freshnessCounts = artifacts.reduce<Record<string, number>>((counts, artifact) => {
    if (artifact.freshness) counts[artifact.freshness] = (counts[artifact.freshness] ?? 0) + 1;
    return counts;
  }, {});
  if ((freshnessCounts.preexisting ?? 0) > 0) {
    return {
      status: "preexisting",
      detail: `Execution-bound manifest; ${freshnessCounts.preexisting} preexisting artifact${freshnessCounts.preexisting === 1 ? "" : "s"}.`,
    };
  }
  if (artifacts.length > 0 && artifacts.every((artifact) => artifact.freshness === "new" || artifact.freshness === "changed")) {
    return {
      status: "fresh",
      detail: `Execution-bound manifest; ${freshnessCounts.new ?? 0} new / ${freshnessCounts.changed ?? 0} changed.`,
    };
  }
  return { status: "bound", detail: "Execution identity and run manifest are bound." };
}

function certificateRecords(receipt: UnknownRecord): UnknownRecord[] {
  const outputs = asRecord(receipt.outputs);
  const provenance = asRecord(receipt.provenance);
  return [
    receipt.formalCertificate,
    receipt.certificate,
    receipt.certificateIntegrity,
    outputs?.formalCertificate,
    outputs?.certificate,
    outputs?.certificateIntegrity,
    provenance?.certificate,
    provenance?.certificateIntegrity,
  ].map(asRecord).filter((record): record is UnknownRecord => Boolean(record));
}

function readCertificateHash(records: UnknownRecord[], artifacts: ArtifactSignal[]): string | null {
  for (const record of records) {
    for (const key of ["sha256", "certificateSha256", "certificateHash", "integrityHash", "hash"]) {
      const hash = readString(record[key]);
      if (hash) return hash;
    }
    const integrity = asRecord(record.integrity);
    if (integrity) {
      const hash = readArtifactHash(integrity);
      if (hash) return hash;
    }
  }
  return artifacts.find((artifact) => CERTIFICATE_PATTERN.test(artifact.path) && artifact.sha256)?.sha256 ?? null;
}

function projectCertificateLamp(
  receipt: UnknownRecord,
  gates: StatusObservation[],
  artifacts: ArtifactSignal[],
): RuntimeReceiptStatusLamp | null {
  const badgeIds = collectStringArray(receipt.badgeIds);
  const certificateGates = gates.filter((gate) => CERTIFICATE_PATTERN.test(gate.label));
  const certificateArtifacts = artifacts.filter((artifact) => CERTIFICATE_PATTERN.test(artifact.path));
  const records = certificateRecords(receipt);
  const present = certificateGates.length > 0 || certificateArtifacts.length > 0 || records.length > 0 || badgeIds.some((id) => CERTIFICATE_PATTERN.test(id));
  if (!present) return null;

  const observations = [...certificateGates];
  for (const [index, record] of records.entries()) {
    const status = readStatus(record);
    if (status) observations.push({ label: `certificate ${index + 1}`, status });
    const integrity = asRecord(record.integrity);
    const integrityStatus = readStatus(integrity ?? record.integrityStatus);
    if (integrityStatus) observations.push({ label: `certificate ${index + 1} integrity`, status: integrityStatus });
  }
  for (const artifact of certificateArtifacts) {
    if (artifact.evidenceStatus) observations.push({ label: artifact.path, status: artifact.evidenceStatus });
    if (artifact.integrityStatus) observations.push({ label: `${artifact.path} integrity`, status: artifact.integrityStatus });
  }

  const hash = readCertificateHash(records, certificateArtifacts);
  let status = observations.length ? worstObservation(observations) : "unknown";
  if (isPositiveStatus(status) && !hash) status = "unknown";
  const concern = summarizeObservations(observations, 2);
  const detail = [
    hash ? `SHA-256 ${hash.slice(0, 12)}${hash.length > 12 ? "…" : ""}` : "hash unreported",
    `${certificateGates.length} integrity/formal gate${certificateGates.length === 1 ? "" : "s"}`,
    concern,
  ].filter(Boolean).join(" · ");
  return { status, detail };
}

export function projectRuntimeReceiptStatusLamps(
  receipt: TheoryRuntimeReceiptV1,
  options: { aggregateStatus?: string; aggregateLabel?: string } = {},
): RuntimeReceiptStatusLampProjection {
  const rawReceipt = receipt as unknown as UnknownRecord;
  const gates = collectGates(rawReceipt);
  const artifacts = collectArtifacts(rawReceipt);
  const evidenceGates = gates.filter(
    (gate) => !CERTIFICATE_PATTERN.test(gate.label) && !PROVENANCE_GATE_PATTERN.test(gate.label),
  );
  const evidenceArtifacts = artifacts.filter(
    (artifact) => !CERTIFICATE_PATTERN.test(artifact.path),
  );
  const aggregateStatus = normalizeStatus(options.aggregateStatus ?? receipt.status);
  const receiptStatus = normalizeStatus(receipt.status);
  const aggregate = {
    status: aggregateStatus,
    detail: aggregateStatus === receiptStatus
      ? `Receipt lifecycle: ${receiptStatus}.`
      : `${options.aggregateLabel ?? "Section"}: ${aggregateStatus}; receipt lifecycle: ${receiptStatus}.`,
  };
  const evidence = projectEvidenceLamp(evidenceGates, evidenceArtifacts);
  const provenance = projectProvenanceLamp(rawReceipt, artifacts);
  const certificate = projectCertificateLamp(rawReceipt, gates, artifacts);
  const concerns = [
    !isPositiveStatus(evidence.status) ? `artifact evidence ${evidence.status}` : null,
    !isPositiveStatus(provenance.status) ? `runtime provenance ${provenance.status}` : null,
    certificate && !isPositiveStatus(certificate.status) ? `formal certificate ${certificate.status}` : null,
  ].filter((value): value is string => Boolean(value));

  return {
    aggregate,
    evidence,
    provenance,
    certificate,
    gates,
    artifacts,
    concernSummary: isPositiveStatus(aggregateStatus) && concerns.length
      ? `Aggregate ${aggregateStatus} is a lifecycle or section result only; it does not override ${concerns.join(", ")}.`
      : null,
  };
}

export function RuntimeReceiptStatusLamps({
  receipt,
  aggregateStatus,
  aggregateLabel = "Aggregate run / section",
  className = "",
}: {
  receipt: TheoryRuntimeReceiptV1;
  aggregateStatus?: string;
  aggregateLabel?: string;
  className?: string;
}) {
  const projection = projectRuntimeReceiptStatusLamps(receipt, { aggregateStatus, aggregateLabel });
  const lamps = [
    { id: "aggregate", label: aggregateLabel, lamp: projection.aggregate },
    { id: "evidence", label: "Referenced artifact evidence / gates", lamp: projection.evidence },
    { id: "provenance", label: "Runtime provenance / freshness", lamp: projection.provenance },
    ...(projection.certificate
      ? [{ id: "certificate", label: "Formal certificate / integrity", lamp: projection.certificate }]
      : []),
  ];

  return (
    <div className={className} data-testid="theory-runtime-status-lamps">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4" role="group" aria-label="Independent theory runtime statuses">
        {lamps.map(({ id, label, lamp }) => (
          <div
            key={id}
            className={`rounded border p-2 ${statusTone(lamp.status)}`}
            data-testid={`runtime-status-lamp-${id}`}
            data-status={lamp.status}
          >
            <div className="flex flex-wrap items-center justify-between gap-1">
              <span className="text-[9px] font-semibold uppercase tracking-wide">{label}</span>
              <Badge variant="outline" className={`text-[9px] ${statusTone(lamp.status)}`}>
                {lamp.status}
              </Badge>
            </div>
            <div className="mt-1 text-[10px] opacity-90">{lamp.detail}</div>
          </div>
        ))}
      </div>
      {projection.concernSummary ? (
        <div className="mt-2 rounded border border-amber-800/70 bg-amber-950/25 px-2 py-1 text-[10px] text-amber-100" data-testid="runtime-status-non-override-note">
          {projection.concernSummary}
        </div>
      ) : null}
      {projection.gates.length ? (
        <div className="mt-2" data-testid="runtime-evidence-gate-details">
          <div className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-slate-400">Receipt gate details</div>
          <div className="flex flex-wrap gap-1">
            {projection.gates.map((gate) => (
              <Badge key={gate.label} variant="outline" className={`text-[9px] ${statusTone(gate.status)}`}>
                {gate.label}: {gate.status}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}
      {projection.artifacts.length ? (
        <div className="mt-2 space-y-1" data-testid="runtime-artifact-binding-details">
          <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">Referenced artifact binding</div>
          {projection.artifacts.slice(0, 6).map((artifact) => (
            <div key={artifact.path} className="truncate font-mono text-[9px] text-slate-300" title={artifact.path}>
              {artifact.path}: evidence {artifact.evidenceStatus ?? "unreported"}; freshness {artifact.freshness ?? "unbound"}; SHA-256 {artifact.sha256 ? `${artifact.sha256.slice(0, 12)}${artifact.sha256.length > 12 ? "…" : ""}` : "unreported"}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
