import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { roleFromTool, normalizeEvent, type DebateRole } from "@/lib/agi/debate";
import {
  connectDebateStream,
  getDebateStatus,
  type DebateOutcomePayload,
  type DebateScoreboard,
  type DebateSnapshot,
  type DebateStreamEvent,
  type DebateTurnPayload,
} from "@/lib/agi/api";
import { useDebateTelemetry } from "@/hooks/useDebateTelemetry";



type Line = {

  id: string | number;

  at: string;

  role: DebateRole;

  text: string;

  tool?: string;

  status?: "ok" | "error" | "info";

  essenceIds?: string[];

  latency_ms?: number;

};



type DebateViewProps = {

  traceId?: string;

  debateId?: string | null;

  open?: boolean;

  onClose?: () => void;

  variant?: "modal" | "panel";

};



const MAX_LINES = 400;



export default function DebateView({ traceId, debateId, open, onClose, variant }: DebateViewProps) {

  const resolvedVariant = variant ?? (typeof open === "boolean" ? "modal" : "panel");

  const isPanel = resolvedVariant === "panel";

  const isModal = !isPanel;

  const isOpen = isPanel ? true : Boolean(open);

  const handleClose = onClose ?? (() => {});

  const [lines, setLines] = useState<Line[]>([]);

  const [trace, setTrace] = useState<any>(null);

  const [error, setError] = useState<string | null>(null);

  const [goal, setGoal] = useState<string>("");

  const [status, setStatus] = useState<DebateSnapshot["status"]>("pending");

  const [scoreboard, setScoreboard] = useState<DebateScoreboard | null>(null);

  const [outcome, setOutcome] = useState<DebateOutcomePayload | null>(null);

  const [loading, setLoading] = useState(false);

  const env = (import.meta as any)?.env ?? {};

  const sseUrl = env?.VITE_DEBATE_SSE_URL ?? "/api/agi/tools/logs/stream";

  const traceApiBase = env?.VITE_TRACE_API_BASE ?? "/api/agi/trace";

  const active = isOpen;

  const activeDebateId = debateId ?? (trace as any)?.debate_id ?? null;

  const { data: telemetryData } = useDebateTelemetry(activeDebateId ?? null, 3500);



  const pushLine = useCallback((line: Line) => {

    setLines((prev) => {

      const next = [...prev, line];

      return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next;

    });

  }, []);



  const turnToLine = useCallback(
    (turn: DebateTurnPayload): Line => ({
      id: turn.id,
      at: turn.created_at,
      role: turn.role,
      text: turn.text,
      tool: "debate.turn",
      status: "info",
      essenceIds: turn.essence_id ? [turn.essence_id, ...(turn.citations ?? [])] : turn.citations ?? [],
    }),
    [],
  );


  useEffect(() => {

    if (isPanel) return;

    if (!isOpen) {

      setLines([]);

      setTrace(null);

      setError(null);

      setOutcome(null);

    }

  }, [isOpen, isPanel]);



  useEffect(() => {

    setLines([]);
    setOutcome(null);
    setScoreboard(null);
    setStatus("pending");
    setGoal("");
    setLoading(false);
    if (!traceId) {
      setTrace(null);
    }
  }, [traceId, activeDebateId]);


  useEffect(() => {

    if (!active || !traceId || typeof window === "undefined") return;

    let canceled = false;

    setError(null);

    fetch(`${traceApiBase}/${traceId}`)

      .then((res) => {

        if (!res.ok) throw new Error(`Trace ${traceId} unavailable`);

        return res.json();

      })

      .then((payload) => {

        if (!canceled) setTrace(payload);

      })

      .catch((err) => {

        if (!canceled) setError(err?.message ?? "Unable to load trace.");

      });

    return () => {

      canceled = true;

    };

  }, [traceId, active, traceApiBase]);



  useEffect(() => {

    if (!active || !activeDebateId) return;

    let canceled = false;

    setError(null);

    setLoading(true);

    getDebateStatus(activeDebateId)

      .then((snapshot) => {

        if (canceled) return;

        setGoal(snapshot.goal);

        setStatus(snapshot.status);

        setScoreboard(snapshot.scoreboard ?? null);

        setOutcome(snapshot.outcome ?? null);

        setLines(snapshot.turns.map(turnToLine));

        setLoading(false);

      })

      .catch((err) => {

        if (canceled) return;

        setError(err instanceof Error ? err.message : "Unable to load debate.");

        setLoading(false);

      });

    const unsubscribe = connectDebateStream(activeDebateId, {

      onEvent: (event) => {

        if (canceled) return;

        if (event.scoreboard) {

          setScoreboard(event.scoreboard);

        }

        if (event.type === "turn") {

          pushLine(turnToLine(event.turn));

        } else if (event.type === "status") {

          setStatus(event.status);

        } else if (event.type === "outcome") {

          setOutcome(event.outcome);

          setStatus("completed");

        }

      },

      onError: () => {

        setError((prev) => prev ?? "Debate stream disconnected.");

      },

    });

    return () => {

      canceled = true;

      unsubscribe();

    };

  }, [active, activeDebateId, pushLine, turnToLine]);



  useEffect(() => {

    if (!active || activeDebateId || typeof window === "undefined") return;

    let es: EventSource | null = null;

    setError(null);



    try {

      es = new EventSource(sseUrl);

      es.onmessage = (event) => {

        try {

          const parsed = JSON.parse(event.data);

          const normalized = normalizeEvent(parsed, traceId);

          if (!normalized) return;

          const role = roleFromTool(normalized.tool);

          pushLine({

            id: normalized.id,

            at: normalized.at,

            role,

            text: normalized.text,

            tool: normalized.tool,

            status: normalized.status,

            essenceIds: normalized.essenceIds,

          });

        } catch {

          // ignore malformed payloads

        }

      };

      es.onerror = () => {

        setError((prev) => prev ?? "Debate stream disconnected.");

      };

    } catch (err) {

      setError((err as Error)?.message ?? "Unable to open debate stream.");

    }



    return () => {

      es?.close();

    };

  }, [traceId, active, activeDebateId, sseUrl, pushLine]);



  if (!active) return null;

  const proponentLines = useMemo(() => lines.filter((line) => line.role === "proponent"), [lines]);
  const skepticLines = useMemo(() => lines.filter((line) => line.role === "skeptic"), [lines]);
  const refereeLines = useMemo(() => lines.filter((line) => line.role === "referee"), [lines]);
  const latestReferee = refereeLines[refereeLines.length - 1];
  const displayGoal = goal || trace?.goal;
  const refereeText =
    latestReferee?.text ??
    outcome?.verdict ??
    (status === "running" ? "Referee: awaiting outcome..." : `Status: ${status}`);
  const refereeEssenceIds = useMemo(
    () => dedupeIds(latestReferee?.essenceIds ?? []),
    [latestReferee?.essenceIds],
  );

  const telemetry = telemetryData?.telemetry;
  const collapseConfidence = telemetryData?.confidence;
  const formatPct = (value?: number) =>
    typeof value === "number" && Number.isFinite(value) ? `${(value * 100).toFixed(0)}%` : "–";

  const header = (
    <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
      <div className="flex items-center gap-3 truncate">
        <div className="font-semibold">Debate</div>
        {displayGoal && <div className="text-sm opacity-70 truncate">- {displayGoal}</div>}
        {!traceId && (
          <div className="text-xs opacity-60">
            Run a task to lock to a trace, or watch global tool logs.
          </div>
        )}
      </div>
      <div className="flex items-center gap-3 text-xs">
        {telemetry && (
          <div className="flex items-center gap-1">
            <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-emerald-200">
              Coh {formatPct(telemetry.global_coherence)}
            </span>
            <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-amber-200">
              Pressure {formatPct(telemetry.collapse_pressure)}
            </span>
            {collapseConfidence !== undefined && (
              <span className="rounded-full border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-sky-200">
                Confidence {formatPct(collapseConfidence)}
              </span>
            )}
          </div>
        )}
        {scoreboard && (
          <span className="opacity-70">
            P:{scoreboard.proponent} | S:{scoreboard.skeptic}
          </span>
        )}
        {loading && <span className="text-amber-300">Syncing...</span>}
        {error && (
          <span className="text-rose-300 truncate max-w-[220px]" title={error}>
            {error}
          </span>
        )}
        <button
          className="underline opacity-80 hover:opacity-100 disabled:opacity-30"
          disabled={!lines.length}
          onClick={() => handleExport(lines, traceId)}
        >
          Export
        </button>
        {isModal && (
          <button className="underline opacity-80 hover:opacity-100" onClick={handleClose}>
            Close
          </button>
        )}
      </div>
    </div>
  );

  const refereeStrip = (
    <div className="px-4 py-2 text-xs border-b border-white/10 opacity-80 flex flex-wrap items-center gap-2">
      <span>{refereeText}</span>
      {refereeEssenceIds.length > 0 && (
        <>
          <span className="opacity-60">Refs:</span>
          {refereeEssenceIds.map((eid) => (
            <a
              key={eid}
              className="underline opacity-80 hover:opacity-100"
              href={`/api/essence/${eid}`}
              target="_blank"
              rel="noreferrer"
            >
              {eid.slice(0, 8)}...
            </a>
          ))}
        </>
      )}
    </div>
  );

const body = (

    <div className="flex flex-1 min-h-0">

      <DebateColumn title="Proponent" lines={proponentLines} />

      <DebateColumn title="Skeptic" lines={skepticLines} />

    </div>

  );



  const content = (

    <div className="bg-[var(--panel-bg,#0f1115)] text-[var(--panel-fg,#e6e6e6)] border border-white/15 rounded-lg shadow-lg flex flex-col h-full">

      {header}

      {refereeStrip}

      {body}

    </div>

  );



  if (isPanel) {

    return <div className="w-full h-full flex flex-col">{content}</div>;

  }



  return (

    <div

      className={`fixed inset-0 z-40 transition-opacity ${

        isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"

      }`}

    >

      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />

      <div className="absolute right-6 top-6 bottom-6 left-6">{content}</div>

    </div>

  );

}



