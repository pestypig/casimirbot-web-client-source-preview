import { useMemo } from "react";
import { useWorkstationActionExecutionStore } from "@/store/useWorkstationActionExecutionStore";

type WorkstationActionTraceProps = {
  traceId?: string | null;
  limit?: number;
};

export function WorkstationActionTrace({ traceId, limit = 12 }: WorkstationActionTraceProps) {
  const executions = useWorkstationActionExecutionStore((state) => state.executions);
  const order = useWorkstationActionExecutionStore((state) => state.order);
  const rows = useMemo(
    () =>
      order
        .map((id) => executions[id])
        .filter(Boolean)
        .filter((execution) => !traceId || execution.trace_id === traceId)
        .slice(0, limit),
    [executions, limit, order, traceId],
  );

  if (rows.length === 0) {
    return (
      <div className="rounded border border-dashed border-border/70 p-3 text-xs text-muted-foreground">
        No workstation action executions recorded.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {rows.map((execution) => (
        <div key={execution.execution_id} className="rounded border border-border/70 bg-background/70 p-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium text-foreground">
              {execution.panel_id}.{execution.action_id}
            </span>
            <span className="rounded bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
              {execution.status}
            </span>
          </div>
          <div className="mt-2 grid gap-1 text-muted-foreground sm:grid-cols-2">
            <div>execution: {execution.execution_id}</div>
            <div>updated: {execution.updated_at}</div>
            <div>state observed: {execution.state_observed ? "yes" : "no"}</div>
            <div>receipt: {execution.receipt ? "recorded" : "pending"}</div>
          </div>
          {execution.error ? <div className="mt-2 text-destructive">{execution.error}</div> : null}
        </div>
      ))}
    </div>
  );
}

export default WorkstationActionTrace;

