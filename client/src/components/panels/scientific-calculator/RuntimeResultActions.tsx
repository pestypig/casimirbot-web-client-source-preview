import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import type { TheoryRuntimeJobSnapshotV1 } from "@shared/contracts/theory-runtime-job.v1";
import type { TheoryRuntimeReceiptV1 } from "@shared/contracts/theory-runtime-receipt.v1";
import { formatTheoryRuntimeReportJson, formatTheoryRuntimeReportMarkdown } from "@/lib/theory/runtimeReport";
import { launchTheoryRuntimeResultExplanation } from "@/lib/helix/askTheoryRuntimeContext";
import { useTheoryRuntimeJobStore } from "@/store/useTheoryRuntimeJobStore";

export function RuntimeResultActions({ job, receipt }: { job: TheoryRuntimeJobSnapshotV1; receipt: TheoryRuntimeReceiptV1 }) {
  const bindSelectedResultAsContext = useTheoryRuntimeJobStore((state) => state.bindSelectedResultAsContext);
  const [message, setMessage] = useState<string | null>(null);
  const copy = async (text: string, success: string) => {
    if (!navigator.clipboard?.writeText) return setMessage("Clipboard is unavailable.");
    try {
      await navigator.clipboard.writeText(text);
      setMessage(success);
    } catch {
      setMessage("Clipboard write was blocked.");
    }
  };
  const bind = () => {
    const context = bindSelectedResultAsContext();
    setMessage(context ? `Context bound to ${context.receiptId}.` : "Select a completed result first.");
    return context;
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button data-helix-control-id="workstation.panel.scientific-calculator.runtime-result-actions.copy-report" data-helix-interaction-kind="act" data-helix-authority-state="client_local" size="sm" variant="outline" onClick={() => void copy(formatTheoryRuntimeReportMarkdown({ job, receipt }), "Report copied.")}>Copy report</Button>
      <Button data-helix-control-id="workstation.panel.scientific-calculator.runtime-result-actions.copy-json" data-helix-interaction-kind="act" data-helix-authority-state="client_local" size="sm" variant="outline" onClick={() => void copy(formatTheoryRuntimeReportJson({ job, receipt }), "JSON copied.")}>Copy JSON</Button>
      <Button data-helix-control-id="workstation.panel.scientific-calculator.runtime-result-actions.use-as-context" data-helix-interaction-kind="configure" data-helix-authority-state="client_local" size="sm" variant="outline" onClick={bind}>Use as context</Button>
      <Button data-helix-control-id="workstation.panel.scientific-calculator.runtime-result-actions.explain-result" data-helix-interaction-kind="act" data-helix-authority-state="client_local" size="sm" className="bg-violet-600 hover:bg-violet-700" onClick={() => { const context = bind(); if (context) launchTheoryRuntimeResultExplanation(context); }}>Explain result</Button>
      {message ? <span className="text-[11px] text-slate-300" role="status">{message}</span> : null}
    </div>
  );
}
