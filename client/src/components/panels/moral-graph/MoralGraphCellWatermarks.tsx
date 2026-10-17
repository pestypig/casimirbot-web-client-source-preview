import React from "react";
import type { MoralGraphBiomeScaleCell } from "@/lib/moral-graph/biomeScaleViewModel";

const WATERMARK_COLUMN_STEP = 92;
const WATERMARK_ROW_STEP = 34;
const BASE_WATERMARK_FONT_SIZE = 9;
const MAX_WATERMARK_FONT_SIZE = 34;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function watermarkWords(cell: MoralGraphBiomeScaleCell, translateText: (text: string) => string): string[] {
  return cell.label
    .split("/")
    .map((part: string) => part.trim())
    .map((part: string) => translateText(part))
    .filter(Boolean);
}

function watermarkGrid(cell: MoralGraphBiomeScaleCell, columnStep: number, rowStep: number): { columns: number; rows: number; count: number } {
  const columns = Math.max(2, Math.ceil((cell.width + columnStep) / columnStep));
  const rows = Math.max(4, Math.ceil((cell.height + rowStep) / rowStep));
  return {
    columns,
    rows,
    count: Math.min(96, columns * rows),
  };
}

export function MoralGraphCellWatermarks({
  cells,
  zoom = 1,
  translateText = (text: string) => text,
}: {
  cells: MoralGraphBiomeScaleCell[];
  zoom?: number;
  translateText?: (text: string) => string;
}) {
  const fontSize = Number(clamp(BASE_WATERMARK_FONT_SIZE / Math.max(zoom, 0.22), BASE_WATERMARK_FONT_SIZE, MAX_WATERMARK_FONT_SIZE).toFixed(2));
  const columnStep = Math.max(WATERMARK_COLUMN_STEP, fontSize * 8.8);
  const rowStep = Math.max(WATERMARK_ROW_STEP, fontSize * 3.8);
  return (
    <div className="pointer-events-none absolute inset-0 z-0" data-testid="moral-graph-cell-watermarks" aria-hidden="true">
      {cells.map((cell: MoralGraphBiomeScaleCell) => {
        const words = watermarkWords(cell, translateText);
        const grid = watermarkGrid(cell, columnStep, rowStep);
        return (
          <div
            key={cell.id}
            data-testid="moral-graph-cell-watermark"
            data-biome={cell.biomeId}
            data-scale-band={cell.scaleBand}
            className="absolute overflow-hidden"
            style={{
              left: cell.x,
              top: cell.y,
              width: cell.width,
              height: cell.height,
            }}
          >
            {Array.from({ length: grid.count }).map((_, index: number) => {
              const column = index % grid.columns;
              const row = Math.floor(index / grid.columns);
              const word = words[(column + row) % words.length] ?? cell.label;
              return (
                <span
                  key={`${cell.id}:${index}`}
                  data-testid="moral-graph-cell-watermark-word"
                  data-font-size={fontSize}
                  className="absolute select-none whitespace-nowrap font-black uppercase text-zinc-400/25"
                  style={{
                    left: -16 + column * columnStep + (row % 2) * Math.max(28, fontSize * 2.6),
                    top: 8 + row * rowStep,
                    fontSize,
                    transform: "rotate(-35deg)",
                    transformOrigin: "left center",
                    letterSpacing: "0",
                  }}
                >
                  {word}
                </span>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

export default MoralGraphCellWatermarks;
