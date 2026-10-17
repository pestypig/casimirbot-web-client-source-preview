import React, { type ReactNode } from "react";

export type HelixAskConsoleStackProps = {
  className?: string;
  layoutVariant: "hero" | "dock";
  children: ReactNode;
};

export function HelixAskConsoleStack({
  className,
  layoutVariant,
  children,
}: HelixAskConsoleStackProps) {
  return (
    <div className={[className, layoutVariant === "dock" ? "min-h-0" : ""].filter(Boolean).join(" ")}>
      {children}
    </div>
  );
}
