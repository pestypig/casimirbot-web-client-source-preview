import { useEffect, useRef, useState } from 'react';
import { publish } from '@/lib/luma-bus';

/**
 * useGlobalPhase
 * Returns a stable 0..1 phase value that can be driven by scroll position or time.
 * - mode 'time': loops every `periodMs` (default 8000 ms)
 * - mode 'scroll': maps window scroll progress (0 top, 1 bottom of document) with optional smoothing
 * If both behaviors are desired (e.g. fallback to time when no scroll), pass mode='auto'.
 */
export interface UseGlobalPhaseOptions {
  mode?: 'time' | 'scroll' | 'auto';
  periodMs?: number;       // time loop period (time or auto mode)
  damp?: number;           // smoothing factor (0 no smoothing, 0.15 gentle)
  clamp?: boolean;         // clamp scroll to [0,1]
  /** In 'auto', prefer scroll-driven phase for this duration after the last scroll event (ms). */
  scrollHysteresisMs?: number;
  /** Publish the stabilised phase to the Luma bus each frame. */
  publishBus?: boolean;
  /** Event name to publish; always mirrored to 'warp:phase' for legacy listeners. */
  busEvent?: string;
  /** Apply an offset (0..1) before wrapping for alignment experiments. */
  offset01?: number;
  /** Invert the phase direction after offset. */
  invert?: boolean;
  /** Maximum allowed per-frame jump (cycles) when smoothing external inputs. */
  maxJumpPerFrame?: number;
}

export function useGlobalPhase(opts: UseGlobalPhaseOptions = {}) {
  const {
    mode = 'auto',
    periodMs = 8000,
    damp = 0.15,
    clamp = true,
    scrollHysteresisMs = 1200,
    publishBus = true,
    busEvent = 'warp:phase:stable',
    offset01 = 0,
    invert = false,
    maxJumpPerFrame = 0.35,
  } = opts;
  const [phase, setPhase] = useState(0);
  const targetRef = useRef(0);
  const rafRef = useRef(0);
  const lastT = useRef<number | null>(null);
  const lastScrollAt = useRef<number>(0);
  const phaseRef = useRef(0);
  const contRef = useRef(0);
  const lastPhaseRef = useRef(0);
  const signRef = useRef<1 | -1>(1);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const wrap01 = (value: number) => {
      const wrapped = value % 1;
      return wrapped < 0 ? wrapped + 1 : wrapped;
    };

    const shortestDelta = (nextVal: number, prevVal: number) => {
      let delta = nextVal - prevVal;
      if (delta > 0.5) delta -= 1;
      if (delta <= -0.5) delta += 1;
      return delta;
    };

    const normalise = (value: number) => {
      const clamped = clamp ? Math.min(1, Math.max(0, value)) : value;
      const offsetPhase = wrap01(clamped + offset01);
      return invert ? wrap01(1 - offsetPhase) : offsetPhase;
    };

    function computeScrollPhase() {
      const doc = document.documentElement;
      const max = doc.scrollHeight - doc.clientHeight;
      if (max <= 0) return 0;
      const raw = window.scrollY / max;
      return clamp ? Math.min(1, Math.max(0, raw)) : raw;
    }

    function loop(t: number) {
      if (lastT.current == null) lastT.current = t;
      const dtRaw = (t - lastT.current) / 1000;
      const dt = Math.min(0.2, Math.max(0.0005, Number.isFinite(dtRaw) ? dtRaw : 0.016));
      lastT.current = t;

      let desired = targetRef.current;
      const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const useTime =
        mode === 'time' ||
        (mode === 'auto' && nowMs - lastScrollAt.current > scrollHysteresisMs);
      if (useTime) {
        // time-driven (simple sawtooth) if explicit 'time' OR 'auto' with no recent scroll activity
        desired = ((nowMs % periodMs) / periodMs);
      }

      if (!Number.isFinite(desired)) desired = 0;

      // smoothing (exponential approach)
      let next = desired;
      if (damp > 0) {
        const alpha = Math.min(1, damp * dt * 60);
        next = phaseRef.current + (desired - phaseRef.current) * alpha;
      }
      phaseRef.current = next;
      setPhase(next);

      const stabilised = normalise(next);
      let delta = shortestDelta(stabilised, lastPhaseRef.current);
      if (!Number.isFinite(delta)) delta = 0;
      const jumpCap = Math.max(0.02, maxJumpPerFrame);
      if (Math.abs(delta) > jumpCap) {
        delta = Math.sign(delta) * jumpCap;
      }
      if (Math.abs(delta) > 1e-4) {
        signRef.current = delta >= 0 ? 1 : -1;
      }
      contRef.current += delta;
      const stablePhase = wrap01(contRef.current);
      lastPhaseRef.current = stablePhase;

      if (publishBus) {
        const payload = {
          phase01: stablePhase,
          phaseCont: contRef.current,
          phaseSign: signRef.current,
          dt,
          t: nowMs,
          source: useTime ? 'time' : 'scroll',
        };
        publish(busEvent, payload);
        if (busEvent !== 'warp:phase') {
          publish('warp:phase', payload);
        }
      }

      rafRef.current = requestAnimationFrame(loop);
    }

    function handleScroll() {
      if (mode === 'scroll' || mode === 'auto') {
        lastScrollAt.current = typeof performance !== 'undefined' ? performance.now() : Date.now();
        targetRef.current = computeScrollPhase();
      }
    }

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // initialize

    // Seed continuous trackers with the initial observation so we avoid a jump on first frame.
    const seedNow = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const preferTimeInitial =
      mode === 'time' ||
      (mode === 'auto' && seedNow - lastScrollAt.current > scrollHysteresisMs);
    const initialBase = preferTimeInitial ? ((seedNow % periodMs) / periodMs) : targetRef.current;
    phaseRef.current = clamp ? Math.min(1, Math.max(0, initialBase)) : initialBase;
    contRef.current = phaseRef.current;
    const seeded = normalise(phaseRef.current);
    lastPhaseRef.current = seeded;
    signRef.current = 1;

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      window.removeEventListener('scroll', handleScroll);
      cancelAnimationFrame(rafRef.current);
    };
  }, [
    mode,
    periodMs,
    damp,
    clamp,
    scrollHysteresisMs,
    publishBus,
    busEvent,
    offset01,
    invert,
    maxJumpPerFrame,
  ]);

  return phase;
}

export default useGlobalPhase;
