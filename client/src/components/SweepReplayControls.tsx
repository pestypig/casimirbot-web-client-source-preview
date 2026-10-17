import * as React from "react";
import type { VacuumGapSweepRow } from "@shared/schema";

export interface SweepReplayControlsProps {
  rows: VacuumGapSweepRow[];
  onStep?: (row: VacuumGapSweepRow, index: number) => void;
}

export const SweepReplayControls: React.FC<SweepReplayControlsProps> = ({ rows, onStep }) => {
  const [index, setIndex] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);
  const [speed, setSpeed] = React.useState(1);
  const timerRef = React.useRef<number | null>(null);

  const stop = React.useCallback(() => {
    setPlaying(false);
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stepTo = React.useCallback(
    (next: number) => {
      if (!rows.length) return;
      const clamped = Math.max(0, Math.min(rows.length - 1, next));
      setIndex(clamped);
      const row = rows[clamped];
      if (row) onStep?.(row, clamped);
    },
    [rows, onStep],
  );

  const play = React.useCallback(() => {
    if (!rows.length || timerRef.current != null) return;
    setPlaying(true);
    const interval = Math.max(30, 250 / Math.max(1, speed));
    timerRef.current = window.setInterval(() => {
      setIndex((prev) => {
        const next = rows.length ? (prev + 1) % rows.length : 0;
        const row = rows[next];
        if (row) onStep?.(row, next);
        return next;
      });
    }, interval);
  }, [rows, speed, onStep]);

  React.useEffect(() => {
    return () => {
      if (timerRef.current != null) {
        window.clearInterval(timerRef.current);
      }
    };
  }, []);

  React.useEffect(() => {
    if (!rows.length) {
      stop();
      setIndex(0);
    } else if (index >= rows.length) {
      setIndex(rows.length - 1);
    }
  }, [rows, index, stop]);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <button onClick={() => stepTo(index - 1)} disabled={!rows.length}>
        {"<"}
      </button>
      {playing ? (
        <button onClick={stop}>Pause</button>
      ) : (
        <button onClick={play} disabled={!rows.length}>
          Play
        </button>
      )}
      <button onClick={() => stepTo(index + 1)} disabled={!rows.length}>
        {">"}
      </button>
      <label style={{ display: "inline-flex", alignItems: "center", gap: 6, marginLeft: 12 }}>
        Speed:
        <select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>
          <option value={0.5}>0.5x</option>
          <option value={1}>1x</option>
          <option value={2}>2x</option>
          <option value={4}>4x</option>
        </select>
      </label>
      <div style={{ marginLeft: "auto", fontSize: 12, opacity: 0.8 }}>
        {rows.length ? `Step ${index + 1}/${rows.length}` : "No sweep data"}
      </div>
    </div>
  );
};

export default SweepReplayControls;
