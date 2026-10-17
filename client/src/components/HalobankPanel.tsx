import { useState } from "react";
import { ExternalLink, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePanelHashFocus } from "@/lib/whispers/usePanelHashFocus";

const HALOBANK_URL = "/halobank";

export default function HalobankPanel() {
  const [reloadKey, setReloadKey] = useState<number>(() => Date.now());
  const panelRef = usePanelHashFocus("#halobank", () => ({
    panel: "halobank",
    url: HALOBANK_URL,
    lastReload: reloadKey
  }));

  const handleReload = () => {
    setReloadKey(Date.now());
  };

  const handlePopOut = () => {
    if (typeof window === "undefined") return;
    window.open(HALOBANK_URL, "_blank", "noopener,noreferrer");
  };

  return (
    <section
      ref={panelRef}
      data-panel-hash="#halobank"
      className="flex h-full flex-col bg-[#050b18] p-3 text-slate-100"
    >
      <div className="relative flex flex-1 min-h-0 overflow-hidden rounded-xl border border-white/10 bg-black">
        <div className="pointer-events-none absolute right-3 top-3 z-10 flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={handleReload}
            className="pointer-events-auto h-9 w-9 border-cyan-400/60 bg-slate-900/50 text-cyan-100 hover:bg-slate-900/80"
            aria-label="Reload HaloBank"
          >
            <RefreshCcw className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            onClick={handlePopOut}
            className="pointer-events-auto h-9 w-9 bg-cyan-500/80 text-slate-950 hover:bg-cyan-500"
            aria-label="Open HaloBank in new tab"
          >
            <ExternalLink className="h-4 w-4" />
          </Button>
        </div>
        <iframe
          key={reloadKey}
          title="HaloBank research timeline"
          src={HALOBANK_URL}
          className="h-full w-full"
          loading="lazy"
        />
      </div>
    </section>
  );
}
