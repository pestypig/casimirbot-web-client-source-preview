import { useCallback, useMemo, useRef, useState } from "react";
import type { ChangeEvent, DragEvent, PointerEvent } from "react";
import { HardwareFeedsController } from "@/hooks/useHardwareFeeds";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  controller: HardwareFeedsController;
};

const statusTone: Record<string, string> = {
  idle: "text-slate-400",
  pending: "text-amber-300",
  ok: "text-emerald-300",
  error: "text-rose-300",
};

const sourceLabel: Record<string, string> = {
  bridge: "LabBridge",
  files: "Files",
  direct: "Direct (beta)",
};

export function HardwareConnectModal({ controller }: Props) {
  const {
    panelTitle,
    help,
    status,
    profileJson,
    setProfileJson,
    connectViaBridge,
    connectFromProfile,
    ingestFiles,
    connectDirect,
    disconnect,
    setOpen,
    isLive,
    activeSource,
    lastEvent,
  } = controller;
  const [tab, setTab] = useState<"bridge" | "files" | "direct">("bridge");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const backdropPointerDownRef = useRef(false);

  const handleClose = useCallback(() => {
    setOpen(false);
  }, [setOpen]);

  const handleBackdropPointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    backdropPointerDownRef.current = event.target === event.currentTarget;
  }, []);

  const handleBackdropPointerUp = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const shouldClose =
        backdropPointerDownRef.current && event.target === event.currentTarget;
      backdropPointerDownRef.current = false;
      if (shouldClose) {
        handleClose();
      }
    },
    [handleClose],
  );

  const handleBackdropPointerCancel = useCallback(() => {
    backdropPointerDownRef.current = false;
  }, []);

  const statusText = useMemo(() => {
    if (status.level === "idle") return "Idle";
    if (status.level === "pending") return status.message ?? "Working…";
    if (status.level === "ok") {
      const suffix = status.timestamp
        ? ` — ${new Date(status.timestamp).toLocaleTimeString()}`
        : "";
      return `${status.message ?? "Connected"}${suffix}`;
    }
    if (status.level === "error") return status.message ?? "Error";
    return "";
  }, [status]);

  const onFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (files && files.length > 0) {
        await ingestFiles(files);
        event.target.value = "";
      }
    },
    [ingestFiles],
  );

  const onDrop = useCallback(
    async (event: DragEvent<HTMLLabelElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setDropActive(false);
      const files = event.dataTransfer?.files;
      if (files && files.length > 0) {
        await ingestFiles(files);
      }
    },
    [ingestFiles],
  );

  const onDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }, []);

  const panelHelp = useMemo(() => {
    const items = [
      { label: "Instruments", values: help.instruments },
      { label: "Feeds", values: help.feeds },
      { label: "Notes", values: help.notes },
    ];
    if (help.fileTypes?.length) {
      items.push({ label: "File types", values: help.fileTypes });
    }
    return items;
  }, [help]);

  const activeSourceLabel = activeSource ? sourceLabel[activeSource] ?? activeSource : "—";

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onPointerDown={handleBackdropPointerDown}
      onPointerUp={handleBackdropPointerUp}
      onPointerCancel={handleBackdropPointerCancel}
    >
      <div
        className="w-[720px] max-w-[95vw] rounded-2xl border border-slate-800 bg-slate-950/95 p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-200">
              {panelTitle} — Connect hardware
            </h3>
            <p className="text-xs text-slate-400">Bridge • Files • Direct (beta)</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span>
              Status:&nbsp;
              <span className={statusTone[status.level] ?? "text-slate-400"}>{statusText}</span>
            </span>
            <span>
              Source:&nbsp;<span className="text-slate-200">{activeSourceLabel}</span>
            </span>
            <Button size="sm" variant="ghost" onClick={handleClose}>
              Close
            </Button>
          </div>
        </div>

        <Tabs
          value={tab}
          onValueChange={(value) => setTab(value as typeof tab)}
          className="mt-4"
        >
          <TabsList>
            <TabsTrigger value="bridge">Bridge</TabsTrigger>
            <TabsTrigger value="files">Files</TabsTrigger>
            <TabsTrigger value="direct">Direct (beta)</TabsTrigger>
          </TabsList>

          <TabsContent value="bridge">
            <div className="mt-3 grid gap-4 md:grid-cols-[260px,1fr]">
              <aside className="rounded-xl border border-slate-800/80 bg-slate-950/70 p-3 text-xs text-slate-300">
                {panelHelp.map(({ label, values }) => (
                  <div key={label} className="mt-2 first:mt-0">
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      {label}
                    </div>
                    <ul className="space-y-1">
                      {values.map((entry, index) => (
                        <li key={`${label}-${index}`} className="leading-snug">
                          {entry}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </aside>

              <section className="rounded-xl border border-slate-800/80 bg-slate-950/70 p-4">
                <div className="text-xs text-slate-300">
                  Provide the instrument profile JSON that LabBridge exports. The profile is
                  cached per panel in your browser.
                </div>
                {help.profiles?.length ? (
                  <div className="mt-3 rounded-2xl border border-slate-800/70 bg-slate-950/60 p-3">
                    <div className="mb-2 text-sm font-semibold text-slate-200">Quick-start profiles</div>
                    <div className="grid gap-2">
                      {help.profiles.map((profile, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between gap-2 rounded-xl border border-slate-800/70 bg-slate-950/60 p-2"
                        >
                          <div className="min-w-0">
                            <div className="truncate font-medium text-slate-100">{profile.name}</div>
                            {profile.description ? (
                              <div className="truncate text-xs text-muted-foreground">{profile.description}</div>
                            ) : null}
                          </div>
                          <Button
                            size="sm"
                            onClick={async () => {
                              try {
                                await connectFromProfile?.(profile.json);
                                if (connectFromProfile) {
                                  setOpen(false);
                                }
                              } catch (err) {
                                console.error("[HardwareModal] profile connect failed", err);
                              }
                            }}
                          >
                            Connect
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                <Textarea
                  className="mt-3 h-48 font-mono text-xs"
                  value={profileJson}
                  onChange={(event) => setProfileJson(event.target.value)}
                  placeholder='{"profileId":"lab-01","timebase":{"source":"ptp","confidence":0.92}}'
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => void connectViaBridge()}>
                    Connect (Bridge)
                  </Button>
                  {isLive ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => disconnect()}
                    >
                      Disconnect
                    </Button>
                  ) : null}
                </div>
                {lastEvent ? (
                  <div className="mt-3 rounded border border-slate-800/60 bg-slate-900/50 p-2 text-[11px] text-slate-400">
                    <div className="font-semibold text-slate-200">Last stream event</div>
                    <div>type: {lastEvent.type}</div>
                    <div>received: {new Date(lastEvent.receivedAt).toLocaleTimeString()}</div>
                  </div>
                ) : null}
              </section>
            </div>
          </TabsContent>

          <TabsContent value="files">
            <div className="mt-3 grid gap-4 md:grid-cols-[260px,1fr]">
              <aside className="rounded-xl border border-slate-800/80 bg-slate-950/70 p-3 text-xs text-slate-300">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Workflow
                </div>
                <ol className="mt-2 space-y-1 list-decimal pl-4">
                  <li>Select or drop files that match the panel payload.</li>
                  <li>We normalize column names to match the REST contract.</li>
                  <li>Rows are POSTed to the hardware ingest endpoint in order.</li>
                </ol>
                <div className="mt-3 text-[11px] text-slate-400">
                  Uses the same guardrails as the simulator. DEV mocks accept the POSTs even when
                  the backend is offline.
                </div>
              </aside>
              <section className="rounded-xl border border-slate-800/80 bg-slate-950/70 p-4">
                <label
                  onDragEnter={(event) => {
                    event.preventDefault();
                    setDropActive(true);
                  }}
                  onDragLeave={(event) => {
                    event.preventDefault();
                    if (event.target === event.currentTarget) setDropActive(false);
                  }}
                  onDragOver={onDragOver}
                  onDrop={onDrop}
                  className={`flex min-h-[160px] flex-col items-center justify-center rounded-lg border border-dashed text-center text-xs ${
                    dropActive
                      ? "border-cyan-400 bg-cyan-400/5 text-cyan-200"
                      : "border-slate-700 text-slate-300"
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    multiple
                    onChange={onFileChange}
                  />
                  <div className="font-semibold text-slate-200">Drop files here</div>
                  <div className="mt-1 text-slate-400">or</div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Browse files
                  </Button>
                  {help.fileTypes?.length ? (
                    <div className="mt-2 text-slate-400">
                      Accepted: {help.fileTypes.join(", ")}
                    </div>
                  ) : null}
                </label>
              </section>
            </div>
          </TabsContent>

          <TabsContent value="direct">
            <div className="mt-3 grid gap-4 md:grid-cols-[260px,1fr]">
              <aside className="rounded-xl border border-slate-800/80 bg-slate-950/70 p-3 text-xs text-slate-300">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Beta notes
                </div>
                <ul className="mt-2 space-y-1">
                  <li>Requires Chrome 89+ with WebSerial/WebUSB enabled.</li>
                  <li>Read-only probe: we send *IDN? for discovery.</li>
                  <li>Use LabBridge for closed-loop or write access.</li>
                </ul>
              </aside>
              <section className="rounded-xl border border-slate-800/80 bg-slate-950/70 p-4 text-xs text-slate-300">
                <div>
                  Click connect to grant the browser access to an attached instrument. No commands
                  are sent beyond identification in this beta path.
                </div>
                <Button className="mt-3" size="sm" onClick={() => void connectDirect()}>
                  Request device access
                </Button>
                <div className="mt-3 rounded border border-slate-800/60 bg-slate-900/50 p-2 text-[11px] text-slate-400">
                  Prefer LabBridge for long-running sessions, guardrails, and timebase discipline.
                </div>
              </section>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

export default HardwareConnectModal;
