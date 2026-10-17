import {
  mirekCellGridClassName,
  type MirekReasoningDisplayGrid,
} from "@/lib/helix/ask-reasoning-theater-display";

export type HelixAskReasoningMirekFieldProps = {
  grid: MirekReasoningDisplayGrid | null;
  fogOpacity: number;
  fieldStrength: number;
};

export function HelixAskReasoningMirekField({
  grid,
  fogOpacity,
  fieldStrength,
}: HelixAskReasoningMirekFieldProps) {
  if (!grid) return null;

  return (
    <div
      data-testid="helix-ask-mirek-field"
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden
    >
      <div
        className="absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(circle at 18% 50%, rgba(255,255,255,0.12), transparent 32%), radial-gradient(circle at 82% 42%, rgba(34,211,238,0.1), transparent 34%)",
        }}
      />
      <div
        className="absolute inset-x-2 bottom-2 top-2 grid gap-[1px] opacity-95 mix-blend-screen"
        style={{
          gridTemplateColumns: `repeat(${grid.width}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${grid.height}, minmax(0, 1fr))`,
        }}
      >
        {grid.cells.map((cell, index) => (
          <span
            key={cell.id}
            className={`block h-full w-full rounded-[1px] ${
              cell.active ? `animate-pulse ${mirekCellGridClassName(cell.kind)}` : "bg-white/[0.035]"
            }`}
            style={{
              gridColumn: cell.x + 1,
              gridRow: cell.y + 1,
              opacity:
                (cell.active ? Math.max(0.18, cell.intensity) : 0.08) *
                (0.52 + fogOpacity * 0.24) *
                fieldStrength,
              animationDelay: `${((cell.x + cell.y * 1.7 + index * 0.03) % 14) * 0.055}s`,
              animationDuration: `${0.95 + ((cell.x + cell.y + index) % 7) * 0.1}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