function handleExport(lines: Line[], traceId?: string) {

  if (typeof window === "undefined" || !lines.length) return;

  const payload = lines.map((line) =>

    JSON.stringify({

      at: line.at,

      role: line.role,

      tool: line.tool,

      status: line.status,

      text: line.text,

      essenceIds: line.essenceIds

    })

  );

  const blob = new Blob([payload.join("\n")], { type: "application/x-ndjson" });

  const url = URL.createObjectURL(blob);

  const anchor = document.createElement("a");

  anchor.href = url;

  anchor.download = `${traceId ?? "debate"}.ndjson`;

  anchor.click();

  URL.revokeObjectURL(url);

}



type ColumnProps = {

  title: string;

  lines: Line[];

};



function DebateColumn({ title, lines }: ColumnProps) {

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {

    if (scrollRef.current) {

      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;

    }

  }, [lines.length]);

  return (

    <div className="flex-1 min-w-0 border-r border-white/10 flex flex-col">

      <div className="px-3 py-2 text-xs uppercase tracking-wide opacity-70 border-b border-white/10">

        {title}

      </div>

      <div ref={scrollRef} className="flex-1 overflow-auto px-3 py-2 space-y-2">

        {lines.length === 0 && (

          <div className="text-sm opacity-60">Awaiting {title.toLowerCase()} entries…</div>

        )}

        {lines.map((line) => (

          <div key={line.id} className="text-sm">

            <div className="text-[11px] opacity-60">

              {new Date(line.at).toLocaleTimeString()} · {line.tool}

              {line.latency_ms ? ` · ${line.latency_ms}ms` : ""}

            </div>

            <div

              className={

                line.status === "error" ? "text-red-300" : line.status === "ok" ? "text-green-300" : ""

              }

            >

              {line.text}

            </div>

            {!!line.essenceIds?.length && (

              <div className="text-[11px] mt-1">

                {line.essenceIds.map((eid) => (

                  <a

                    key={eid}

                    className="underline opacity-80 hover:opacity-100 mr-2"

                    href={`/api/essence/${eid}`}

                    target="_blank"

                    rel="noreferrer"

                  >

                    {eid.slice(0, 8)}…

                  </a>

                ))}

              </div>

            )}

          </div>

        ))}

      </div>

    </div>

  );

}



