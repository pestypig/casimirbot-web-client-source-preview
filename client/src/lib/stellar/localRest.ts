import type { LocalRestQuery, LocalRestSnapshot, LocalRestStar } from "@shared/stellar";
import { HR_CATEGORY_STYLES } from "@/lib/colors/hr";
import { AU_IN_METERS } from "@/lib/units";

// REST fetcher
export async function fetchLocalRest(params: LocalRestQuery): Promise<LocalRestSnapshot> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) qs.set(k, String(v));
  }
  const res = await fetch(`/api/stellar/local-rest?${qs.toString()}`);
  if (!res.ok) throw new Error(`LocalRest fetch failed: ${res.status}`);
  return res.json();
}

// SSE subscription
export function subscribeLocalRestStream(
  params: LocalRestQuery,
  handlers: {
    onSnapshot?: (snap: LocalRestSnapshot) => void;
    onNavPose?: (pose: any) => void;
    onError?: (e: any) => void;
  },
) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) qs.set(k, String(v));
  }
  const es = new EventSource(`/api/stellar/local-rest/stream?${qs.toString()}`);

  es.addEventListener("snapshot", (ev) => {
    try {
      handlers.onSnapshot?.(JSON.parse((ev as MessageEvent).data));
    } catch (e) {
      handlers.onError?.(e);
    }
  });

  es.addEventListener("nav-pose", (ev) => {
    try {
      handlers.onNavPose?.(JSON.parse((ev as MessageEvent).data));
    } catch (e) {
      handlers.onError?.(e);
    }
  });

  es.addEventListener("error", (ev) => handlers.onError?.(ev));
  return () => es.close();
}

// Pack stars into typed arrays (AU & RGB)
export function packStarsToBuffers(stars: LocalRestStar[]) {
  const n = stars.length;
  const pos = new Float32Array(n * 3);
  const vel = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);

  for (let i = 0; i < n; i++) {
    const s = stars[i];
    pos[i * 3 + 0] = s.pos_m[0] / AU_IN_METERS;
    pos[i * 3 + 1] = s.pos_m[1] / AU_IN_METERS;
    pos[i * 3 + 2] = s.pos_m[2] / AU_IN_METERS;

    vel[i * 3 + 0] = s.vel_kms[0];
    vel[i * 3 + 1] = s.vel_kms[1];
    vel[i * 3 + 2] = s.vel_kms[2];

    const style = HR_CATEGORY_STYLES[s.hr] ?? HR_CATEGORY_STYLES.M;
    col[i * 3 + 0] = style.rgb[0];
    col[i * 3 + 1] = style.rgb[1];
    col[i * 3 + 2] = style.rgb[2];
  }

  return { pos, vel, col, count: n };
}
