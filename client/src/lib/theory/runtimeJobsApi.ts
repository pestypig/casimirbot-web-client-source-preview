import {
  isTheoryRuntimeJobSnapshotV1,
  type TheoryRuntimeJobSnapshotV1,
} from "@shared/contracts/theory-runtime-job.v1";
import {
  isTheoryRuntimeReceiptV1,
  type TheoryRuntimeReceiptV1,
} from "@shared/contracts/theory-runtime-receipt.v1";
import type { DocRuntimeCalculatorLaunchV1 } from "@shared/contracts/doc-calculator-launch.v1";

const endpoint = (requestId?: string, suffix = "") =>
  requestId
    ? `/api/helix/theory/runtime-jobs/${encodeURIComponent(requestId)}${suffix}`
    : "/api/helix/theory/runtime-jobs";

async function responseJson(response: Response): Promise<unknown> {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
    throw new Error(typeof record.message === "string" ? record.message : typeof record.error === "string" ? record.error : `HTTP ${response.status}`);
  }
  return payload;
}

export async function startTheoryRuntimeJobFromLaunch(
  runtime: DocRuntimeCalculatorLaunchV1["runtime"],
  fetchImpl: typeof fetch = fetch,
): Promise<TheoryRuntimeJobSnapshotV1> {
  const payload = await responseJson(await fetchImpl(endpoint(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      runtimeId: runtime.runtimeId,
      graphId: runtime.graphId,
      badgeIds: runtime.badgeIds,
      args: runtime.args,
      requestedScope: runtime.requestedScope,
    }),
  }));
  if (!isTheoryRuntimeJobSnapshotV1(payload)) throw new Error("Runtime start returned an invalid job snapshot.");
  return payload;
}

export async function readTheoryRuntimeJobStatus(
  requestId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<TheoryRuntimeJobSnapshotV1> {
  const payload = await responseJson(await fetchImpl(endpoint(requestId), { cache: "no-store" }));
  if (!isTheoryRuntimeJobSnapshotV1(payload)) throw new Error("Runtime status returned an invalid job snapshot.");
  return payload;
}

export async function readTheoryRuntimeJobResult(
  requestId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ job: TheoryRuntimeJobSnapshotV1; receipt: TheoryRuntimeReceiptV1 }> {
  const payload = await responseJson(await fetchImpl(endpoint(requestId, "/result"), { cache: "no-store" }));
  const record = payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : {};
  if (!isTheoryRuntimeJobSnapshotV1(record.job) || !isTheoryRuntimeReceiptV1(record.receipt)) {
    throw new Error("Runtime result returned an invalid receipt envelope.");
  }
  return { job: record.job, receipt: record.receipt };
}
