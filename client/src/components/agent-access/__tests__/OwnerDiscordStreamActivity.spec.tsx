// @vitest-environment jsdom
import React from "react";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { OwnerDiscordStreamActivity } from "../OwnerDiscordStreamActivity";

const { readGrants } = vi.hoisted(() => ({ readGrants: vi.fn(() => ({})) }));
vi.mock("../useGrantedCodexStreamActivity", () => ({
  useGrantedCodexStreamActivity: readGrants,
}));

afterEach(() => { cleanup(); delete window.casimirDesktop; vi.clearAllMocks(); });

it("keeps the approved activity collector running after the Float is hidden", async () => {
  const showMessageCloud = vi.fn(async () => ({ status: "showing" }));
  const onActivityFrame = vi.fn();
  window.casimirDesktop = { showMessageCloud } as unknown as NonNullable<Window["casimirDesktop"]>;
  render(<OwnerDiscordStreamActivity roomId="room:owner" open={false} streamActive
    grants={[]} adapterPages={[]} onActivityFrame={onActivityFrame} />);
  await waitFor(() => expect(onActivityFrame).toHaveBeenCalledWith(expect.objectContaining({
    source: "session_activity", helixConversationId: "room:owner",
  })));
  expect(readGrants).toHaveBeenCalledWith([], true);
  expect(showMessageCloud).not.toHaveBeenCalled();
});
