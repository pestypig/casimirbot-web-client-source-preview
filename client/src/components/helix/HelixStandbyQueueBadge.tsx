export function HelixStandbyQueueBadge({
  label = "Standby active",
  paused = false,
}: {
  label?: string;
  paused?: boolean;
}) {
  return (
    <div
      className={`inline-flex items-center rounded border px-2 py-1 text-[10px] uppercase tracking-wide ${
        paused
          ? "border-amber-300/30 bg-amber-950/20 text-amber-100"
          : "border-emerald-300/25 bg-emerald-950/20 text-emerald-100"
      }`}
    >
      {paused ? "Standby paused for your request" : label}
    </div>
  );
}
