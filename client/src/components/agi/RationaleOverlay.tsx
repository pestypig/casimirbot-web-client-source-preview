import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Copy } from "lucide-react";
import type { WhyBelongs, WhyBelongsItem, WhyBelongsSummary, RationaleTag, SpanRef } from "@shared/rationale";

const TAG_META: Record<
  RationaleTag,
  {
    label: string;
    description: string;
    color: string;
    bg: string;
  }
> = {
  evidence: {
    label: "Evidence",
    description: "Quotes, telemetry, or docs the agent actually saw.",
    color: "#1F9D55",
    bg: "bg-emerald-500/10",
  },
  assumption: {
    label: "Assumption",
    description: "Defaults or priors used when data was missing.",
    color: "#E8A317",
    bg: "bg-amber-500/10",
  },
  inference: {
    label: "Inference",
    description: "Logic that connects evidence + assumptions.",
    color: "#276EF1",
    bg: "bg-sky-500/10",
  },
  speculation: {
    label: "Speculation",
    description: "Unknowns, refusals, or failed verifications.",
    color: "#D64545",
    bg: "bg-rose-500/10",
  },
};

const SUMMARY_KEY: Record<RationaleTag, keyof WhyBelongsSummary> = {
  evidence: "evidence",
  assumption: "assumptions",
  inference: "inferences",
  speculation: "speculation",
};

const TAG_ORDER: RationaleTag[] = ["evidence", "assumption", "inference", "speculation"];

type RationaleOverlayProps = {
  why: WhyBelongs;
};

