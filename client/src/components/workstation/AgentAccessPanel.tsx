import React from "react";
import AgentAccessGuide from "@/components/agent-access/AgentAccessGuide";
import AgentConnectionSetup from "@/components/agent-access/AgentConnectionSetup";
import LocalPersonalConnectionSetup from "@/components/agent-access/LocalPersonalConnectionSetup";

export default function AgentAccessPanel() {
  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top,_rgba(8,145,178,0.12),_transparent_36%),#020617]">
      <div className="px-4 pt-4">
        <LocalPersonalConnectionSetup />
        <AgentConnectionSetup />
      </div>
      <details className="mx-4 my-4 rounded-xl border border-white/10 bg-slate-950/70">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-200">Advanced manual setup</summary>
        <AgentAccessGuide compact />
      </details>
    </div>
  );
}
