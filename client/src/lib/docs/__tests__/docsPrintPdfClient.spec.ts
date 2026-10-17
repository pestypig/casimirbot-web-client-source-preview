/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { DOCS_PRINT_PDF_SCHEMA } from "@shared/docs-print-pdf";
import {
  downloadDocsPrintPdfArtifact,
  requestDocsPrintPdf,
} from "../docsPrintPdfClient";

const responseHeaders = {
  "Content-Type": "application/pdf",
  "X-Docs-PDF-Schema": DOCS_PRINT_PDF_SCHEMA,
  "X-Docs-PDF-Filename": "fixture-print.pdf",
  "X-Docs-PDF-SHA256": "a".repeat(64),
  "X-Docs-PDF-Page-Count": "4",
  "X-Docs-PDF-Equation-Count": "3",
  "X-Docs-PDF-Table-Count": "2",
  "X-Docs-PDF-Validation": "pass",
};

describe("Docs Viewer print PDF client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends the current source and validates the server render receipt", async () => {
    const fetchMock = vi.fn(async () => new Response(
      new Blob(["%PDF-fixture"], { type: "application/pdf" }),
      { status: 200, headers: responseHeaders },
    ));
    vi.stubGlobal("fetch", fetchMock);

    const artifact = await requestDocsPrintPdf({
      title: "Fixture",
      source_path: "docs/fixture.md",
      source_kind: "canonical_docs",
      source_markdown: "# Fixture",
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(String(init?.body))).toEqual({
      schema: DOCS_PRINT_PDF_SCHEMA,
      title: "Fixture",
      source_path: "docs/fixture.md",
      source_kind: "canonical_docs",
      source_markdown: "# Fixture",
    });
    expect(artifact).toMatchObject({
      filename: "fixture-print.pdf",
      sha256: "a".repeat(64),
      page_count: 4,
      equation_count: 3,
      table_count: 2,
      validation: "pass",
    });
    expect(artifact.blob.type).toBe("application/pdf");
  });

  it("fails closed when a successful response has no valid receipt", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      new Blob(["%PDF-fixture"], { type: "application/pdf" }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "X-Docs-PDF-Validation": "pass",
        },
      },
    )));
    await expect(requestDocsPrintPdf({
      title: "Fixture",
      source_path: "docs/fixture.md",
      source_kind: "canonical_docs",
      source_markdown: "# Fixture",
    })).rejects.toThrow("valid render receipt");
  });

  it("downloads the validated artifact as a browser file", () => {
    const createObjectURL = vi.fn(() => "blob:docs-print-pdf");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    vi.useFakeTimers();

    downloadDocsPrintPdfArtifact({
      schema: DOCS_PRINT_PDF_SCHEMA,
      filename: "fixture-print.pdf",
      sha256: "a".repeat(64),
      page_count: 4,
      equation_count: 3,
      table_count: 2,
      validation: "pass",
      blob: new Blob(["%PDF-fixture"], { type: "application/pdf" }),
    });

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(1_000);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:docs-print-pdf");
    vi.useRealTimers();
  });
});
