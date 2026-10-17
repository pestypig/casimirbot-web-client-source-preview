import React, { useState } from "react";
import { isFlagEnabled } from "@/lib/envFlags";

type EvalPayload = {
  ok: number;
  total: number;
  rate: number;
  skipped: boolean;
  reason?: string;
  outcome?: string;
  target: number;
};

type EvalReplayPayload = {
  ok: boolean;
  exitCode: number | null;
  duration_ms: number;
  timed_out?: boolean;
  essence_id?: string;
  traceId?: string;
  essenceId?: string;
};

export default function EvalPanel() {
  const evalUiEnabled = isFlagEnabled("ENABLE_EVAL_UI") || Boolean(import.meta.env?.DEV);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<EvalPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [replayTarget, setReplayTarget] = useState("");
  const [replayTargetKind, setReplayTargetKind] = useState<"trace" | "essence">("trace");
  const [replayBusy, setReplayBusy] = useState(false);
  const [replayResult, setReplayResult] = useState<EvalReplayPayload | null>(null);
  const [replayError, setReplayError] = useState<string | null>(null);
  const [replayNotice, setReplayNotice] = useState<string | null>(null);
  const replayUiEnabled = isFlagEnabled("ENABLE_EVAL_REPLAY") || Boolean(import.meta.env?.DEV);

  const panelVisible = evalUiEnabled || replayUiEnabled;
  if (!panelVisible) {
    return null;
  }

  const runEval = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/agi/eval/smoke", { method: "POST" });
      const payload = (await response.json()) as EvalPayload;
      if (!response.ok) {
        throw new Error(payload?.reason || "Eval failed");
      }
      setResult(payload);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message || "Eval failed");
    } finally {
      setBusy(false);
    }
  };

  const runEvalReplay = async () => {
    setReplayBusy(true);
    setReplayError(null);
    setReplayNotice(null);
    try {
      const payload: Record<string, string> = {};
      const trimmed = replayTarget.trim();
      if (trimmed) {
        if (replayTargetKind === "essence") {
          payload.essenceId = trimmed;
        } else {
          payload.traceId = trimmed;
        }
      }
      const response = await fetch("/api/agi/eval/replay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json()) as (EvalReplayPayload & { message?: string });
      if (response.status === 404) {
        setReplayError("Enable ENABLE_EVAL_REPLAY=1");
        return;
      }
      if (!response.ok) {
        throw new Error(body?.message || "Eval replay failed");
      }
      setReplayResult(body);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setReplayError(message || "Eval replay failed");
    } finally {
      setReplayBusy(false);
    }
  };

  const copyEssenceId = async (id: string) => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(id);
        setReplayNotice("Eval envelope id copied.");
        setReplayError(null);
      } else {
        setReplayNotice("Clipboard not available.");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setReplayError(message || "Copy failed");
    }
  };

  const status = result
    ? result.skipped
      ? "skipped"
      : `${result.ok}/${result.total} (${(result.rate * 100).toFixed(0)}% target ${Math.round(
          result.target * 100,
        )}%)`
    : "idle";

  return (
    <div className="flex flex-col gap-1 text-xs min-w-[200px]">
      {evalUiEnabled && (
        <>
          <div className="uppercase tracking-wide opacity-60">Eval</div>
          <button
            className="border border-white/20 rounded px-2 py-1 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={() => runEval()}
            disabled={busy}
          >
            {busy ? "Running..." : "Run smoke eval"}
          </button>
          <div className="opacity-70">{status}</div>
          {error && <div className="text-red-400">{error}</div>}
          {result?.reason && result.skipped && <div className="text-[11px] opacity-60">Reason: {result.reason}</div>}
        </>
      )}
      <div
        className={`${
          evalUiEnabled ? "mt-3 border-t border-white/10 pt-3" : ""
        } flex flex-col gap-1 text-xs`}
      >
        <div className="uppercase tracking-wide opacity-60">Eval Replay</div>
        <div className="flex items-center gap-2">
          <select
            className="rounded border border-white/20 bg-transparent px-2 py-1 text-[11px]"
            value={replayTargetKind}
            onChange={(event) =>
              setReplayTargetKind(event.target.value === "essence" ? "essence" : "trace")
            }
          >
            <option value="trace">Trace</option>
            <option value="essence">Essence</option>
          </select>
          <input
            className="flex-1 rounded border border-white/20 bg-transparent px-2 py-1 text-[11px] placeholder:opacity-40 focus:outline-none"
            placeholder={replayTargetKind === "essence" ? "Essence ID (optional)" : "Trace ID (optional)"}
            value={replayTarget}
            onChange={(event) => setReplayTarget(event.target.value)}
          />
          <button
            className="border border-white/20 rounded px-2 py-1 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={() => void runEvalReplay()}
            disabled={replayBusy}
            title={!replayUiEnabled ? "Enable ENABLE_EVAL_REPLAY=1" : undefined}
          >
            {replayBusy ? "Verifying..." : "Verify patch"}
          </button>
        </div>
        <div className="opacity-70 text-[11px]">
          {replayResult
            ? `Result: ${replayResult.ok ? "ok" : "fail"} (exit ${replayResult.exitCode ?? "?"}, ${Math.round(
                replayResult.duration_ms,
              )} ms)`
            : "Idle"}
        </div>
        {replayError && <div className="text-red-400 text-[11px]">{replayError}</div>}
        {replayNotice && <div className="text-green-300 text-[11px]">{replayNotice}</div>}
        {replayResult?.essence_id && (
          <div className="flex items-center gap-2 text-[11px]">
            <a
              className="underline opacity-80 hover:opacity-100"
              href={`/api/essence/${replayResult.essence_id}`}
              target="_blank"
              rel="noreferrer"
            >
              {replayResult.essence_id}
            </a>
            <button
              className="text-[11px] underline opacity-80 hover:opacity-100"
              onClick={() => replayResult.essence_id && void copyEssenceId(replayResult.essence_id)}
            >
              copy id
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
