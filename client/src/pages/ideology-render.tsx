import { useEffect } from "react";
import CitizensArcView from "@/components/ideology/CitizensArcView";
import { exportNodeToImage, type PillExportFormat } from "@/lib/ideology/pill-export";

type ExportOptions = {
  pixelRatio?: number;
};

declare global {
  interface Window {
    __ideologyExportReady?: boolean;
    __ideologyExport?: (
      pillId: string,
      format: PillExportFormat,
      options?: ExportOptions,
    ) => Promise<string>;
  }
}

const noop = () => undefined;

export default function IdeologyRenderPage() {
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.style.backgroundColor = "transparent";
      document.body.style.backgroundColor = "transparent";
    }
    window.__ideologyExport = async (
      pillId: string,
      format: PillExportFormat,
      options?: ExportOptions,
    ) => {
      const target = document.querySelector(
        `[data-export-id="${pillId}"]`,
      ) as HTMLElement | null;
      if (!target) {
        throw new Error("export_target_missing");
      }
      return exportNodeToImage(target, format, {
        pixelRatio: options?.pixelRatio,
      });
    };
    window.__ideologyExportReady = true;
    return () => {
      delete window.__ideologyExport;
      delete window.__ideologyExportReady;
    };
  }, []);

  return (
    <div className="min-h-screen bg-transparent p-6">
      <div className="mx-auto w-full max-w-[760px]">
        <CitizensArcView onSelectNode={noop} />
      </div>
    </div>
  );
}
