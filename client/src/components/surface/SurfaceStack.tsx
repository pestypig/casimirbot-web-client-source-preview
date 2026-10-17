import * as React from "react";
import { cn } from "@/lib/utils";
import type { SurfaceLayer, SurfaceRecipe } from "@/lib/surfacekit/types";

type SurfaceStackProps = {
  recipe: SurfaceRecipe;
  className?: string;
  style?: React.CSSProperties;
};

export function SurfaceStack({ recipe, className, style }: SurfaceStackProps) {
  const vars = React.useMemo(() => {
    const next: React.CSSProperties = {};
    Object.entries(recipe.vars).forEach(([key, value]) => {
      (next as Record<string, string>)[key] = value;
    });
    return next;
  }, [recipe.vars]);

  return (
    <div
      className={cn("surface-stack", className)}
      style={{ ...vars, ...style }}
      aria-hidden="true"
    >
      {recipe.layers.map((layer) => (
        <SurfaceLayerView key={`${layer.kind}-${layer.id}`} layer={layer} />
      ))}
    </div>
  );
}

function SurfaceLayerView({ layer }: { layer: SurfaceLayer }) {
  const layerStyle: React.CSSProperties = {
    opacity: layer.opacity,
  };
  const customStyle = layerStyle as React.CSSProperties & Record<string, string | number>;

  if (layer.blendMode) {
    layerStyle.mixBlendMode = layer.blendMode;
  }

  if (layer.transform) {
    layerStyle.transform = layer.transform;
  }

  if (layer.filter) {
    layerStyle.filter = layer.filter;
  }

  if (layer.background) {
    layerStyle.background = layer.background;
  }

  if (layer.imageUrl) {
    layerStyle.backgroundImage = `url("${layer.imageUrl}")`;
    layerStyle.backgroundRepeat =
      layer.motion?.type === "scroll-x" ? "repeat-x" : "no-repeat";
    layerStyle.backgroundSize =
      layer.motion?.type === "scroll-x" ? "auto 100%" : "cover";
    layerStyle.backgroundPosition = "center center";
  }

  if (layer.motion && layer.motion.type !== "none") {
    customStyle["--surface-motion-duration"] = `${layer.motion.durationMs}ms`;
    if (layer.motion.type === "wander") {
      customStyle["--surface-wander-scale"] = layer.motion.scale;
      customStyle["--surface-wander-scale-peak"] = Number((layer.motion.scale + 0.01).toFixed(3));
      customStyle["--surface-wander-x"] = `${layer.motion.xPct}%`;
      customStyle["--surface-wander-y"] = `${layer.motion.yPct}%`;
    }
    if (layer.motion.type === "scroll-x") {
      customStyle["--surface-scroll-end"] =
        layer.motion.direction === "right" ? "100%" : "-100%";
    }
  }

  return (
    <div
      className="surface-layer"
      data-kind={layer.kind}
      data-motion={layer.motion?.type ?? "none"}
      data-mask={layer.mask ?? "none"}
      data-source={layer.source ?? "asset"}
      style={layerStyle}
    >
      {layer.svg ? (
        <div
          className="surface-svg"
          dangerouslySetInnerHTML={{ __html: layer.svg }}
        />
      ) : null}
    </div>
  );
}
