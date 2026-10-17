import type {
  HelixWorkstationCommandReceipt,
  HelixWorkstationCommandReceiptStage,
  HelixWorkstationCommandReceiptStatus,
} from "@shared/helix-workstation-task-manager";

type CommandReceiptInput = {
  command_id: string;
  command_family: string;
  stage: HelixWorkstationCommandReceiptStage;
  status: HelixWorkstationCommandReceiptStatus;
  panel_id?: string | null;
  latency_ms?: number | null;
  failure_reason?: string | null;
};

const safeId = (value: string, fallback: string): string => {
  const trimmed = String(value ?? "").trim();
  return /^[a-z0-9_.:-]+$/i.test(trimmed) ? trimmed : fallback;
};

const safeReason = (value: string | null | undefined): string | null => {
  if (!value) return null;
  return String(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/(?:api[_-]?key|token|secret|password)=\S+/gi, "$1=[redacted]")
    .replace(/[A-Za-z0-9._~+/=-]{48,}/g, "[redacted]")
    .slice(0, 140);
};

export const recordWorkstationCommandReceipt = (input: CommandReceiptInput): void => {
  if (typeof window === "undefined") return;
  const receipt: Omit<HelixWorkstationCommandReceipt, "authority"> = {
    schema_version: "helix.workstation_command_receipt.v1",
    receipt_id: `client.${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 8)}`,
    command_id: safeId(input.command_id, "unknown.command"),
    command_family: safeId(input.command_family, "unknown"),
    stage: input.stage,
    status: input.status,
    occurred_at: new Date().toISOString(),
    panel_id: input.panel_id ? safeId(input.panel_id, "unknown") : null,
    latency_ms: typeof input.latency_ms === "number" && Number.isFinite(input.latency_ms)
      ? Math.max(0, Math.round(input.latency_ms * 10) / 10)
      : null,
    failure_reason: safeReason(input.failure_reason),
  };
  void fetch("/api/workspace-os/command-reliability/receipt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(receipt),
    keepalive: true,
  }).catch(() => undefined);
};

export const recordWorkstationCommandLifecycle = async <T>(
  input: {
    command_id: string;
    command_family: string;
    panel_id?: string | null;
    success_stage?: HelixWorkstationCommandReceiptStage;
    failure_stage?: HelixWorkstationCommandReceiptStage;
  },
  run: () => Promise<T>,
): Promise<T> => {
  const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
  recordWorkstationCommandReceipt({
    command_id: input.command_id,
    command_family: input.command_family,
    panel_id: input.panel_id,
    stage: "request_started",
    status: "in_flight",
  });
  try {
    const result = await run();
    const endedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
    recordWorkstationCommandReceipt({
      command_id: input.command_id,
      command_family: input.command_family,
      panel_id: input.panel_id,
      stage: input.success_stage ?? "request_succeeded",
      status: "succeeded",
      latency_ms: endedAt - startedAt,
    });
    return result;
  } catch (error) {
    const endedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
    recordWorkstationCommandReceipt({
      command_id: input.command_id,
      command_family: input.command_family,
      panel_id: input.panel_id,
      stage: input.failure_stage ?? "request_failed",
      status: "failed",
      latency_ms: endedAt - startedAt,
      failure_reason: error instanceof Error ? error.message : "command_failed",
    });
    throw error;
  }
};
