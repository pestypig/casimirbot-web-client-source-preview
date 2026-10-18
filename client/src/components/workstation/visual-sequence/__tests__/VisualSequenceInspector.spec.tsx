// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import VisualSequenceInspector from "../VisualSequenceInspector";

const responsePayload = {
  ok: true,
  manifest: {
    sequence_id: `vse_${"a".repeat(32)}`,
    source: {
      duration_ms: 10_000,
      variable_frame_rate: true,
      display_width: 160,
      display_height: 90,
      rotation_deg: 0,
    },
    sampling: { selected_count: 10, candidate_count: 10, applied_cadence_ms: 1_000 },
    frames: [{ frame_id: "frame_fixture", decoded_index: 0, pts_ms: 0, sha256: "b".repeat(64), image_ref: "/api/frame.webp" }],
    contact_sheet: { image_ref: "/api/contact-sheet.webp" },
    receipts_ref: "/api/receipts.jsonl",
    alignments_ref: "/api/alignments.jsonl",
    manifest_sha256: "c".repeat(64),
  },
  receipt: { receipt_id: "vse_receipt_fixture" },
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("VisualSequenceInspector", () => {
  it("uploads only after explicit selection and renders inspectable evidence", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(responsePayload), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    render(<VisualSequenceInspector />);

    expect(fetchMock).not.toHaveBeenCalled();
    const file = new File(["fixture"], "clip.mp4", { type: "video/mp4" });
    fireEvent.change(screen.getByLabelText("Choose local video clip"), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "Build evidence artifact" }));

    await waitFor(() => expect(screen.getByTestId("visual-sequence-result")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/visual-sequences");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBeInstanceOf(FormData);
    expect(screen.getByAltText("Timestamped visual-sequence contact sheet").getAttribute("src")).toBe("/api/contact-sheet.webp");
    expect(screen.getByTestId("visual-sequence-authority-boundary").textContent).toContain("model=false");
    expect(screen.getByText("10/10")).toBeTruthy();
  });

  it("shows a typed server failure without manufacturing evidence", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      ok: false,
      error: "corrupt_media",
      message: "The clip is corrupt or has no readable video stream.",
    }), { status: 400, headers: { "Content-Type": "application/json" } })));
    render(<VisualSequenceInspector />);
    const file = new File(["broken"], "broken.mp4", { type: "video/mp4" });
    fireEvent.change(screen.getByLabelText("Choose local video clip"), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "Build evidence artifact" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("corrupt or has no readable video stream");
    expect(screen.queryByTestId("visual-sequence-result")).toBeNull();
  });
});
