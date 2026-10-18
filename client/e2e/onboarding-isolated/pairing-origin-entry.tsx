import React from "react";
import { createRoot } from "react-dom/client";
import DurableTaskPairing from "../../src/components/agent-access/DurableTaskPairing";
import { useProfileStorageSync } from "../../src/lib/workstation/profileStorageSync";

// Isolated browser entry only. Account authentication and restore use the real
// HTTP handlers; displayed fixture props do not authorize their requests.
function Fixture() {
  useProfileStorageSync();
  return <DurableTaskPairing profileId={document.getElementById("root")!.dataset.profile!}
    chatId="chat:origin-exact" environment={{ roomId: "room:origin-exact", runId: "run:origin-exact" }} />;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
