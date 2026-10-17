import { useEffect, useRef } from "react";
import { apiRequest } from "@/lib/queryClient";

type Args = {
  mode: 'standby'|'hover'|'taxi'|'nearzero'|'cruise'|'emergency';
  duty: number;
  sectors: number;
  freqGHz: number;
  onLog?: (line: string) => void;
  onAfterRun?: () => void; // e.g. refetchMetrics
  enabled?: boolean;       // allow disable in debug
};

export function useResonatorAutoDuty({
  mode, duty, sectors, freqGHz, onLog, onAfterRun, enabled = true
}: Args) {
  const debounceRef = useRef<number | null>(null);
  const lastSigRef = useRef<string>("");

  useEffect(() => {
    if (!enabled) return;

    // Make a small, stable signature for changes that matter to the schedule
    const sig = `${mode}|${duty.toFixed(6)}|${sectors}|${freqGHz.toFixed(6)}`;
    if (lastSigRef.current === sig) return;
    lastSigRef.current = sig;

    if (debounceRef.current) cancelAnimationFrame(debounceRef.current);
    debounceRef.current = requestAnimationFrame(async () => {
      try {
        const cmd = (mode === 'hover' || mode === 'taxi' || mode === 'nearzero' || mode === 'emergency')
          ? "Execute auto-duty pulse sequence across all 400 sectors"
          : `Simulate a full pulse cycle at ${freqGHz} GHz`;

        onLog?.(`[SCHED] ${cmd} (mode=${mode}, duty=${(duty*100).toFixed(2)}%, S=${sectors}, f=${freqGHz.toFixed(3)} GHz)`);

        // AbortController not available in this context, but signal could be passed if needed
        const res = await apiRequest('POST', '/api/helix/command', {
          messages: [{ role: 'user', content: cmd }]
        });
        const data = await res.json();

        if (data?.functionResult?.log) {
          onLog?.(`[SCHED:OK] ${data.functionResult.log}`);
        } else {
          onLog?.(`[SCHED:OK] Completed ${mode} update`);
        }
        onAfterRun?.();
      } catch (e) {
        onLog?.(`[SCHED:ERR] ${e instanceof Error ? e.message : 'update failed'}`);
      }
    });

    return () => {
      if (debounceRef.current) cancelAnimationFrame(debounceRef.current);
      debounceRef.current = null;
    };
  }, [mode, duty, sectors, freqGHz, enabled, onLog, onAfterRun]);
}

