import { create } from "zustand";
import {
  HELIX_WORKSTATION_ACTION_EXECUTION_SCHEMA,
  type HelixWorkstationActionExecution,
  type HelixWorkstationActionLifecycleStatus,
} from "@shared/helix-workstation-affordance";

type StartExecutionInput = {
  execution_id?: string;
  thread_id?: string | null;
  turn_id?: string | null;
  trace_id?: string | null;
  panel_id: string;
  action_id: string;
  affordance_id?: string | null;
  args?: Record<string, unknown>;
};

export type WorkstationActionExecutionState = {
  executions: Record<string, HelixWorkstationActionExecution>;
  order: string[];
  startExecution: (input: StartExecutionInput) => HelixWorkstationActionExecution;
  markStatus: (
    executionId: string,
    status: HelixWorkstationActionLifecycleStatus,
    patch?: Partial<Pick<HelixWorkstationActionExecution, "error" | "receipt" | "state_observed" | "state_observation">>,
  ) => void;
  attachReceipt: (executionId: string, receipt: Record<string, unknown>) => void;
  observeState: (executionId: string, observation: Record<string, unknown>) => void;
  failExecution: (executionId: string, error: string) => void;
  reset: () => void;
};

function newId(prefix: string): string {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}:${random}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

export const useWorkstationActionExecutionStore = create<WorkstationActionExecutionState>()((set, get) => ({
  executions: {},
  order: [],
  startExecution: (input) => {
    const startedAt = nowIso();
    const execution: HelixWorkstationActionExecution = {
      schema: HELIX_WORKSTATION_ACTION_EXECUTION_SCHEMA,
      execution_id: input.execution_id ?? newId("workstation-action"),
      thread_id: input.thread_id ?? null,
      turn_id: input.turn_id ?? null,
      trace_id: input.trace_id ?? null,
      panel_id: input.panel_id,
      action_id: input.action_id,
      affordance_id: input.affordance_id ?? null,
      status: "planned",
      args: input.args ?? {},
      receipt: null,
      state_observed: false,
      state_observation: null,
      error: null,
      started_at: startedAt,
      updated_at: startedAt,
    };
    set((state) => ({
      executions: { ...state.executions, [execution.execution_id]: execution },
      order: [execution.execution_id, ...state.order.filter((id) => id !== execution.execution_id)].slice(0, 200),
    }));
    return execution;
  },
  markStatus: (executionId, status, patch) => {
    const current = get().executions[executionId];
    if (!current) return;
    set((state) => ({
      executions: {
        ...state.executions,
        [executionId]: {
          ...current,
          ...patch,
          status,
          updated_at: nowIso(),
        },
      },
    }));
  },
  attachReceipt: (executionId, receipt) => {
    get().markStatus(executionId, "receipt_recorded", { receipt });
  },
  observeState: (executionId, observation) => {
    get().markStatus(executionId, "state_observed", {
      state_observed: true,
      state_observation: observation,
    });
  },
  failExecution: (executionId, error) => {
    get().markStatus(executionId, "failed", { error });
  },
  reset: () => set({ executions: {}, order: [] }),
}));

