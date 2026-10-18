import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import DurableTaskPairing from "../../src/components/agent-access/DurableTaskPairing";
import { BoundAgentPromptDisplay } from "../../src/components/helix/ask-console/BoundAgentPromptDisplay";
import type { BrowserReasoningBinding } from "../../src/lib/agent-access/reasoningTaskBinding";

function Fixture() {
  const [binding, setBinding] = useState<BrowserReasoningBinding | null>(null);
  const [chatId, setChatId] = useState("fixture-chat");
  const [profileId, setProfileId] = useState("fixture-owner");
  const [environment, setEnvironment] = useState(document.getElementById("root")?.dataset.environment === "true"
    ? { roomId: "fixture-room", runId: "fixture-run" } : null);
  useEffect(() => {
    const timer = window.setTimeout(() => setEnvironment(null), 180000);
    return () => window.clearTimeout(timer);
  }, []);
  return <>
    <button onClick={() => { setChatId("fixture-chat-other"); setBinding(null); }}>Switch fixture chat</button>
    <button onClick={() => { setProfileId("fixture-other-owner"); setBinding(null); }}>Switch fixture account</button>
    <div data-testid="fixture-profile">{profileId}</div>
    <button onClick={() => setEnvironment({ roomId: "fixture-room", runId: "fixture-fresh-run" })}>Offer fresh fixture run</button>
    <DurableTaskPairing profileId={profileId} chatId={chatId} environment={environment}
      onRuntimeBinding={(value, id) => setBinding(current => value ?? (current?.pairing_id === id ? null : current))} />
    <div data-testid="runtime-binding">{binding ? JSON.stringify(binding) : "unavailable"}</div>
    {binding && <BoundAgentPromptDisplay binding={binding} />}
  </>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
