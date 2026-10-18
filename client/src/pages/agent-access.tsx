import React from "react";
import { ArrowLeft, MonitorCog } from "lucide-react";
import { Link } from "wouter";
import AgentAccessGuide from "@/components/agent-access/AgentAccessGuide";
import AgentConnectionSetup from "@/components/agent-access/AgentConnectionSetup";
import { AGENT_ACCESS_CONTENT } from "@/lib/agent-access/agentAccessContent";
import { buildWorkstationEntryUrl } from "@shared/workstation-link-meta";

const workstationUrl =
  AGENT_ACCESS_CONTENT.endpoints.find((endpoint) => endpoint.id === "workstation")
    ?.url ??
  buildWorkstationEntryUrl({
    search: "?panels=agent-access&focus=agent-access",
    entry: "workstation",
  });

export default function AgentAccessPage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(8,145,178,0.16),_transparent_34%),linear-gradient(180deg,#020617_0%,#07111f_55%,#020617_100%)]">
      <nav
        className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 pt-5 sm:px-6 lg:px-8"
        aria-label="Agent access navigation"
      >
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-200 transition hover:bg-white/10 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          CasimirBot home
        </Link>
        <a
          href={workstationUrl}
          className="inline-flex items-center gap-2 rounded-lg border border-cyan-300/25 bg-cyan-400/10 px-3 py-2 text-xs font-medium text-cyan-100 transition hover:bg-cyan-400/15"
        >
          <MonitorCog className="h-4 w-4" aria-hidden="true" />
          Open workstation configuration
        </a>
      </nav>
      <div className="mx-auto w-full max-w-6xl px-4 pt-8 sm:px-6 lg:px-8">
        <AgentConnectionSetup />
      </div>
      <AgentAccessGuide />
    </main>
  );
}
