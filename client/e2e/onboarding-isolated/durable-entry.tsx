import React from "react";
import { createRoot } from "react-dom/client";
import DurableTaskPairing from "../../src/components/agent-access/DurableTaskPairing";
createRoot(document.getElementById("root")!).render(<DurableTaskPairing
  profileId="fixture-owner" chatId="fixture-chat" environment={{ roomId: "fixture-room", runId: "fixture-run" }} />);
