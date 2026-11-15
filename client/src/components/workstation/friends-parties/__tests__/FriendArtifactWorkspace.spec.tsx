/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import { webcrypto } from "node:crypto";
import { createReceivedGlyphStore } from "../FriendArtifactWorkspace";
import { usePhysicsGlyphWorkspaceStore } from "@/store/usePhysicsGlyphWorkspaceStore";
import { createPhysicsGlyphWorkspace } from "@shared/physics-glyphs/workspace";
import { createHandTableScenario } from "@shared/physics-glyphs/scenario-example";
import { friendGlyphArtifactSchema } from "@shared/helix-friend-board";
import { connectPhysicsGlyphClient } from "@/lib/workstation/physicsGlyphClientTransport";
import { PHYSICS_GLYPH_CLIENT_PROTOCOL } from "@shared/physics-glyphs/client-protocol";
const account = vi.hoisted(() => ({ profile: "alice" }));
vi.mock("@/lib/workstation/accountCapabilityPolicy", () => ({ HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT: "test:profile-changed", readCachedAccountProfileIdentity: () => ({ profileId: account.profile, revision: 1 }) }));
function artifact() { const scenario = createHandTableScenario(); return friendGlyphArtifactSchema.parse({ schema: "helix.friend_glyph_artifact.v1", kind: "physics_glyph", generation_id: "11111111-1111-4111-8111-111111111111", renderer: "physics-glyph-story.v1", document: { schema: "helix.physics_glyph_document.v1", configuration: { preset: "scenario", scenario, perspective: scenario.perspectives[0] } } }); }
beforeEach(() => { vi.stubGlobal("crypto", webcrypto); account.profile = "alice"; localStorage.clear(); usePhysicsGlyphWorkspaceStore.setState({ workspace: createPhysicsGlyphWorkspace("global-workspace"), profileKey: null }); usePhysicsGlyphWorkspaceStore.getState().syncProfile(); });
afterEach(() => vi.unstubAllGlobals());
describe("independent received artifact workspaces", () => {
    it("uses separate scenes and storage while preserving the original and global workspace", () => {
        const original = artifact(), globalBefore = structuredClone(usePhysicsGlyphWorkspaceStore.getState().workspace);
        const a = createReceivedGlyphStore(original, () => account.profile), b = createReceivedGlyphStore(original, () => account.profile);
        const c = a.getState().workspace.scene.configuration;
        if (c.preset !== "scenario")
            throw new Error("scenario");
        a.getState().dispatch({ type: "compose_scenario", expectedRevision: a.getState().workspace.scene.revision, scenario: { ...c.scenario, title: "My independent remix" } });
        a.getState().save();
        expect(b.getState().workspace.scene.configuration).toEqual(original.document.configuration);
        expect(usePhysicsGlyphWorkspaceStore.getState().workspace).toEqual(globalBefore);
        expect(original.document.configuration).toEqual(b.getState().workspace.scene.configuration);
        expect(localStorage.length).toBe(0);
        account.profile = "bob";
        a.getState().syncProfile();
        expect(a.getState().workspace.scene.configuration.preset).toBe("phase");
    });
    it("uses the injected store consistently for registration, commands and acknowledgements", async () => {
        const copy = createReceivedGlyphStore(artifact(), () => account.profile), globalBefore = structuredClone(usePhysicsGlyphWorkspaceStore.getState().workspace);
        const requests: {
            operation: string;
            body: Record<string, unknown>;
        }[] = [];
        const scene = copy.getState().workspace.scene;
        const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const operation = String(input).split("/").at(-1)!, body = JSON.parse(init?.body as string);
            requests.push({ operation, body });
            return new Response(JSON.stringify(operation === "register" ? { ok: true, peerId: "peer-copy", token: "private-copy-token", protocol: PHYSICS_GLYPH_CLIENT_PROTOCOL } :
                operation === "poll" ? { ok: true, job: { requestId: "job-copy", sceneId: scene.id, expiresAt: Date.now() + 30000, command: { type: "select_entity", expectedRevision: scene.revision, entityId: "hand" } } } : { ok: true }));
        });
        const stop = connectPhysicsGlyphClient({ store: copy, onStatus: () => { }, fetcher, pollMs: 10000 });
        try {
            await waitFor(() => expect(requests.some(r => r.operation === "ack")).toBe(true));
            expect((requests.find(r => r.operation === "register")!.body.observation as {
                scene: {
                    id: string;
                };
            }).scene.id).toBe(scene.id);
            expect((requests.find(r => r.operation === "ack")!.body.artifact as {
                scene: {
                    id: string;
                };
            }).scene.id).toBe(scene.id);
            expect(usePhysicsGlyphWorkspaceStore.getState().workspace).toEqual(globalBefore);
        }
        finally {
            stop();
        }
    });
    it("disconnects a late registration after the real profile changes", async () => {
        const copy = createReceivedGlyphStore(artifact(), () => account.profile);
        let finish!: (r: Response) => void;
        const operations: string[] = [];
        const fetcher = vi.fn((input: RequestInfo | URL) => {
            const op = String(input).split("/").at(-1)!;
            operations.push(op);
            return op === "register" ? new Promise<Response>(resolve => { finish = resolve; }) : Promise.resolve(new Response(JSON.stringify({ ok: true })));
        });
        const stop = connectPhysicsGlyphClient({ store: copy, onStatus: () => { }, fetcher });
        account.profile = "bob";
        finish(new Response(JSON.stringify({ ok: true, peerId: "old-peer", token: "old-private-token", protocol: PHYSICS_GLYPH_CLIENT_PROTOCOL })));
        await waitFor(() => expect(operations).toContain("disconnect"));
        expect(operations).not.toContain("poll");
        stop();
    });
});
