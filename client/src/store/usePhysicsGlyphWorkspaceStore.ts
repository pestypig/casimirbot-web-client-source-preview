import { commitCalculation,matchesDeclaredCalculation } from "@shared/physics-glyphs/calculation-commit";
import { create } from "zustand";
import {
  applyPhysicsGlyphCommand, createPhysicsGlyphWorkspace, observePhysicsGlyphWorkspace,
  restorePhysicsGlyphWorkspace, serializePhysicsGlyphWorkspace,
} from "@shared/physics-glyphs/workspace";
import type { PhysicsGlyphWorkspace } from "@shared/physics-glyphs/contracts";
import { PHYSICS_GLYPH_PARTICLES, type PhysicsGlyphParticleId } from "@shared/physics-glyphs/catalog";
import { readCachedAccountProfileIdentity } from "@/lib/workstation/accountCapabilityPolicy";

type StorageLike = Pick<Storage, "getItem" | "setItem">;
type PhysicsGlyphStore = {
  workspace: PhysicsGlyphWorkspace;
  profileKey: string | null;
  selectedParticle: PhysicsGlyphParticleId;
  presentationEpoch: number;
  error: string | null;
  notice: string | null;
  syncProfile: () => void;
  dispatch: (command: unknown) => { ok: boolean; error?: string; artifact: ReturnType<typeof physicsGlyphSnapshot> };
  selectParticle: (id: PhysicsGlyphParticleId) => void;
  beginCalculation:(request:unknown)=>void;
  acceptCalculation:(request:unknown,output:unknown)=>string;
  save: () => boolean;
  reload: () => boolean;
  importDocument: (serialized: string) => boolean;
};
const fresh = () => createPhysicsGlyphWorkspace(`physics:${globalThis.crypto?.randomUUID?.() ?? Date.now()}`);
const selectedSaveKey = (key: string | null, storage: StorageLike) => {
  const version = key ? storage.getItem(`${key}:active-document`) : null;
  return key && (version === "v2" || version === "v3") ? `${key}:scenario-${version}` : key;
};
export const physicsGlyphSnapshot = observePhysicsGlyphWorkspace;

export function createPhysicsGlyphWorkspaceStore(options: {
  identity?: () => string | null | undefined;
  storage?: () => StorageLike;
} = {}) {
  const identity = options.identity ?? (() => readCachedAccountProfileIdentity().profileId);
  const storage = options.storage ?? (() => window.localStorage);
  return create<PhysicsGlyphStore>((set, get) => ({
    workspace: fresh(), profileKey: null, selectedParticle: "e", presentationEpoch: 0, error: null, notice: null,
    syncProfile: () => {
      const profile = identity();
      const key = profile === undefined ? null : `helix.physics-glyphs.v1:${profile === null ? "guest" : `profile:${encodeURIComponent(profile)}`}`;
      if (get().profileKey === key) return;
      let workspace = fresh(), error: string | null = null;
      try {
        const selectedKey = selectedSaveKey(key, storage());
        const saved = selectedKey ? storage().getItem(selectedKey) : null;
        if (saved) workspace = restorePhysicsGlyphWorkspace(workspace, saved);
      } catch { error = "Saved workspace could not be loaded. The default scene is available."; }
      set({ profileKey: key, workspace, selectedParticle: "e", presentationEpoch: 0, error, notice: null });
    },
    dispatch: (command) => {
      get().syncProfile();
      const outcome = applyPhysicsGlyphCommand(get().workspace, command);
      if (!outcome.ok) {
        set({ error: outcome.error, notice: null });
        return { ok: false, error: outcome.error, artifact: physicsGlyphSnapshot(outcome.workspace) };
      }
      const composed = typeof command === "object" && command !== null && "type" in command && command.type === "compose_scenario";
      set({ workspace: outcome.workspace, selectedParticle: composed ? "e" : get().selectedParticle, presentationEpoch: get().presentationEpoch + (composed ? 1 : 0), error: null, notice: null });
      return { ok: true, artifact: physicsGlyphSnapshot(outcome.workspace) };
    },
    selectParticle: (id) => {
      get().syncProfile();
      if (PHYSICS_GLYPH_PARTICLES.some(particle => particle[0] === id)) set({ selectedParticle: id });
    },
    beginCalculation:request=>{get().syncProfile();if(get().workspace.scene.configuration.preset==="scenario"&&!matchesDeclaredCalculation(get().workspace,request))set({workspace:{...get().workspace,interpretationStatus:"needs-reinterpretation",result:null},notice:"Inputs require a fresh Codex scientific interpretation; previous evidence and captions are retired."});},
    acceptCalculation:(request,output)=>{get().syncProfile();const outcome=commitCalculation(get().workspace,request,output);set({workspace:outcome.workspace,notice:outcome.status==="needs-reinterpretation"?"Calculation returned, but Codex must review interpretation before publication.":"Declared calculation replayed; shared evidence refreshed."});return outcome.status;},
    save: () => {
      get().syncProfile();
      const key = get().profileKey;
      if (!key) { set({ error: "Account identity is still loading. Try saving again when it resolves." }); return false; }
      try {
        const c = get().workspace.scene.configuration;
        const version = c.preset === "scenario" && c.scenario.schema === "helix.physics_scenario.v3" ? "v3" : c.preset === "scenario" && c.scenario.schema === "helix.physics_scenario.v2" ? "v2" : "v1";
        storage().setItem(version === "v1" ? key : `${key}:scenario-${version}`, serializePhysicsGlyphWorkspace(get().workspace));
        storage().setItem(`${key}:active-document`, version);
        set({ error: null, notice: "Configuration saved on this device for the current profile." }); return true;
      } catch { set({ error: "Workspace could not be saved. Device storage may be full or unavailable." }); return false; }
    },
    reload: () => {
      get().syncProfile();
      try {
        const key = get().profileKey;
        const selectedKey = selectedSaveKey(key, storage());
        const saved = selectedKey ? storage().getItem(selectedKey) : null;
        if (!saved) { set({ error: "No saved workspace exists for this profile." }); return false; }
        return get().importDocument(saved);
      } catch { set({ error: "Saved workspace could not be read." }); return false; }
    },
    importDocument: (serialized) => {
      get().syncProfile();
      try {
        const workspace = restorePhysicsGlyphWorkspace(get().workspace, serialized);
        set({ workspace, selectedParticle: "e", presentationEpoch: get().presentationEpoch + 1, error: null, notice: "Configuration loaded and results recalculated." }); return true;
      } catch { set({ error: "Invalid workspace document. Current configuration was preserved." }); return false; }
    },
  }));
}
export const usePhysicsGlyphWorkspaceStore = createPhysicsGlyphWorkspaceStore();
