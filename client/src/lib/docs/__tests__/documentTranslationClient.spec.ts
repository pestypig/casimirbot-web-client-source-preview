import { afterEach, describe, expect, it, vi } from "vitest";
import {
  enqueueDocumentMarkdownTranslationMail,
  extractDocumentMarkdownTranslationsFromRuns,
  listDocumentMarkdownTranslationLaneSessions,
  resolveDocumentTranslationTargetLanguage,
  runDocumentMarkdownTranslationLaneSessionControl,
  type DocumentMarkdownTranslationEntry,
} from "@/lib/docs/documentTranslationClient";
import type { StagePlayMicroReasonerRunV1 } from "@shared/contracts/stage-play-live-source-mail.v1";

const baseRun = {
  artifactId: "stage_play_micro_reasoner_run",
  schemaVersion: "stage_play_micro_reasoner_run/v1",
  runId: "run-doc-1",
  role: "packet_composer",
  jobId: "job-doc-1",
  sourceId: "document_markdown:docs/example.md",
  mailIds: ["mail-doc-1"],
  inputRefs: [],
  outputRefs: [],
  inputPreview: "",
  outputPreview: "",
  status: "completed",
  modelUsed: "test-document-translator",
  startedAt: "2026-06-17T12:00:00.000Z",
  completedAt: "2026-06-17T12:00:01.000Z",
  assistant_answer: false,
  terminal_eligible: false,
  raw_content_included: false,
  context_role: "micro_reasoner_evidence",
} satisfies StagePlayMicroReasonerRunV1;

const originalFetch = globalThis.fetch;

