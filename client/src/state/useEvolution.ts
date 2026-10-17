import { create } from "zustand";
import type { EvolutionProofs } from "@shared/stellar-evolution";
import { fetchEvolutionProofs } from "@/lib/stellar/evolution";

type EvolutionState = {
  loading: boolean;
  error?: string;
  proofs?: EvolutionProofs;
  fetchProofs: (args: {
    T_K: number;
    nH_cm3: number;
    mass_Msun?: number;
    metallicity_Z?: number;
    Y_He?: number;
    epochMs?: number;
  }) => Promise<void>;
  clear: () => void;
};

export const useEvolution = create<EvolutionState>((set) => ({
  loading: false,
  error: undefined,
  proofs: undefined,
  async fetchProofs(args) {
    set({ loading: true, error: undefined });
    try {
      const proofs = await fetchEvolutionProofs(args);
      set({ proofs, loading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ error: message, loading: false });
    }
  },
  clear() {
    set({ proofs: undefined, error: undefined });
  },
}));