type LegacyDebateViewProps = {

  debateId?: string | null;

  open: boolean;

  onClose: () => void;

};



const EMPTY_SCORE = { proponent: 0, skeptic: 0 };



export function LegacyDebateView({ debateId, open, onClose }: LegacyDebateViewProps) {

  const mounted = open && Boolean(debateId);

  const [goal, setGoal] = useState("");

  const [status, setStatus] = useState<DebateSnapshot["status"]>("pending");

  const [turns, setTurns] = useState<DebateTurnPayload[]>([]);

  const [scoreboard, setScoreboard] = useState(EMPTY_SCORE);

  const [outcome, setOutcome] = useState<DebateOutcomePayload | null>(null);

  const [error, setError] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);



  useEffect(() => {

    setGoal("");

    setTurns([]);

    setOutcome(null);

    setScoreboard(EMPTY_SCORE);

    setStatus("pending");

    setError(null);

  }, [debateId]);



  useEffect(() => {

    if (!mounted || !debateId) return;

    let canceled = false;

    setLoading(true);

    getDebateStatus(debateId)

      .then((snapshot) => {

        if (canceled) return;

        setGoal(snapshot.goal);

        setStatus(snapshot.status);

        setScoreboard(snapshot.scoreboard ?? EMPTY_SCORE);

        setTurns(Array.isArray(snapshot.turns) ? snapshot.turns : []);

        setOutcome(snapshot.outcome ?? null);

        setLoading(false);

      })

      .catch((err) => {

        if (canceled) return;

        const message = err instanceof Error ? err.message : String(err);

        setError(message || "Failed to load debate.");

        setLoading(false);

      });

    return () => {

      canceled = true;

    };

  }, [mounted, debateId]);



  useEffect(() => {

    if (!mounted || !debateId) {

      return;

    }

    const unsubscribe = connectDebateStream(debateId, {

      onEvent: (event) => handleStreamEvent(event),

      onError: () => {

        setError((prev) => prev ?? "Stream disconnected.");

      }

    });

    return () => {

      unsubscribe();

    };

  }, [mounted, debateId]);



  const handleStreamEvent = (event: DebateStreamEvent) => {

    if (event.scoreboard) {

      setScoreboard(event.scoreboard);

    }

    if (event.type === "turn") {

      setTurns((prev) => upsertTurn(prev, event.turn));

    } else if (event.type === "status") {

      setStatus(event.status);

    } else if (event.type === "outcome") {

      setOutcome(event.outcome);

    }

  };



  const proponentTurns = useMemo(() => turns.filter((turn) => turn.role === "proponent"), [turns]);

  const skepticTurns = useMemo(() => turns.filter((turn) => turn.role === "skeptic"), [turns]);

  const refereeTurns = useMemo(() => turns.filter((turn) => turn.role === "referee"), [turns]);



  return (

    <div

      className={`fixed bottom-0 left-0 right-0 z-40 transition-transform duration-300 ${

        mounted ? "translate-y-0" : "translate-y-full pointer-events-none"

      }`}

    >

      <div className="bg-[var(--panel-bg,#050608)] text-[var(--panel-fg,#f4f4f4)] border-t border-white/15 shadow-2xl h-[70vh] flex flex-col">

        <header className="flex items-center justify-between px-6 py-4 border-b border-white/10">

          <div className="flex flex-col gap-1">

            <div className="text-xs uppercase tracking-wide opacity-60">Debate mode</div>

            <div className="text-lg font-semibold max-w-[60vw] truncate">{goal || "Awaiting goal"}</div>

            <div className="text-xs opacity-70">Status: {status}</div>

            {loading && <div className="text-xs text-amber-300">Booting debate pipeline…</div>}

            {error && (

              <div className="text-xs text-red-300 max-w-[60vw] truncate" title={error}>

                {error}

              </div>

            )}

          </div>

          <div className="flex items-center gap-4 text-sm">

            <div className="flex items-center gap-1">

              <span className="text-emerald-300 font-semibold">P</span>

              <span>{scoreboard.proponent}</span>

            </div>

            <div className="flex items-center gap-1">

              <span className="text-sky-300 font-semibold">S</span>

              <span>{scoreboard.skeptic}</span>

            </div>

            <button className="text-xs underline opacity-70 hover:opacity-100" onClick={onClose}>

              close

            </button>

          </div>

        </header>

        <div className="flex-1 grid grid-cols-1 gap-4 p-6 overflow-hidden sm:grid-cols-2">

          <TurnColumn label="Proponent" accent="text-emerald-300" turns={proponentTurns} />

          <TurnColumn label="Skeptic" accent="text-sky-300" turns={skepticTurns} />

        </div>

        <div className="border-t border-white/10 p-4 h-48 overflow-auto space-y-3 bg-black/20">

          <div className="text-xs uppercase tracking-wide opacity-70">Referee</div>

          {refereeTurns.length === 0 && (

            <div className="text-sm opacity-70">Referee updates will appear once the first round completes.</div>

          )}

          {refereeTurns.map((turn) => (

            <RefereeCard key={turn.id} turn={turn} />

          ))}

          {outcome && (

            <div className="rounded border border-white/15 p-3 space-y-1 bg-white/5">

              <div className="text-xs uppercase opacity-70">Verdict</div>

              <div className="text-sm">{outcome.verdict}</div>

              <div className="text-[11px] opacity-70">

                Confidence {(outcome.confidence * 100).toFixed(1)}%

                {outcome.winning_role && ` · Winner: ${outcome.winning_role}`}

              </div>

            </div>

          )}

        </div>

      </div>

    </div>

  );

}