describe("document translation MicroDeck output parsing", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("resolves regional account locales to stable translation target languages", () => {
    expect(resolveDocumentTranslationTargetLanguage("es-US")).toBe("es");
    expect(resolveDocumentTranslationTargetLanguage("pt_BR")).toBe("pt");
    expect(resolveDocumentTranslationTargetLanguage("haw")).toBe("haw");
  });

  it("applies the document deck, enqueues visible units, and runs a wake cycle", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, preset: { presetId: "document-preset" } }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          sourceId: "document_markdown:docs/example.md",
          sourceKind: "document_markdown",
          mail: { mailId: "mail-doc-1" },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, cycle: { result: { wakeRequestId: "wake-doc-1" } } }),
      } as Response) as unknown as typeof fetch;
    globalThis.fetch = fetchMock;

    await enqueueDocumentMarkdownTranslationMail({
      docPath: "docs/example.md",
      locale: "haw",
      sourceHash: "fnv1a32:test",
      sourceTextHash: "fnv1a32:text-payload",
      sourceTextCharCount: "Example Heading".length,
      sourceId: "document_markdown:docs/example.md",
      chunkId: "doc-inline:fnv1a32:test:u0001",
      laneSessionId: "lane-session-docs",
      sessionControlKey: "lane-session-docs::document_markdown:docs/example.md::fnv1a32:test::docs_chunk::haw::haw",
      sourceBindingKey: "document_markdown:docs/example.md::fnv1a32:test::docs_chunk::haw::haw",
      mailLoopObservationKey:
        "document_markdown:docs/example.md::fnv1a32:test::document_markdown::docs_chunk::haw::haw::doc-inline:fnv1a32:test:u0001::receipt:doc-inline",
      receiptRef: "receipt:doc-inline",
      units: [
        {
          unit_id: "u0001",
          kind: "heading",
          source_markdown: "Example Heading",
          translatable: true,
          protected_spans: [],
        },
      ],
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[0]?.[0] ?? "")).toBe("/api/helix/stage-play/micro-reasoner-prompt-preset/apply");
    expect(String(fetchMock.mock.calls[1]?.[0] ?? "")).toBe("/api/helix/stage-play/live-source-mail/document-markdown");
    expect(String(fetchMock.mock.calls[2]?.[0] ?? "")).toBe("/api/helix/stage-play/live-source-mail/wake/cycle");
    const wakeBody = JSON.parse(String((fetchMock.mock.calls[2]?.[1] as RequestInit | undefined)?.body ?? "{}"));
    const mailBody = JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit | undefined)?.body ?? "{}"));
    expect(mailBody.chunkId).toBe("doc-inline:fnv1a32:test:u0001");
    expect(mailBody).toMatchObject({
      locale: "haw",
      targetLanguage: "haw",
      accountLocale: "haw",
      translationContractVersion: "target-language-v2",
      sourceTextHash: "fnv1a32:text-payload",
      sourceTextCharCount: "Example Heading".length,
      laneSessionId: "lane-session-docs",
      sessionControlKey: "lane-session-docs::document_markdown:docs/example.md::fnv1a32:test::docs_chunk::haw::haw",
      sourceBindingKey: "document_markdown:docs/example.md::fnv1a32:test::docs_chunk::haw::haw",
      projectionTarget: "docs_chunk",
      sourceIdentityKey:
        "document_markdown:docs/example.md::fnv1a32:test::fnv1a32:text-payload::15::docs::docs_chunk::haw::haw",
      latestSourceIdentityKey:
        "document_markdown:docs/example.md::fnv1a32:test::fnv1a32:text-payload::15::docs::docs_chunk::haw::haw",
      mailLoopObservationKey:
        "document_markdown:docs/example.md::fnv1a32:test::document_markdown::docs_chunk::haw::haw::doc-inline:fnv1a32:test:u0001::receipt:doc-inline",
      receiptRef: "receipt:doc-inline",
    });
    expect(wakeBody).toMatchObject({
      threadId: "helix-ask:desktop",
      sourceId: "document_markdown:docs/example.md",
      manualRun: true,
      executeHiddenAsk: false,
    });
  });

  it("keeps private Research Library mail inside the server-issued account mailbox", async () => {
    const privateMailbox = "helix-ask:private-research:account-token";
    const docPath = "research-library/private-research%3Aaccount-token%3Adocument-token";
    const sourceId = `document_markdown:${docPath}`;
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          sourceId,
          sourceKind: "document_markdown",
          mailboxThreadId: privateMailbox,
          mail: { mailId: "mail-private-doc-1" },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, cycle: { result: { wakeRequestId: "wake-private-doc-1" } } }),
      } as Response) as unknown as typeof fetch;
    globalThis.fetch = fetchMock;

    const result = await enqueueDocumentMarkdownTranslationMail({
      docPath,
      locale: "es-US",
      sourceHash: "fnv1a32:private",
      sourceId,
      documentSourceKind: "research_library",
      documentId: "raw-document-id",
      documentRef: "private-research:account-token:document-token",
      privateSource: true,
      units: [
        {
          unit_id: "u0001",
          kind: "paragraph",
          source_markdown: "Private source text",
          translatable: true,
          protected_spans: [],
        },
      ],
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0] ?? "")).toBe(
      "/api/helix/stage-play/live-source-mail/document-markdown",
    );
    expect(String(fetchMock.mock.calls[1]?.[0] ?? "")).toBe(
      "/api/helix/stage-play/live-source-mail/wake/cycle",
    );
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.credentials).toBe("same-origin");
    expect((fetchMock.mock.calls[1]?.[1] as RequestInit | undefined)?.credentials).toBe("same-origin");
    const mailBody = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.body ?? "{}"));
    expect(mailBody).toMatchObject({
      docPath,
      sourceId,
      documentSourceKind: "research_library",
      documentId: "raw-document-id",
      documentRef: "private-research:account-token:document-token",
      privateSource: true,
    });
    const wakeBody = JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit | undefined)?.body ?? "{}"));
    expect(wakeBody).toMatchObject({ threadId: privateMailbox, sourceId });
    expect(result.mailboxThreadId).toBe(privateMailbox);
  });

  it.each([undefined, "helix-ask:desktop"])(
    "rejects a private Research Library response without a scoped mailbox (%s)",
    async (mailboxThreadId) => {
      const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          sourceId: "document_markdown:research-library/private-document",
          sourceKind: "document_markdown",
          mailboxThreadId,
          mail: { mailId: "mail-private-doc-1" },
        }),
      } as Response) as unknown as typeof fetch;
      globalThis.fetch = fetchMock;

      await expect(enqueueDocumentMarkdownTranslationMail({
        docPath: "research-library/private-document",
        locale: "haw",
        sourceHash: "fnv1a32:private",
        documentSourceKind: "research_library",
        documentRef: "private-document",
        privateSource: true,
        units: [
          {
            unit_id: "u0001",
            kind: "paragraph",
            source_markdown: "Private source text",
            translatable: true,
            protected_spans: [],
          },
        ],
      })).rejects.toThrow("did not include a scoped mailbox");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it("preserves distinct account locale and target language in document lane mail identity", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, preset: { presetId: "document-preset" } }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          sourceId: "document_markdown:docs/example.md",
          sourceKind: "document_markdown",
          mail: { mailId: "mail-doc-1" },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, cycle: { result: { wakeRequestId: "wake-doc-1" } } }),
      } as Response) as unknown as typeof fetch;
    globalThis.fetch = fetchMock;

    await enqueueDocumentMarkdownTranslationMail({
      docPath: "docs/example.md",
      locale: "es-US",
      accountLocale: "es-US",
      targetLanguage: "es",
      sourceHash: "fnv1a32:test",
      sourceTextHash: "fnv1a32:text-payload",
      sourceTextCharCount: "Example Heading".length,
      sourceId: "document_markdown:docs/example.md",
      chunkId: "doc-inline:fnv1a32:test:u0001",
      units: [
        {
          unit_id: "u0001",
          kind: "heading",
          source_markdown: "Example Heading",
          translatable: true,
          protected_spans: [],
        },
      ],
    });

    const mailBody = JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit | undefined)?.body ?? "{}"));
    expect(mailBody).toMatchObject({
      locale: "es-US",
      accountLocale: "es-US",
      targetLanguage: "es",
      projectionTarget: "docs_chunk",
      sourceIdentityKey:
        "document_markdown:docs/example.md::fnv1a32:test::fnv1a32:text-payload::15::docs::docs_chunk::es-US::es",
      latestSourceIdentityKey:
        "document_markdown:docs/example.md::fnv1a32:test::fnv1a32:text-payload::15::docs::docs_chunk::es-US::es",
    });
  });

  it("derives the translation target from account locale when no target language is provided", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, preset: { presetId: "document-preset" } }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          sourceId: "document_markdown:docs/example.md",
          sourceKind: "document_markdown",
          mail: { mailId: "mail-doc-1" },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, cycle: { result: { wakeRequestId: "wake-doc-1" } } }),
      } as Response) as unknown as typeof fetch;
    globalThis.fetch = fetchMock;

    await enqueueDocumentMarkdownTranslationMail({
      docPath: "docs/example.md",
      locale: "es-US",
      sourceHash: "fnv1a32:test",
      sourceTextHash: "fnv1a32:text-payload",
      sourceTextCharCount: "Example Heading".length,
      sourceId: "document_markdown:docs/example.md",
      chunkId: "doc-inline:fnv1a32:test:u0001",
      units: [
        {
          unit_id: "u0001",
          kind: "heading",
          source_markdown: "Example Heading",
          translatable: true,
          protected_spans: [],
        },
      ],
    });

    const mailBody = JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit | undefined)?.body ?? "{}"));
    expect(mailBody).toMatchObject({
      locale: "es-US",
      accountLocale: "es-US",
      targetLanguage: "es",
      sourceIdentityKey:
        "document_markdown:docs/example.md::fnv1a32:test::fnv1a32:text-payload::15::docs::docs_chunk::es-US::es",
      latestSourceIdentityKey:
        "document_markdown:docs/example.md::fnv1a32:test::fnv1a32:text-payload::15::docs::docs_chunk::es-US::es",
    });
  });

  it("normalizes legacy inline projection targets before building document mail identity", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, preset: { presetId: "document-preset" } }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          sourceId: "document_markdown:docs/example.md",
          sourceKind: "document_markdown",
          mail: { mailId: "mail-doc-1" },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, cycle: { result: { wakeRequestId: "wake-doc-1" } } }),
      } as Response) as unknown as typeof fetch;
    globalThis.fetch = fetchMock;

    await enqueueDocumentMarkdownTranslationMail({
      docPath: "docs/example.md",
      locale: "es-US",
      sourceHash: "fnv1a32:test",
      sourceTextHash: "fnv1a32:text-payload",
      sourceTextCharCount: "Example Heading".length,
      sourceId: "document_markdown:docs/example.md",
      chunkId: "doc-inline:fnv1a32:test:u0001",
      projectionTarget: "docs_viewer.inline_translation",
      units: [
        {
          unit_id: "u0001",
          kind: "heading",
          source_markdown: "Example Heading",
          translatable: true,
          protected_spans: [],
        },
      ],
    });

    const mailBody = JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit | undefined)?.body ?? "{}"));
    expect(mailBody).toMatchObject({
      projectionTarget: "docs_chunk",
      sourceBindingKey: "document_markdown:docs/example.md::fnv1a32:test::docs_chunk::es-US::es",
      sourceIdentityKey:
        "document_markdown:docs/example.md::fnv1a32:test::fnv1a32:text-payload::15::docs::docs_chunk::es-US::es",
    });
  });

  it("runs governed document translation lane session control through AGI session endpoint", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          schema: "helix.capability_lane.session_control_response.v1",
          ok: true,
          agent_runtime: "helix",
          capability_lane_session_results: [
            {
              ok: true,
              action: "start",
              lane_id: "live_translation",
              lane_session: {
                lane_session_id: "lane-session-docs",
                selected_runtime_agent_provider: "helix",
                selected_backend_provider: "live_translation.local_runtime",
              },
              answer_authority: false,
              assistant_answer: false,
              terminal_eligible: false,
              raw_content_included: false,
            },
          ],
          capability_lane_session_debug_summaries: [
            {
              lane_session_id: "lane-session-docs",
              lane_id: "live_translation",
              lifecycle_action: "start",
              session_status: "running",
              session_control_key:
                "lane-session-docs::document_markdown:docs/example.md::fnv1a32:test::docs_chunk::haw::haw",
              source_binding_key: "document_markdown:docs/example.md::fnv1a32:test::docs_chunk::haw::haw",
              assistant_answer: false,
              terminal_eligible: false,
              raw_content_included: false,
            },
          ],
          capability_lane_turn_timeline: [
            {
              schema: "helix.capability_lane.provider_timeline_event.v1",
              stage: "lane_session",
              lane_id: "live_translation",
              lane_session_id: "lane-session-docs",
              selected_runtime_agent_provider: "helix",
              session_lifecycle_action: "start",
              session_control_key:
                "lane-session-docs::document_markdown:docs/example.md::fnv1a32:test::docs_chunk::haw::haw",
              lane_visible: false,
              lane_requested: true,
              lane_executed: false,
              answer_authority: false,
              assistant_answer: false,
              terminal_eligible: false,
              raw_content_included: false,
            },
          ],
          capability_lane_timeline_summary: {
            schema: "helix.capability_lane.timeline_summary.v1",
            session_count: 1,
            visible_lane_does_not_mean_executed: true,
          },
          model_visible_capability_lane_manifest: {
            schema: "helix.agent_model_visible_capability_lane_manifest.v1",
            lanes: [
              {
                lane_id: "live_translation",
                requestable_by_runtime_provider: true,
              },
            ],
          },
          terminal_eligible: false,
          assistant_answer: false,
          raw_content_included: false,
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    ) as unknown as typeof fetch;
    globalThis.fetch = fetchMock;

    const response = await runDocumentMarkdownTranslationLaneSessionControl({
      action: "start",
      docPath: "docs/example.md",
      locale: "haw",
      targetLanguage: "haw",
      accountLocale: "haw",
      sourceHash: "fnv1a32:test",
      sourceTextHash: "fnv1a32:text-payload",
      sourceTextCharCount: 41,
      sourceId: "document_markdown:docs/example.md",
      laneSessionId: "lane-session-docs",
      requestedBackendProvider: "live_translation.local_runtime",
      projectionTarget: "docs_chunk",
      agentRuntime: "helix",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0] ?? "")).toBe("/api/agi/capability-lanes/session");
    const body = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.body ?? "{}"));
    expect(body).toMatchObject({
      agentRuntime: "helix",
      agent_runtime: "helix",
      capability_lane_session_call: {
        action: "start",
        lane_id: "live_translation",
        lane_session_id: "lane-session-docs",
        requested_backend_provider: "live_translation.local_runtime",
        source_binding_key: "document_markdown:docs/example.md::fnv1a32:test::docs_chunk::haw::haw",
        source_identity_key:
          "document_markdown:docs/example.md::fnv1a32:test::fnv1a32:text-payload::41::docs::docs_chunk::haw::haw",
        latest_source_identity_key:
          "document_markdown:docs/example.md::fnv1a32:test::fnv1a32:text-payload::41::docs::docs_chunk::haw::haw",
        context_role: "tool_evidence",
        answer_authority: false,
        terminal_eligible: false,
        assistant_answer: false,
        raw_content_included: false,
        source_binding: {
          source_id: "document_markdown:docs/example.md",
          source_hash: "fnv1a32:test",
          source_text_hash: "fnv1a32:text-payload",
          source_text_char_count: 41,
          source_binding_key: "document_markdown:docs/example.md::fnv1a32:test::docs_chunk::haw::haw",
          source_identity_key:
            "document_markdown:docs/example.md::fnv1a32:test::fnv1a32:text-payload::41::docs::docs_chunk::haw::haw",
          latest_source_identity_key:
            "document_markdown:docs/example.md::fnv1a32:test::fnv1a32:text-payload::41::docs::docs_chunk::haw::haw",
          source_kind: "docs",
          projection_target: "docs_chunk",
          account_locale: "haw",
          target_language: "haw",
        },
      },
    });
    expect(response.terminal_eligible).toBe(false);
    expect(response.assistant_answer).toBe(false);
    expect(response.raw_content_included).toBe(false);
    expect(response.capability_lane_session_results).toEqual([
      expect.objectContaining({
        ok: true,
        action: "start",
        lane_id: "live_translation",
        answer_authority: false,
        assistant_answer: false,
        terminal_eligible: false,
        raw_content_included: false,
      }),
    ]);
    expect(response.capability_lane_session_debug_summaries).toEqual([
      expect.objectContaining({
        lane_session_id: "lane-session-docs",
        lane_id: "live_translation",
        lifecycle_action: "start",
        session_control_key:
          "lane-session-docs::document_markdown:docs/example.md::fnv1a32:test::docs_chunk::haw::haw",
        source_binding_key: "document_markdown:docs/example.md::fnv1a32:test::docs_chunk::haw::haw",
        assistant_answer: false,
        terminal_eligible: false,
        raw_content_included: false,
      }),
    ]);
    expect(response.capability_lane_turn_timeline).toEqual([
      expect.objectContaining({
        stage: "lane_session",
        lane_id: "live_translation",
        lane_session_id: "lane-session-docs",
        selected_runtime_agent_provider: "helix",
        session_lifecycle_action: "start",
        lane_requested: true,
        lane_executed: false,
        assistant_answer: false,
        terminal_eligible: false,
        raw_content_included: false,
      }),
    ]);
    expect(response.capability_lane_timeline_summary).toMatchObject({
      schema: "helix.capability_lane.timeline_summary.v1",
      session_count: 1,
      visible_lane_does_not_mean_executed: true,
    });
    expect(response.model_visible_capability_lane_manifest).toMatchObject({
      schema: "helix.agent_model_visible_capability_lane_manifest.v1",
    });
  });

  it("derives session-control target language from account locale when no target is provided", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          schema: "helix.capability_lane.session_control_response.v1",
          ok: true,
          capability_lane_session_results: [],
          terminal_eligible: false,
          assistant_answer: false,
          raw_content_included: false,
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    ) as unknown as typeof fetch;
    globalThis.fetch = fetchMock;

    await runDocumentMarkdownTranslationLaneSessionControl({
      action: "start",
      docPath: "docs/example.md",
      locale: "es-US",
      sourceHash: "fnv1a32:test",
      sourceTextHash: "fnv1a32:text-payload",
      sourceTextCharCount: 41,
      sourceId: "document_markdown:docs/example.md",
      laneSessionId: "lane-session-docs",
      projectionTarget: "docs_chunk",
      agentRuntime: "helix",
    });

    const body = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.body ?? "{}"));
    expect(body.capability_lane_session_call).toMatchObject({
      source_binding_key: "document_markdown:docs/example.md::fnv1a32:test::docs_chunk::es-US::es",
      source_identity_key:
        "document_markdown:docs/example.md::fnv1a32:test::fnv1a32:text-payload::41::docs::docs_chunk::es-US::es",
      source_binding: {
        account_locale: "es-US",
        target_language: "es",
      },
    });
  });

  it("lists document-bound governed lane sessions through the AGI session read endpoint", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          schema: "helix.capability_lane.session_list_response.v1",
          ok: true,
          session_count: 1,
          adapter_boundary: "helix_agent_provider_edge",
          selected_runtime_agent_providers: ["helix"],
          selected_agent_providers: [
            {
              id: "helix",
              label: "Helix Ask Native",
              supports: {
                capabilityLanes: true,
                capabilityLaneSessions: true,
              },
            },
          ],
          filters: {
            lane_session_id: "lane-session-docs",
            lane_id: "live_translation",
            agent_runtime: "helix",
            source_id: "document_markdown:docs/example.md",
            source_hash: "fnv1a32:test",
            source_binding_key: "document_markdown:docs/example.md::fnv1a32:test::docs_chunk::haw::haw",
            projection_target: "docs_chunk",
            account_locale: "haw",
            target_language: "haw",
          },
          capability_lane_sessions: [
            {
              lane_session_id: "lane-session-docs",
              lane_id: "live_translation",
              status: "running",
              health: "healthy",
              answer_authority: false,
              terminal_eligible: false,
              assistant_answer: false,
              raw_content_included: false,
            },
          ],
          capability_lane_session_debug_summaries: [
            {
              lane_session_id: "lane-session-docs",
              lane_id: "live_translation",
              session_status: "running",
              session_health: "healthy",
              answer_authority: false,
              terminal_eligible: false,
              assistant_answer: false,
              raw_content_included: false,
            },
          ],
          capability_lane_turn_timeline: [
            {
              schema: "helix.capability_lane.provider_timeline_event.v1",
              stage: "lane_session",
              seq: 0,
              lane_id: "live_translation",
              lane_session_id: "lane-session-docs",
              lane_requested: true,
              lane_executed: false,
              answer_authority: false,
              terminal_eligible: false,
              assistant_answer: false,
              raw_content_included: false,
            },
          ],
          capability_lane_timeline_summary: {
            schema: "helix.capability_lane.timeline_summary.v1",
            session_count: 1,
            visible_lane_does_not_mean_executed: true,
          },
          context_role: "tool_evidence",
          answer_authority: false,
          terminal_eligible: false,
          assistant_answer: false,
          raw_content_included: false,
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    ) as unknown as typeof fetch;
    globalThis.fetch = fetchMock;

    const response = await listDocumentMarkdownTranslationLaneSessions({
      agentRuntime: "helix",
      docPath: "docs/example.md",
      locale: "haw",
      laneSessionId: "lane-session-docs",
      sourceTextHash: "fnv1a32:text-payload",
      sourceTextCharCount: 41,
      sourceHash: "fnv1a32:test",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0] ?? "")).toBe(
      "/api/agi/capability-lanes/session?agent_runtime=helix&lane_session_id=lane-session-docs&lane_id=live_translation&source_id=document_markdown%3Adocs%2Fexample.md&source_hash=fnv1a32%3Atest&source_binding_key=document_markdown%3Adocs%2Fexample.md%3A%3Afnv1a32%3Atest%3A%3Adocs_chunk%3A%3Ahaw%3A%3Ahaw&source_identity_key=document_markdown%3Adocs%2Fexample.md%3A%3Afnv1a32%3Atest%3A%3Afnv1a32%3Atext-payload%3A%3A41%3A%3Adocs%3A%3Adocs_chunk%3A%3Ahaw%3A%3Ahaw&latest_source_identity_key=document_markdown%3Adocs%2Fexample.md%3A%3Afnv1a32%3Atest%3A%3Afnv1a32%3Atext-payload%3A%3A41%3A%3Adocs%3A%3Adocs_chunk%3A%3Ahaw%3A%3Ahaw&projection_target=docs_chunk&account_locale=haw&target_language=haw",
    );
    expect(response).toMatchObject({
      schema: "helix.capability_lane.session_list_response.v1",
      ok: true,
      session_count: 1,
      adapter_boundary: "helix_agent_provider_edge",
      selected_runtime_agent_providers: ["helix"],
      selected_agent_providers: [
        expect.objectContaining({
          id: "helix",
          label: "Helix Ask Native",
        }),
      ],
      context_role: "tool_evidence",
      answer_authority: false,
      terminal_eligible: false,
      assistant_answer: false,
      raw_content_included: false,
    });
    expect(response.capability_lane_sessions).toEqual([
      expect.objectContaining({
        lane_session_id: "lane-session-docs",
        lane_id: "live_translation",
        status: "running",
        health: "healthy",
        answer_authority: false,
      }),
    ]);
    expect(response.capability_lane_turn_timeline).toEqual([
      expect.objectContaining({
        schema: "helix.capability_lane.provider_timeline_event.v1",
        stage: "lane_session",
        lane_id: "live_translation",
        lane_session_id: "lane-session-docs",
        lane_requested: true,
        lane_executed: false,
        answer_authority: false,
        terminal_eligible: false,
        assistant_answer: false,
        raw_content_included: false,
      }),
    ]);
    expect(response.capability_lane_timeline_summary).toMatchObject({
      schema: "helix.capability_lane.timeline_summary.v1",
      session_count: 1,
      visible_lane_does_not_mean_executed: true,
    });
  });

  it("derives session-list target language from account locale when no target is provided", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          schema: "helix.capability_lane.session_list_response.v1",
          ok: true,
          session_count: 0,
          terminal_eligible: false,
          assistant_answer: false,
          raw_content_included: false,
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    ) as unknown as typeof fetch;
    globalThis.fetch = fetchMock;

    await listDocumentMarkdownTranslationLaneSessions({
      agentRuntime: "helix",
      docPath: "docs/example.md",
      locale: "es-US",
      laneSessionId: "lane-session-docs",
      sourceTextHash: "fnv1a32:text-payload",
      sourceTextCharCount: 41,
      sourceHash: "fnv1a32:test",
    });

    expect(String(fetchMock.mock.calls[0]?.[0] ?? "")).toContain("account_locale=es-US");
    expect(String(fetchMock.mock.calls[0]?.[0] ?? "")).toContain("target_language=es");
    expect(decodeURIComponent(String(fetchMock.mock.calls[0]?.[0] ?? ""))).toContain(
      "source_binding_key=document_markdown:docs/example.md::fnv1a32:test::docs_chunk::es-US::es",
    );
    expect(decodeURIComponent(String(fetchMock.mock.calls[0]?.[0] ?? ""))).toContain(
      "source_identity_key=document_markdown:docs/example.md::fnv1a32:test::fnv1a32:text-payload::41::docs::docs_chunk::es-US::es",
    );
    expect(decodeURIComponent(String(fetchMock.mock.calls[0]?.[0] ?? ""))).toContain(
      "latest_source_identity_key=document_markdown:docs/example.md::fnv1a32:test::fnv1a32:text-payload::41::docs::docs_chunk::es-US::es",
    );
  });

  it("extracts unit-keyed inline translations from document projection JSON runs", () => {
    const outputPreview = JSON.stringify({
      schema: "stage_play_document_inline_translation_output/v1",
      sourceId: "document_markdown:docs/example.md",
      sourceKind: "document_markdown",
      docPath: "docs/example.md",
      sourceHash: "fnv1a32:test",
      sourceTextHash: "fnv1a32:text-payload",
      sourceTextCharCount: 41,
      chunkId: "doc-inline:fnv1a32:test:u0001,u0002",
      chunkIndex: 3,
      dedupeKey: "document_markdown:docs/example.md:doc-inline:fnv1a32:test:u0001,u0002:haw",
      sourceEventId: "document_markdown_event:doc-inline:fnv1a32:test:u0001,u0002",
      sourceEventMs: 1780000000000,
      observedAtMs: 1780000001000,
      projectionStatus: "projected",
      freshnessStatus: "fresh",
      laneSessionId: "lane-session-docs",
      sourceBindingKey: "document_markdown:docs/example.md::fnv1a32:test::docs_chunk::haw::haw",
      sourceIdentityKey:
        "document_markdown:docs/example.md::fnv1a32:test::fnv1a32:text-payload::41::docs::docs_chunk::haw::haw",
      latestSourceIdentityKey:
        "document_markdown:docs/example.md::fnv1a32:test::fnv1a32:text-payload-latest::19::docs::docs_chunk::haw::haw",
      latestMailLoopObservationKey:
        "document_markdown:docs/example.md::fnv1a32:test::document_markdown::docs_chunk::haw::haw::doc-inline:fnv1a32:test:u0001,u0002::receipt:doc-inline",
      observationLaneSessionId: "lane-session-docs-observation",
      goalBindingId: "goal-binding-docs",
      latestEventId: "lane-session-docs:observation_recorded:1780000001000",
      hasObservation: true,
      terminalAuthorityStatus: "pending_helix_terminal_authority",
      projectionTarget: "docs_viewer_inline",
      targetLanguage: "haw",
      accountLocale: "haw",
      translationContractVersion: "target-language-v2",
      translations: [
        { unit_id: "u0001", translated_markdown: "Translated heading" },
        { unit_id: "u0002", translated_markdown: "Kikokikona unuhi" },
      ],
    });

    const entries: DocumentMarkdownTranslationEntry[] = extractDocumentMarkdownTranslationsFromRuns([
      { ...baseRun, outputPreview },
    ]);

    expect(entries).toEqual([
      {
        unitId: "u0001",
        status: "ready",
        text: "Translated heading",
        runId: "run-doc-1",
        role: "packet_composer",
        observationRef: "run-doc-1",
        sourceId: "document_markdown:docs/example.md",
        sourceKind: "document_markdown",
        docPath: "docs/example.md",
        sourceHash: "fnv1a32:test",
        sourceTextHash: "fnv1a32:text-payload",
        sourceTextCharCount: 41,
        chunkId: "doc-inline:fnv1a32:test:u0001,u0002",
        chunkIndex: 3,
        dedupeKey: "document_markdown:docs/example.md:doc-inline:fnv1a32:test:u0001,u0002:haw",
        sourceEventId: "document_markdown_event:doc-inline:fnv1a32:test:u0001,u0002",
        sourceEventMs: 1780000000000,
        observedAtMs: 1780000001000,
        projectionStatus: "projected",
        freshnessStatus: "fresh",
        laneSessionId: "lane-session-docs",
        sourceBindingKey: "document_markdown:docs/example.md::fnv1a32:test::docs_chunk::haw::haw",
        latestSourceBindingKey: "document_markdown:docs/example.md::fnv1a32:test::docs_chunk::haw::haw",
        sourceIdentityKey:
          "document_markdown:docs/example.md::fnv1a32:test::fnv1a32:text-payload::41::docs::docs_chunk::haw::haw",
        latestSourceIdentityKey:
          "document_markdown:docs/example.md::fnv1a32:test::fnv1a32:text-payload-latest::19::docs::docs_chunk::haw::haw",
        latestMailLoopObservationKey:
          "document_markdown:docs/example.md::fnv1a32:test::document_markdown::docs_chunk::haw::haw::doc-inline:fnv1a32:test:u0001,u0002::receipt:doc-inline",
        observationLaneSessionId: "lane-session-docs-observation",
        goalBindingId: "goal-binding-docs",
        latestEventId: "lane-session-docs:observation_recorded:1780000001000",
        hasObservation: true,
        contextRole: "tool_evidence",
        answerAuthority: false,
        terminalEligible: false,
        assistantAnswer: false,
        rawContentIncluded: false,
        terminalAuthorityStatus: "pending_helix_terminal_authority",
        selectedBackendProvider: "test-document-translator",
        source: "document_microdeck",
        projectionTarget: "docs_chunk",
        targetLanguage: "haw",
        accountLocale: "haw",
        translationContractVersion: "target-language-v2",
      },
      {
        unitId: "u0002",
        status: "ready",
        text: "Kikokikona unuhi",
        runId: "run-doc-1",
        role: "packet_composer",
        observationRef: "run-doc-1",
        sourceId: "document_markdown:docs/example.md",
        sourceKind: "document_markdown",
        docPath: "docs/example.md",
        sourceHash: "fnv1a32:test",
        sourceTextHash: "fnv1a32:text-payload",
        sourceTextCharCount: 41,
        chunkId: "doc-inline:fnv1a32:test:u0001,u0002",
        chunkIndex: 3,
        dedupeKey: "document_markdown:docs/example.md:doc-inline:fnv1a32:test:u0001,u0002:haw",
        sourceEventId: "document_markdown_event:doc-inline:fnv1a32:test:u0001,u0002",
        sourceEventMs: 1780000000000,
        observedAtMs: 1780000001000,
        projectionStatus: "projected",
        freshnessStatus: "fresh",
        laneSessionId: "lane-session-docs",
        sourceBindingKey: "document_markdown:docs/example.md::fnv1a32:test::docs_chunk::haw::haw",
        latestSourceBindingKey: "document_markdown:docs/example.md::fnv1a32:test::docs_chunk::haw::haw",
        sourceIdentityKey:
          "document_markdown:docs/example.md::fnv1a32:test::fnv1a32:text-payload::41::docs::docs_chunk::haw::haw",
        latestSourceIdentityKey:
          "document_markdown:docs/example.md::fnv1a32:test::fnv1a32:text-payload-latest::19::docs::docs_chunk::haw::haw",
        latestMailLoopObservationKey:
          "document_markdown:docs/example.md::fnv1a32:test::document_markdown::docs_chunk::haw::haw::doc-inline:fnv1a32:test:u0001,u0002::receipt:doc-inline",
        observationLaneSessionId: "lane-session-docs-observation",
        goalBindingId: "goal-binding-docs",
        latestEventId: "lane-session-docs:observation_recorded:1780000001000",
        hasObservation: true,
        contextRole: "tool_evidence",
        answerAuthority: false,
        terminalEligible: false,
        assistantAnswer: false,
        rawContentIncluded: false,
        terminalAuthorityStatus: "pending_helix_terminal_authority",
        selectedBackendProvider: "test-document-translator",
        source: "document_microdeck",
        projectionTarget: "docs_chunk",
        targetLanguage: "haw",
        accountLocale: "haw",
        translationContractVersion: "target-language-v2",
      },
    ]);
  });

  it("preserves unit-level projection refs over run-level projection refs", () => {
    const outputPreview = JSON.stringify({
      schema: "stage_play_document_inline_translation_output/v1",
      sourceId: "document_markdown:docs/example.md",
      sourceKind: "document_markdown",
      docPath: "docs/example.md",
      sourceHash: "fnv1a32:run",
      sourceTextHash: "fnv1a32:run-text",
      sourceTextCharCount: 41,
      chunkId: "chunk-run",
      chunkIndex: 1,
      observationRef: "obs:run",
      receiptRef: "receipt:run",
      latestObservationKey: "observation-key:run",
      latestMailLoopObservationKey: "mail-loop-observation-key:run",
      projectionKey: "projection-key:run",
      terminalAuthorityStatus: "not_terminal_authority",
      projectionTarget: "docs_chunk",
      targetLanguage: "haw",
      accountLocale: "haw",
      translations: [
        {
          unit_id: "u0001",
          translated_markdown: "Translated unit one",
          source_hash: "fnv1a32:unit",
          source_text_hash: "fnv1a32:unit-text",
          source_text_char_count: 19,
          chunk_id: "chunk-unit",
          chunk_index: 7,
          dedupe_key: "dedupe:unit",
          source_event_id: "source-event:unit",
          source_event_ms: 1780000002000,
          observed_at_ms: 1780000003000,
          observation_ref: "obs:unit",
          receipt_ref: "receipt:unit",
          latest_observation_key: "observation-key:unit",
          latest_mail_loop_observation_key: "mail-loop-observation-key:unit",
          projection_key: "projection-key:unit",
          projection_status: "projected",
          freshness_status: "fresh",
          terminal_authority_status: "pending_helix_terminal_authority",
          has_observation: true,
        },
      ],
    });

    const entries: DocumentMarkdownTranslationEntry[] = extractDocumentMarkdownTranslationsFromRuns([
      { ...baseRun, outputPreview },
    ]);

    expect(entries).toEqual([
      expect.objectContaining({
        unitId: "u0001",
        status: "ready",
        text: "Translated unit one",
        sourceHash: "fnv1a32:unit",
        sourceTextHash: "fnv1a32:unit-text",
        sourceTextCharCount: 19,
        chunkId: "chunk-unit",
        chunkIndex: 7,
        dedupeKey: "dedupe:unit",
        sourceEventId: "source-event:unit",
        sourceEventMs: 1780000002000,
        observedAtMs: 1780000003000,
        observationRef: "obs:unit",
        receiptRef: "receipt:unit",
        latestObservationKey: "observation-key:unit",
        latestMailLoopObservationKey: "mail-loop-observation-key:unit",
        projectionKey: "projection-key:unit",
        projectionStatus: "projected",
        freshnessStatus: "fresh",
        terminalAuthorityStatus: "pending_helix_terminal_authority",
        hasObservation: true,
        contextRole: "tool_evidence",
        answerAuthority: false,
        terminalEligible: false,
        assistantAnswer: false,
        rawContentIncluded: false,
      }),
    ]);
  });

  it("extracts unit-level translation errors from document projection output", () => {
    const outputPreview = JSON.stringify({
      schema: "stage_play_document_inline_translation_output/v1",
      projectionTarget: "docs_chunk",
      translations: [],
      unit_errors: [
        { unit_id: "u0003", reason: "document_translation_model_output_unavailable" },
      ],
    });

    const entries = extractDocumentMarkdownTranslationsFromRuns([
      {
        ...baseRun,
        status: "failed",
        deckPresetId: "stage_play_micro_reasoner_prompt_preset:document-translate-haw-inline:v1",
        deckPresetTitle: "Document Markdown Translate To Target Language",
        deckExecutionMode: "uses_prior_outputs",
        outputPreview,
      },
    ]);

    expect(entries).toEqual([
      {
        unitId: "u0003",
        status: "error",
        error: "document_translation_model_output_unavailable",
        runId: "run-doc-1",
        role: "packet_composer",
        observationRef: "run-doc-1",
        observedAtMs: 1781697601000,
        hasObservation: true,
        contextRole: "tool_evidence",
        answerAuthority: false,
        terminalEligible: false,
        assistantAnswer: false,
        rawContentIncluded: false,
        terminalAuthorityStatus: "not_terminal_authority",
        selectedBackendProvider: "test-document-translator",
        source: "document_microdeck",
        projectionTarget: "docs_chunk",
      },
    ]);
  });

  it("ignores baseline-only document unavailable projections before a prompted deck product run exists", () => {
    const outputPreview = JSON.stringify({
      schema: "stage_play_document_inline_translation_output/v1",
      projectionTarget: "docs_chunk",
      translations: [],
      unit_errors: [
        { unit_id: "u0003", reason: "document_translation_model_output_unavailable" },
      ],
    });

    const entries = extractDocumentMarkdownTranslationsFromRuns([
      {
        ...baseRun,
        status: "completed",
        deckPresetId: "stage_play_micro_reasoner_prompt_preset:document-translate-haw-inline:v1",
        deckPresetTitle: "Document Markdown Translate To Target Language",
        deckExecutionMode: "baseline_fallback",
        deckProductRole: true,
        outputPreview,
      },
    ]);

    expect(entries).toEqual([]);
  });

  it("ignores completed run notes that are not structured translation output", () => {
    const entries = extractDocumentMarkdownTranslationsFromRuns([
      {
        ...baseRun,
        outputPreview:
          'wait_for_next_summary; low; stage_play_live_source_mail:883acaba: {"schema":"stage_play.document_markdown_visible_units.v1"}',
      },
    ]);

    expect(entries).toEqual([]);
  });
});
