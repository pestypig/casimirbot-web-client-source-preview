import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  normalizeDocPath,
  type DocViewerIntent,
} from "@/lib/docs/docViewer";

const MAX_RECENT = 8;

type DocViewerState = {
  mode: "directory" | "doc";
  currentPath?: string;
  anchor?: string;
  pendingAutoReadNonce?: number;
  recent: string[];
  viewDirectory: () => void;
  viewDoc: (path: string, anchor?: string, options?: { autoRead?: boolean }) => void;
  clearPendingAutoRead: () => void;
  applyIntent: (intent: DocViewerIntent) => void;
};

export const useDocViewerStore = create<DocViewerState>()(
  persist(
    (set, get) => ({
      mode: "directory",
      currentPath: undefined,
      anchor: undefined,
      pendingAutoReadNonce: undefined,
      recent: [],
      viewDirectory: () =>
        set({
          mode: "directory",
          anchor: undefined,
          pendingAutoReadNonce: undefined,
        }),
      viewDoc: (path, anchor, options) => {
        const normalized = normalizeDocPath(path);
        set((state) => ({
          mode: "doc",
          currentPath: normalized,
          anchor: anchor ?? undefined,
          pendingAutoReadNonce: options?.autoRead ? Date.now() : undefined,
          recent: updateRecent(state.recent, normalized),
        }));
      },
      clearPendingAutoRead: () => set({ pendingAutoReadNonce: undefined }),
      applyIntent: (intent) => {
        if (intent.mode === "directory") {
          set({ mode: "directory", anchor: undefined, pendingAutoReadNonce: undefined });
        } else {
          get().viewDoc(intent.path, intent.anchor, { autoRead: intent.autoRead === true });
        }
      },
    }),
    {
      name: "doc-viewer:v1",
      partialize: (state) => ({
        mode: state.mode,
        currentPath: state.currentPath,
        recent: state.recent,
      }),
    },
  ),
);

function updateRecent(recent: string[], candidate: string) {
  const deduped = [candidate, ...recent.filter((entry) => entry !== candidate)];
  return deduped.slice(0, MAX_RECENT);
}
