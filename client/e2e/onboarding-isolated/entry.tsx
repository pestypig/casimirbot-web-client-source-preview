import React from "react";
import { createRoot } from "react-dom/client";
import { AgentConnectionSetup } from "../../src/components/agent-access/AgentConnectionSetup";
import { AGENT_CONNECTION_SETUP_STORAGE_KEY } from "../../src/components/agent-access/agentConnectionSetupState";
import { useAgiChatStore } from "../../src/store/useAgiChatStore";

// Imported only by the isolated test bundle, never by the application entry.
localStorage.setItem(AGENT_CONNECTION_SETUP_STORAGE_KEY, JSON.stringify({
  schema: AGENT_CONNECTION_SETUP_STORAGE_KEY, selected_profile: "codex_app", viewed_step: "ready",
}));
useAgiChatStore.setState({ activeId: "fixture-chat" });
createRoot(document.getElementById("root")!).render(<AgentConnectionSetup />);