type TurnColumnProps = {

  label: string;

  accent: string;

  turns: DebateTurnPayload[];

};



function TurnColumn({ label, accent, turns }: TurnColumnProps) {

  return (

    <div className="flex flex-col h-full overflow-hidden">

      <div className={`text-sm uppercase tracking-wide mb-2 ${accent}`}>{label}</div>

      <div className="flex-1 overflow-auto space-y-3 pr-2">

        {turns.length === 0 && <div className="text-sm opacity-60">No turns yet.</div>}

        {turns.map((turn) => (

          <TurnCard key={turn.id} turn={turn} />

        ))}

      </div>

    </div>

  );

}



function TurnCard({ turn }: { turn: DebateTurnPayload }) {

  return (

    <div className="rounded border border-white/10 p-3 space-y-2 bg-white/5">

      <div className="flex items-center justify-between text-[11px] opacity-70 uppercase">

        <span>Round {turn.round}</span>

        <span>{new Date(turn.created_at).toLocaleTimeString()}</span>

      </div>

      <div className="text-sm whitespace-pre-wrap leading-relaxed">{turn.text}</div>

      {turn.citations.length > 0 && (

        <div className="text-[11px] space-x-2">

          <span className="opacity-70">Citations:</span>

          {turn.citations.map((cid) => (

            <a

              key={cid}

              className="underline hover:opacity-100 opacity-80"

              href={`/api/essence/${cid}`}

              target="_blank"

              rel="noreferrer"

            >

              {cid.slice(0, 8)}…

            </a>

          ))}

        </div>

      )}

    </div>

  );

}



