import React, { useEffect, useId, useState } from "react";

const HELIX_ASK_MERMAID_MAX_SOURCE_CHARS = 20_000;

type HelixAskMermaidRenderState =
  | { status: "loading"; svg: null; error: null }
  | { status: "rendered"; svg: string; error: null }
  | { status: "error"; svg: null; error: string };

export type HelixAskMermaidBlockProps = {
  source: string;
};

function mermaidErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  return "mermaid_render_failed";
}

export function HelixAskMermaidBlock({ source }: HelixAskMermaidBlockProps) {
  const reactId = useId();
  const renderId = `helix-ask-mermaid-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const [renderState, setRenderState] = useState<HelixAskMermaidRenderState>({
    status: "loading",
    svg: null,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    const diagramSource = source.trim();
    setRenderState({ status: "loading", svg: null, error: null });

    if (!diagramSource) {
      setRenderState({ status: "error", svg: null, error: "empty_mermaid_source" });
      return () => {
        cancelled = true;
      };
    }
    if (diagramSource.length > HELIX_ASK_MERMAID_MAX_SOURCE_CHARS) {
      setRenderState({ status: "error", svg: null, error: "mermaid_source_too_large" });
      return () => {
        cancelled = true;
      };
    }

    void import("mermaid")
      .then(async ({ default: mermaid }) => {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "dark",
          flowchart: { htmlLabels: false },
        });
        return mermaid.render(renderId, diagramSource);
      })
      .then(({ svg }) => {
        if (!cancelled) setRenderState({ status: "rendered", svg, error: null });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setRenderState({ status: "error", svg: null, error: mermaidErrorMessage(error) });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [renderId, source]);

  return (
    <div
      className="my-2 overflow-x-auto rounded-md border border-cyan-300/15 bg-slate-950/55 p-3"
      data-testid="helix-ask-final-answer-mermaid-block"
      data-diagram-language="mermaid"
      data-diagram-renderer="mermaid"
      data-diagram-status={renderState.status}
    >
      {renderState.status === "rendered" ? (
        <div
          className="min-w-fit [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full"
          role="img"
          aria-label="Diagram from the final answer"
          dangerouslySetInnerHTML={{ __html: renderState.svg }}
        />
      ) : renderState.status === "error" ? (
        <div>
          <div className="mb-2 text-[10px] uppercase tracking-[0.12em] text-amber-200/80">
            Diagram source (rendering unavailable)
          </div>
          <pre
            className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-slate-200 [overflow-wrap:anywhere]"
            data-diagram-error={renderState.error}
          >
            <code>{source}</code>
          </pre>
        </div>
      ) : (
        <div className="text-xs text-cyan-100/70" role="status">
          Rendering diagram…
        </div>
      )}
    </div>
  );
}
