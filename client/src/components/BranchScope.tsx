import { useEffect, useRef } from "react";

export interface BranchScopeProps {
  psi?: number[];
  centers: number[][];
  selected?: number | null;
  suggested?: number | null;
  width?: number;
  height?: number;
  className?: string;
}

const defaultSize = 260;

const BranchScope = ({
  psi,
  centers,
  selected = null,
  suggested = null,
  width = defaultSize,
  height = defaultSize,
  className,
}: BranchScopeProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#050505";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const vectors = [...centers];
    if (psi) vectors.push(psi);
    const projected = vectors.map(projectVector);
    const maxRadius =
      projected.reduce((acc, v) => Math.max(acc, Math.hypot(v.x, v.y)), 0) || 1;

    const scale = (Math.min(canvas.width, canvas.height) * 0.4) / maxRadius;

    drawGrid(ctx, canvas);

    centers.forEach((center, idx) => {
      const { x, y } = projectVector(center);
      const drawX = canvas.width / 2 + x * scale;
      const drawY = canvas.height / 2 - y * scale;
      ctx.beginPath();
      ctx.fillStyle =
        idx === selected
          ? "#66f6e7"
          : idx === suggested
            ? "rgba(93, 167, 255, 0.9)"
            : "rgba(255, 255, 255, 0.6)";
      ctx.strokeStyle = "rgba(0, 0, 0, 0.6)";
      ctx.lineWidth = idx === selected ? 3 : 1;
      ctx.arc(drawX, drawY, idx === selected ? 8 : 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
      ctx.font = "12px monospace";
      ctx.fillText(`#${idx}`, drawX + 10, drawY + 4);
    });

    if (psi) {
      const { x, y } = projectVector(psi);
      const drawX = canvas.width / 2 + x * scale;
      const drawY = canvas.height / 2 - y * scale;
      ctx.beginPath();
      ctx.fillStyle = "#ffb347";
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 2;
      ctx.arc(drawX, drawY, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#ffb347";
      ctx.font = "12px monospace";
      ctx.fillText("ψ", drawX + 10, drawY);
    }
  }, [psi, centers, selected, suggested, width, height]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className={className}
    />
  );
};

const projectVector = (vector: number[]) => ({
  x: vector[0] ?? 0,
  y: vector[1] ?? 0,
});

const drawGrid = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
  ctx.save();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
  ctx.lineWidth = 1;
  const step = canvas.width / 10;
  for (let i = step; i < canvas.width; i += step) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, canvas.height);
    ctx.stroke();
  }
  for (let j = step; j < canvas.height; j += step) {
    ctx.beginPath();
    ctx.moveTo(0, j);
    ctx.lineTo(canvas.width, j);
    ctx.stroke();
  }
  ctx.restore();
};

export default BranchScope;

