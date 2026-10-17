import React from "react";

export type HelixAskMathHtmlSurfaceProps = {
  html: string;
  displayMode: boolean;
};

export function HelixAskMathHtmlSurface({ html, displayMode }: HelixAskMathHtmlSurfaceProps) {
  return (
    <span
      className={displayMode ? "my-1 block overflow-x-auto text-slate-100" : "inline-block align-middle text-slate-100"}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
