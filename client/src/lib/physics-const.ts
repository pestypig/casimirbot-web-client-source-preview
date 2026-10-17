// Physics constants (client-side export surface).
// Re-export shared values so UI + server math cannot drift.
import { C, C2, G, HBAR, PI } from "@shared/physics-const";

export { C, C2, G, HBAR, PI };

// Planck luminosity (W): c^5 / G.
export const PLANCK_LUMINOSITY_W = (C ** 5) / G;