function RefereeCard({ turn }: { turn: DebateTurnPayload }) {
  const refs = dedupeIds([turn.essence_id, ...turn.citations]);

  return (

    <div className="rounded border border-white/15 p-3 space-y-2 bg-white/5">

      <div className="flex items-center justify-between text-[11px] uppercase opacity-70">

        <span>Round {turn.round}</span>

        <span>{new Date(turn.created_at).toLocaleTimeString()}</span>

      </div>

      <div className="text-sm whitespace-pre-wrap leading-relaxed">{turn.text}</div>

      {refs.length > 0 && (
        <div className="text-[11px] space-x-2">
          <span className="opacity-70">Refs:</span>
          {refs.map((cid) => (
            <a
              key={cid}
              className="underline opacity-80 hover:opacity-100"
              href={`/api/essence/${cid}`}
              target="_blank"
              rel="noreferrer"
            >
              {cid.slice(0, 8)}...
            </a>
          ))}
        </div>
      )}

      {turn.verifier_results.length > 0 && (

        <div className="flex flex-wrap gap-2 text-[11px]">

          {turn.verifier_results.map((result) => (

            <span

              key={`${turn.id}-${result.name}`}

              className={`px-2 py-0.5 rounded-full ${

                result.ok ? "bg-emerald-500/20 text-emerald-200" : "bg-rose-500/20 text-rose-200"

              }`}

              title={result.reason}

            >

              {result.ok ? "OK" : "FAIL"} · {result.name}

            </span>

          ))}

        </div>

      )}

    </div>

  );

}



function dedupeIds(values: Array<string | undefined | null>): string[] {
  const trimmed = values
    .map((value) => (value ? value.trim() : ""))
    .filter((value) => value.length > 0);
  return Array.from(new Set(trimmed));
}

const upsertTurn = (

  existing: DebateTurnPayload[],

  incoming: DebateTurnPayload

): DebateTurnPayload[] => {

  const idx = existing.findIndex((turn) => turn.id === incoming.id);

  if (idx >= 0) {

    const copy = [...existing];

    copy[idx] = incoming;

    return copy.sort((a, b) => a.created_at.localeCompare(b.created_at));

  }

  return [...existing, incoming].sort((a, b) => a.created_at.localeCompare(b.created_at));

};

