import * as React from "react";
import type { VacuumGapSweepRow } from "@shared/schema";

type HeatmapCell = { d_nm: number; Omega_GHz: number; G_dB: number };

export interface VacuumGapHeatmapProps {
  rows: VacuumGapSweepRow[];
  width?: number;
  height?: number;
  onCellClick?: (cell: HeatmapCell) => void;
}

function uniqueSorted(values: number[]) {
  return Array.from(new Set(values)).sort((a, b) => a - b);
}

function clamp(value: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, value));
}

function colorForGain(gain: number, min: number, max: number) {
  const span = Math.max(max - min, 1e-9);
  const t = clamp((gain - min) / span, 0, 1);
  const hue = 240 * (1 - t); // 240 blue -> 0 red
  return `hsl(${hue}, 70%, 50%)`;
}

export const VacuumGapHeatmap: React.FC<VacuumGapHeatmapProps> = ({
  rows,
  width = 680,
  height = 380,
  onCellClick,
}) => {
  const safeRows = Array.isArray(rows) ? rows : [];
  const dValues = React.useMemo(() => uniqueSorted(safeRows.map((r) => r.d_nm)), [safeRows]);
  const omegaValues = React.useMemo(
    () => uniqueSorted(safeRows.map((r) => r.Omega_GHz)),
    [safeRows],
  );
  const crestCells = React.useMemo(() => {
    const unique = new Map<string, VacuumGapSweepRow>();
    for (const row of safeRows) {
      if (!row.crest) continue;
      const key = `${row.d_nm}|${row.Omega_GHz}`;
      const prev = unique.get(key);
      if (prev == null || row.G > prev.G) {
        unique.set(key, row);
      }
    }
    return Array.from(unique.values());
  }, [rows]);

  const grid = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const row of safeRows) {
      const key = `${row.d_nm}|${row.Omega_GHz}`;
      const prev = map.get(key);
      if (prev == null || row.G > prev) {
        map.set(key, row.G);
      }
    }
    return map;
  }, [rows]);

  const gains = Array.from(grid.values());
  const gainMin = gains.length ? Math.min(...gains) : 0;
  const gainMax = gains.length ? Math.max(...gains) : 1;

  const paddingLeft = 56;
  const paddingBottom = 32;
  const paddingTop = 8;
  const paddingRight = 8;
  const innerWidth = width - paddingLeft - paddingRight;
  const innerHeight = height - paddingTop - paddingBottom;
  const cols = Math.max(1, omegaValues.length);
  const rowsCount = Math.max(1, dValues.length);
  const cellWidth = innerWidth / cols;
  const cellHeight = innerHeight / rowsCount;

  return (
    <svg
      width={width}
      height={height}
      role="img"
      aria-label="Gain heatmap over gap and pump frequency"
    >
      <g transform={`translate(${paddingLeft},${paddingTop})`}>
        {dValues.map((d, rowIndex) =>
          omegaValues.map((omega, colIndex) => {
            const key = `${d}|${omega}`;
            const gain = grid.get(key);
            const fill =
              typeof gain === "number" ? colorForGain(gain, gainMin, gainMax) : "hsl(0,0%,90%)";
            return (
              <rect
                key={key}
                x={colIndex * cellWidth}
                y={(rowsCount - 1 - rowIndex) * cellHeight}
                width={Math.max(1, cellWidth - 1)}
                height={Math.max(1, cellHeight - 1)}
                fill={fill}
                opacity={0.95}
                onClick={() => {
                  if (typeof gain === "number") {
                    onCellClick?.({ d_nm: d, Omega_GHz: omega, G_dB: gain });
                  }
                }}
              />
            );
          }),
        )}

        {crestCells.map((row) => {
          const colIndex = omegaValues.indexOf(row.Omega_GHz);
          const rowIndex = dValues.indexOf(row.d_nm);
          if (colIndex === -1 || rowIndex === -1) return null;
          const cx = colIndex * cellWidth + cellWidth / 2;
          const cy = (rowsCount - 1 - rowIndex) * cellHeight + cellHeight / 2;
          const radius = Math.max(3, Math.min(cellWidth, cellHeight) / 5);
          return (
            <circle
              key={`crest-${row.d_nm}-${row.Omega_GHz}`}
              cx={cx}
              cy={cy}
              r={radius}
              fill="none"
              stroke="rgb(34,197,94)"
              strokeWidth={2}
              opacity={0.9}
            />
          );
        })}

        {dValues.map((d, index) => (
          <g
            key={`y-${index}`}
            transform={`translate(-6,${(rowsCount - 1 - index) * cellHeight + cellHeight / 2})`}
          >
            <text textAnchor="end" dominantBaseline="middle" fontSize={11}>
              {d}
            </text>
          </g>
        ))}

        {omegaValues.map((omega, index) => (
          <g
            key={`x-${index}`}
            transform={`translate(${index * cellWidth + cellWidth / 2},${innerHeight + 16})`}
          >
            <text textAnchor="middle" dominantBaseline="middle" fontSize={11}>
              {omega.toFixed(2)}
            </text>
          </g>
        ))}
      </g>

      <text
        x={paddingLeft + innerWidth / 2}
        y={height - 2}
        textAnchor="middle"
        fontSize={12}
      >
        Pump Omega (GHz)
      </text>
      <text
        x={12}
        y={paddingTop + innerHeight / 2}
        transform={`rotate(-90, 12, ${paddingTop + innerHeight / 2})`}
        textAnchor="middle"
        fontSize={12}
      >
        Gap d (nm)
      </text>

      <g transform={`translate(${width - 16}, ${paddingTop})`}>
        {Array.from({ length: 24 }).map((_, index) => {
          const t = index / 23;
          const gain = gainMin + t * (gainMax - gainMin);
          return (
            <rect
              key={index}
              x={0}
              y={index * 8}
              width={8}
              height={8}
              fill={colorForGain(gain, gainMin, gainMax)}
            />
          );
        })}
        <text x={-6} y={-2} textAnchor="end" fontSize={11}>
          {gainMax.toFixed(1)} dB
        </text>
        <text x={-6} y={24 * 8 + 8} textAnchor="end" fontSize={11}>
          {gainMin.toFixed(1)} dB
        </text>
      </g>
    </svg>
  );
};

export default VacuumGapHeatmap;