export function RationaleOverlay({ why }: RationaleOverlayProps) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<RationaleTag | "all">("all");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const summary = useMemo<WhyBelongsSummary>(() => {
    if (why.summary) return why.summary;
    return computeSummary(why.items);
  }, [why]);
  const filteredItems = useMemo(() => {
    if (filter === "all") {
      return why.items;
    }
    return why.items.filter((item) => item.tag === filter);
  }, [filter, why.items]);

  const { highlight, clear } = useRationaleHighlights();

  useEffect(() => {
    if (!open) {
      clear();
    }
  }, [open, clear]);

  if (!why.items.length) {
    return null;
  }

  const handleCopy = async () => {
    try {
      await copyAudit(why, summary);
      setCopyState("copied");
      setTimeout(() => setCopyState("idle"), 1500);
    } catch (error) {
      console.error("Copy rationale audit failed:", error);
      setCopyState("error");
      setTimeout(() => setCopyState("idle"), 1500);
    }
  };

  const totalItems = summary.assumptions + summary.evidence + summary.inferences + summary.speculation;

  return (
    <div className="w-full max-w-3xl text-[13px] text-slate-300">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left text-xs font-semibold tracking-wide text-slate-100 transition hover:border-white/30"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <span className="uppercase tracking-[0.3em] text-[10px] text-slate-400">Why this answer?</span>
          <DotStack summary={summary} />
        </span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="mt-3 space-y-3 rounded-2xl border border-white/10 bg-black/40 p-4">
          <div className="flex flex-col gap-2 text-sm text-slate-100">
            <p className="font-semibold leading-snug">{why.claim}</p>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-[12px] text-sky-300 underline underline-offset-4 hover:text-sky-200"
              onClick={() => void handleCopy()}
            >
              <Copy className="h-3.5 w-3.5" />
              {copyState === "copied" ? "Copied audit" : copyState === "error" ? "Copy failed" : "Copy audit"}
            </button>
          </div>
          <Legend
            summary={summary}
            active={filter}
            total={totalItems}
            onChange={(next) => setFilter((prev) => (prev === next ? "all" : next))}
          />
          <div className="max-h-64 space-y-2 overflow-auto pr-1">
            {filteredItems.map((item, index) => (
              <RationaleItemCard
                key={`${item.tag}-${index}-${item.message.slice(0, 24)}`}
                item={item}
                onHover={(spans) => highlight(item.tag, spans)}
                onLeave={clear}
              />
            ))}
            {filteredItems.length === 0 && (
              <div className="rounded-xl border border-dashed border-white/10 px-3 py-6 text-center text-[12px] text-slate-500">
                No items tagged as {filter}.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DotStack({ summary }: { summary: WhyBelongsSummary }) {
  return (
    <span className="flex items-center gap-2">
      {TAG_ORDER.map((tag) => (
        <span key={tag} className="flex items-center gap-1 text-[11px]">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: TAG_META[tag].color }}
            aria-hidden="true"
          />
          <span>{summary[SUMMARY_KEY[tag]]}</span>
        </span>
      ))}
    </span>
  );
}

function Legend({
  summary,
  active,
  total,
  onChange,
}: {
  summary: WhyBelongsSummary;
  active: RationaleTag | "all";
  total: number;
  onChange: (tag: RationaleTag) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 text-[11px]">
      <span className="mr-2 inline-flex items-center gap-1 rounded-full border border-white/10 px-3 py-1 text-slate-300">
        Total {total}
      </span>
      {TAG_ORDER.map((tag) => {
        const meta = TAG_META[tag];
        const count = summary[SUMMARY_KEY[tag]];
        const isActive = active === tag;
        return (
          <button
            key={tag}
            type="button"
            onClick={() => onChange(tag)}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 transition ${
              isActive ? "border-white/70 bg-white/10 text-white" : "border-white/10 text-slate-300 hover:border-white/30"
            }`}
            aria-pressed={isActive}
          >
            <span className="flex items-center gap-1">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: meta.color }}
                aria-hidden="true"
              />
              {meta.label}
            </span>
            <span className="font-semibold text-white">{count}</span>
          </button>
        );
      })}
    </div>
  );
}

function RationaleItemCard({
  item,
  onHover,
  onLeave,
}: {
  item: WhyBelongsItem;
  onHover: (spans?: SpanRef[]) => void;
  onLeave: () => void;
}) {
  const meta = TAG_META[item.tag];
  return (
    <article
      className={`rounded-xl border border-white/10 px-3 py-2 text-[13px] text-slate-100 shadow-sm transition hover:border-white/30 ${meta.bg}`}
      onMouseEnter={() => onHover(item.spans)}
      onMouseLeave={onLeave}
      onFocus={() => onHover(item.spans)}
      onBlur={onLeave}
      tabIndex={0}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: meta.color }}>
          {meta.label}
        </span>
        {typeof item.confidence === "number" && (
          <span className="text-[11px] text-slate-300">{Math.round(item.confidence * 100)}% conf</span>
        )}
      </div>
      <p className="mt-1 text-[13px] leading-relaxed text-slate-100">{item.message}</p>
      {item.source && (
        <div className="mt-2 rounded-lg border border-white/10 bg-black/30 p-2 text-[11px] leading-snug text-slate-300">
          <div className="font-semibold uppercase tracking-wide text-[10px] text-slate-400">
            Source: {item.source.kind} → {item.source.ref}
          </div>
          {item.source.excerpt && <p className="mt-1 text-slate-200">{item.source.excerpt}</p>}
        </div>
      )}
    </article>
  );
}

function computeSummary(items: WhyBelongsItem[]): WhyBelongsSummary {
  return items.reduce<WhyBelongsSummary>(
    (acc, item) => {
      const key = SUMMARY_KEY[item.tag];
      acc[key] += 1;
      return acc;
    },
    { evidence: 0, assumptions: 0, inferences: 0, speculation: 0 },
  );
}

async function copyAudit(why: WhyBelongs, summary: WhyBelongsSummary): Promise<void> {
  const payload = {
    claim: why.claim,
    summary,
    items: why.items.map((item) => ({
      tag: item.tag,
      message: item.message,
      source: item.source,
      confidence: item.confidence,
    })),
  };
  const text = `${why.claim}\n\n${JSON.stringify(payload, null, 2)}`;
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    await navigator.clipboard.writeText(text);
    return;
  }
  throw new Error("Clipboard API unavailable");
}

function useRationaleHighlights() {
  const nodesRef = useRef<HTMLElement[]>([]);

  const clear = useCallback(() => {
    if (!nodesRef.current.length) return;
    for (const node of nodesRef.current) {
      node?.style?.removeProperty("--rationale-color");
      if (node?.dataset) {
        delete node.dataset.rationaleHighlight;
        delete node.dataset.rationaleTag;
      }
    }
    nodesRef.current = [];
  }, []);

  const highlight = useCallback(
    (tag: RationaleTag, spans?: SpanRef[]) => {
      clear();
      if (!spans || spans.length === 0 || typeof document === "undefined") {
        return;
      }
      const color = TAG_META[tag].color;
      for (const span of spans) {
        if (!span || span.kind !== "dom" || !span.target) continue;
        let targets: NodeListOf<HTMLElement>;
        try {
          targets = document.querySelectorAll<HTMLElement>(span.target);
        } catch {
          continue;
        }
        targets.forEach((node) => {
          node.dataset.rationaleHighlight = "true";
          node.dataset.rationaleTag = tag;
          node.style.setProperty("--rationale-color", color);
          nodesRef.current.push(node);
        });
      }
    },
    [clear],
  );

  useEffect(() => clear, [clear]);

  return { highlight, clear };
}
