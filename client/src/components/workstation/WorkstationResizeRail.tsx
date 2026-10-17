import { useEffect, useRef } from "react";
import { markInteraction } from "@/lib/workstation/performance/workstationInteractionScheduler";

export function WorkstationResizeRail({
  onResizeStart,
  onResizePreview,
  onResizeCommit,
  onResizeCancel,
}: {
  onResizeStart?: () => void;
  onResizePreview: (deltaX: number) => void;
  onResizeCommit: (deltaX: number) => void;
  onResizeCancel?: () => void;
}) {
  const startXRef = useRef<number | null>(null);
  const latestDeltaRef = useRef(0);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const flushPreview = () => {
      frameRef.current = null;
      onResizePreview(latestDeltaRef.current);
    };
    const handleMove = (event: MouseEvent) => {
      if (startXRef.current === null) return;
      markInteraction("resizing", "workstation.resize_rail");
      latestDeltaRef.current = startXRef.current - event.clientX;
      if (frameRef.current !== null) return;
      frameRef.current = window.requestAnimationFrame(flushPreview);
    };
    const handleUp = () => {
      if (startXRef.current !== null) {
        onResizeCommit(latestDeltaRef.current);
      }
      startXRef.current = null;
      latestDeltaRef.current = 0;
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      if (startXRef.current !== null) {
        onResizeCancel?.();
      }
    };
  }, [onResizeCancel, onResizeCommit, onResizePreview]);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      className="h-full w-1.5 cursor-col-resize bg-transparent hover:bg-sky-400/30"
      onMouseDown={(event) => {
        event.preventDefault();
        markInteraction("resizing", "workstation.resize_rail");
        startXRef.current = event.clientX;
        latestDeltaRef.current = 0;
        onResizeStart?.();
      }}
    />
  );
}
