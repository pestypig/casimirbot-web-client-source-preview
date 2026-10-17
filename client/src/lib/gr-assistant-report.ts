import { apiRequest } from "@/lib/queryClient";
import type { GrAssistantReport, GrAssistantReportRequest } from "@shared/schema";

export async function fetchGrAssistantReport(
  request: GrAssistantReportRequest,
  signal?: AbortSignal,
): Promise<GrAssistantReport> {
  const res = await apiRequest(
    "POST",
    "/api/helix/gr-assistant-report",
    request,
    signal,
  );
  const json = await res.json();
  if (!json || json.kind !== "gr-assistant-report") {
    throw new Error("Invalid gr-assistant-report payload");
  }
  return json as GrAssistantReport;
}
