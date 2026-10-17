import React from "react";
import {
  ArrowUpRight,
  Braces,
  KeyRound,
  Network,
  PlugZap,
  ShieldCheck,
} from "lucide-react";
import {
  AGENT_ACCESS_CONTENT,
  type AgentAccessContent,
} from "@/lib/agent-access/agentAccessContent";

export type AgentAccessGuideProps = {
  compact?: boolean;
  content?: AgentAccessContent;
};

const endpointBadgeClass = (isProtected: boolean): string =>
  isProtected
    ? "border-amber-300/30 bg-amber-400/10 text-amber-100"
    : "border-cyan-300/25 bg-cyan-400/10 text-cyan-100";

export function AgentAccessGuide({
  compact = false,
  content = AGENT_ACCESS_CONTENT,
}: AgentAccessGuideProps) {
  return (
    <div
      className={
        compact
          ? "space-y-4 p-4 text-slate-100"
          : "mx-auto w-full max-w-6xl space-y-8 px-4 py-8 text-slate-100 sm:px-6 lg:px-8"
      }
      data-agent-access-guide={compact ? "panel" : "page"}
    >
      <header className={compact ? "space-y-2" : "space-y-3"}>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
          <Network className="h-4 w-4" aria-hidden="true" />
          {content.eyebrow}
        </div>
        <h1
          className={
            compact
              ? "text-2xl font-semibold tracking-tight text-white"
              : "text-4xl font-semibold tracking-tight text-white sm:text-5xl"
          }
        >
          {content.title}
        </h1>
        <p className="max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">
          {content.summary}
        </p>
      </header>

      <section
        className="rounded-xl border border-amber-300/30 bg-amber-400/10 p-4 shadow-[0_18px_70px_-45px_rgba(251,191,36,0.7)] sm:p-5"
        aria-labelledby="agent-access-connection-title"
      >
        <div className="flex items-start gap-3">
          <div className="rounded-lg border border-amber-300/30 bg-amber-300/10 p-2 text-amber-100">
            <PlugZap className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2
              id="agent-access-connection-title"
              className="text-base font-semibold text-amber-50"
            >
              {content.connectionNotice.title}
            </h2>
            <p className="mt-2 text-sm leading-6 text-amber-50/85">
              {content.connectionNotice.body}
            </p>
            <p className="mt-2 flex items-start gap-2 text-xs leading-5 text-amber-100/70">
              <KeyRound
                className="mt-0.5 h-3.5 w-3.5 shrink-0"
                aria-hidden="true"
              />
              <span>{content.connectionNotice.credentialSafety}</span>
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-cyan-300/20 bg-cyan-400/5 p-4 sm:p-5" aria-labelledby="agent-access-public-context-title">
        <h2 id="agent-access-public-context-title" className="text-lg font-semibold text-cyan-50">
          {content.publicContext.title}
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-300">{content.publicContext.intro}</p>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-300">
          {content.publicContext.lenses.map((lens) => (
            <li key={lens.title}><strong>{lens.title}:</strong> {lens.summary}</li>
          ))}
        </ul>
        <p className="mt-3 text-sm leading-6 text-slate-300">{content.publicContext.example}</p>
        <a className="mt-3 inline-block text-sm font-medium text-cyan-300 underline" href={content.publicContext.url}>
          Read public reasoning context and source notes
        </a>
      </section>

      <section
        className="rounded-xl border border-cyan-300/20 bg-cyan-400/5 p-4 sm:p-5"
        aria-labelledby="agent-access-reasoning-title"
      >
        <h2 id="agent-access-reasoning-title" className="text-lg font-semibold text-cyan-50">
          {content.reasoningBrief.title}
        </h2>
        <p className="mt-2 text-sm leading-6 text-cyan-50/80">
          {content.reasoningBrief.intro}
        </p>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-300">
          {content.reasoningBrief.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <p className="mt-3 text-xs leading-5 text-cyan-100/75">
          {content.reasoningBrief.boundary}
        </p>
      </section>

      <section aria-labelledby="agent-access-endpoints-title">
        <div className="mb-3 flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-cyan-300" aria-hidden="true" />
          <h2
            id="agent-access-endpoints-title"
            className="text-lg font-semibold text-white"
          >
            Canonical endpoints
          </h2>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {content.endpoints.map((endpoint) => (
            <article
              key={endpoint.id}
              className="rounded-xl border border-white/10 bg-slate-950/70 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-100">
                  {endpoint.label}
                </h3>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${endpointBadgeClass(
                    endpoint.protected,
                  )}`}
                >
                  {endpoint.protected ? "OAuth protected" : "Public discovery"}
                </span>
              </div>
              <a
                href={endpoint.url}
                target="_blank"
                rel="noreferrer"
                className="mt-3 flex min-w-0 items-start gap-1.5 break-all font-mono text-xs leading-5 text-cyan-200 hover:text-cyan-100"
              >
                <span>{endpoint.url}</span>
                <ArrowUpRight
                  className="mt-0.5 h-3.5 w-3.5 shrink-0"
                  aria-hidden="true"
                />
              </a>
              <p className="mt-2 text-xs leading-5 text-slate-400">
                {endpoint.description}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="agent-access-provider-title">
        <div className="mb-3 flex items-center gap-2">
          <Braces className="h-5 w-5 text-cyan-300" aria-hidden="true" />
          <h2
            id="agent-access-provider-title"
            className="text-lg font-semibold text-white"
          >
            Provider connection examples
          </h2>
        </div>
        <div className={compact ? "space-y-3" : "grid gap-4 xl:grid-cols-2"}>
          {content.providers.map((guide) => (
            <article
              key={guide.id}
              className="overflow-hidden rounded-xl border border-white/10 bg-slate-950/75"
            >
              <div className="border-b border-white/10 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-300">
                  {guide.provider}
                </p>
                <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-base font-semibold text-white">
                    {guide.surface}
                  </h3>
                  <span className="text-[11px] text-slate-500">
                    {guide.format}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-400">
                  {guide.summary}
                </p>
              </div>
              <pre className="max-w-full overflow-x-auto bg-black/35 p-4 text-[11px] leading-5 text-emerald-100">
                <code>{guide.snippet}</code>
              </pre>
              <div className="space-y-3 border-t border-white/10 p-4">
                <p className="text-xs leading-5 text-slate-300">
                  <span className="font-semibold text-slate-100">
                    Authentication:{" "}
                  </span>
                  {guide.authentication}
                </p>
                <ul className="space-y-1 text-xs leading-5 text-slate-400">
                  {guide.notes.map((note) => (
                    <li key={note} className="flex gap-2">
                      <span className="text-cyan-400" aria-hidden="true">
                        -
                      </span>
                      <span>{note}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </div>
      </section>

      <div className="grid gap-3 md:grid-cols-2">
        <section className="rounded-xl border border-white/10 bg-slate-950/70 p-4">
          <h2 className="text-sm font-semibold text-white">
            {content.lifecycle.title}
          </h2>
          <p className="mt-2 text-xs leading-5 text-slate-400">
            {content.lifecycle.body}
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {content.lifecycle.statuses.map((status) => (
              <code
                key={status}
                className="rounded border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-slate-300"
              >
                {status}
              </code>
            ))}
          </div>
        </section>
        <section className="rounded-xl border border-cyan-300/20 bg-cyan-400/5 p-4">
          <h2 className="text-sm font-semibold text-cyan-50">
            {content.authority.title}
          </h2>
          <p className="mt-2 text-xs leading-5 text-cyan-50/70">
            {content.authority.body}
          </p>
        </section>
      </div>
    </div>
  );
}

export default AgentAccessGuide;
