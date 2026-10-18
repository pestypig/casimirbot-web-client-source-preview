import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Bot, Clock3, Gamepad2, Globe2, MoreHorizontal, Package, ShieldCheck, Sparkles, Store, UserRound, Monitor, RefreshCw } from "lucide-react";
import { environmentHomeDirectorySchema, privateEnvironmentStateSchema, matchesEnvironmentHomeInstallation,
  type EnvironmentHomePackage, type PrivateEnvironmentState } from "@shared/desktop-environment-home";
import { useWorkstationLayoutStore } from "@/store/useWorkstationLayoutStore";
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT } from "@/lib/workstation/accountCapabilityPolicy";
import type { z } from "zod";
import PrivateClockCheck, { type PrivateClockBridge } from "./PrivateClockCheck";
import PrivateClockMcpPermission from "./PrivateClockMcpPermission";
import PrivatePackageRemoval, { type PrivateRemovalBridge } from "./PrivatePackageRemoval";
import {startEnvironmentHomeController} from "./environmentHomeController";
import LocalPersonalConnectionSetup from "../agent-access/LocalPersonalConnectionSetup";
import MinecraftHomeReadinessPreview from "./MinecraftHomeReadinessPreview";

const DIRECTORY = "/api/agi/environment-connectors/private/directory/packages";
const MINECRAFT_MENU = "built-in:minecraft";
type Directory = z.infer<typeof environmentHomeDirectorySchema>;
const title = (record: EnvironmentHomePackage) => record.package_id.replace(/^com\.casimirbot\./, "")
  .split(/[._-]/).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
const button = "rounded-lg border border-white/20 px-3 py-2 text-sm hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 disabled:cursor-not-allowed disabled:opacity-45";

export default function EnvironmentHomePanel() {
  const openPanel = useWorkstationLayoutStore(state => state.openPanelInActiveGroup);
  const [directory, setDirectory] = useState<Directory | null>(null);
  const [installed, setInstalled] = useState<PrivateEnvironmentState | null>(null);
  const [busy, setBusy] = useState(true), [message, setMessage] = useState("");
  const [removalBusy, setRemovalBusy] = useState(false);
  const [store, setStore] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [connection, setConnection] = useState(false);
  const [clockActive, setClockActive] = useState(false);
  const [minecraftPreview, setMinecraftPreview] = useState(false);
  const minecraftTrigger = useRef<HTMLButtonElement | null>(null);
  const [controllerEnabled, setControllerEnabled] = useState(false);
  const removalBridge = useMemo<PrivateRemovalBridge | null>(() => {
    const native = window.casimirDesktop;
    return native?.getPrivateEnvironmentRemovalState && native.removePrivateEnvironmentPackage
      ? { getPrivateEnvironmentRemovalState: native.getPrivateEnvironmentRemovalState, removePrivateEnvironmentPackage: native.removePrivateEnvironmentPackage } : null;
  }, []);
  const removed = useCallback(() => {
    generation.current++;
    setInstalled(previous => previous ? { ...previous, status: "not_installed", installationRef: undefined } : null);
    setBusy(false);
  }, []);
  const clockBridge = useMemo<PrivateClockBridge | null>(() => {
    const native = window.casimirDesktop;
    return native?.preparePrivateClock && native.observePrivateClock && native.recoverPrivateClockObservation && native.stopPrivateClock
      ? { preparePrivateClock: native.preparePrivateClock, observePrivateClock: native.observePrivateClock,
        recoverPrivateClockObservation: native.recoverPrivateClockObservation, stopPrivateClock: native.stopPrivateClock } : null;
  }, []);
  const grid = useRef<HTMLDivElement>(null), menuTrigger = useRef<HTMLButtonElement | null>(null);
  const menuPanel = useRef<HTMLDivElement>(null), menuFromEnd = useRef(false);
  const menuId = useId();
  const detailsPanel = useRef<HTMLElement>(null);
  const detailsTrigger = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!controllerEnabled || !grid.current || selected || menu) return;
    return startEnvironmentHomeController(grid.current);
  }, [controllerEnabled, selected, menu, store]);
  useEffect(() => {
    if (!menu) return;
    const items = menuPanel.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
    items?.[menuFromEnd.current ? items.length - 1 : 0]?.focus();
    const outside = (event: Event) => {
      if (event.target instanceof Node && !menuPanel.current?.contains(event.target) &&
          !menuTrigger.current?.contains(event.target)) setMenu(null);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", outside);
    };
  }, [menu]);
  const previousStore = useRef(store);
  useEffect(() => {
    const changed = previousStore.current !== store;
    previousStore.current = store;
    if (changed && controllerEnabled) grid.current?.querySelector<HTMLButtonElement>("[data-home-tile-primary]")?.focus();
  }, [store, controllerEnabled]);
  useEffect(() => {
    if (!selected) return;
    detailsPanel.current?.focus({ preventScroll: true });
    detailsPanel.current?.scrollIntoView({ block: "start", behavior: "auto" });
  }, [selected, connection]);
  const generation = useRef(0);
  const load = useCallback(async () => {
    setControllerEnabled(false);
    const request = ++generation.current;
    setBusy(true); setDirectory(null); setInstalled(null); setMenu(null); setSelected(null); setMinecraftPreview(false); setMessage("");
    try {
      const response = await fetch(DIRECTORY, { credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw Error("directory_unavailable");
      const data = environmentHomeDirectorySchema.parse(await response.json());
      if (Date.parse(data.policy_expires_at) <= Date.now() || new Set(data.packages.map(p => p.package_version_id)).size !== data.packages.length) throw Error("directory_stale");
      let native: PrivateEnvironmentState | null = null;
      if (window.casimirDesktop?.getPrivateEnvironmentState) {
        try { native = privateEnvironmentStateSchema.parse(await window.casimirDesktop.getPrivateEnvironmentState()); }
        catch { /* Keep the catalog usable, but never infer an installation. */ }
      }
      if (request !== generation.current) return;
      setDirectory(data); setInstalled(native);
    } catch {
      if (request === generation.current) setMessage("The private catalog is unavailable. Check your developer account and local harness, then refresh.");
    } finally { if (request === generation.current) setBusy(false); }
  }, []);
  useEffect(() => {
    void load();
    const changed = () => void load();
    window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, changed);
    return () => { generation.current++; window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, changed); };
  }, [load]);
  useEffect(() => {
    if (!directory) return;
    const timer = window.setTimeout(() => {
      generation.current++; setDirectory(null); setInstalled(null); setSelected(null); setMenu(null); setBusy(false);
      setControllerEnabled(false);
      setMessage("Catalog approval has expired. Refresh to check current availability.");
    }, Math.max(0, Math.min(2147483647, Date.parse(directory.policy_expires_at) - Date.now())));
    return () => window.clearTimeout(timer);
  }, [directory]);

  const canInstall = (record: EnvironmentHomePackage) => Boolean(!busy && !removalBusy && !clockActive && directory && Date.parse(directory.policy_expires_at) > Date.now() &&
    record.lifecycle_status === "active" && record.install_available && installed?.installAvailable &&
    matchesEnvironmentHomeInstallation(record, installed) && window.casimirDesktop?.installPrivateEnvironmentPackage);
  const install = async (record: EnvironmentHomePackage) => {
    if (!canInstall(record)) return;
    const request = ++generation.current;
    setBusy(true); setMessage("");
    try {
      const result = privateEnvironmentStateSchema.parse(await window.casimirDesktop!.installPrivateEnvironmentPackage!());
      if (request !== generation.current) return;
      if (!matchesEnvironmentHomeInstallation(record, result)) throw Error("installation_mismatch");
      setInstalled(result);
      setMessage(result.cancelled ? "Installation canceled." : result.status === "installed_stopped"
        ? "Package installed. Installation grants no runtime or program access."
        : "Installation could not be completed. Refresh your account and catalog status before retrying.");
    } catch { if (request === generation.current) { setInstalled(null); setMessage("Installation status is unavailable. Refresh before retrying."); } }
    finally { if (request === generation.current) setBusy(false); }
  };
  const details = directory?.packages.find(p => p.package_version_id === selected);
  const clockRecord = directory?.packages.find(record => record.package_id === "com.casimirbot.system.clock" &&
    record.lifecycle_status === "active" && record.install_available && matchesEnvironmentHomeInstallation(record, installed));
  const clockAdmission = clockRecord && installed?.status === "installed_stopped" && installed.installAvailable && installed.installationRef && directory
    ? { installationRef: installed.installationRef, catalogSnapshotId: directory.policy_revision, expiresAt: directory.policy_expires_at } : null;
  const stateLabel = (record: EnvironmentHomePackage) => {
    if (record.lifecycle_status !== "active") return "Unavailable";
    if (!matchesEnvironmentHomeInstallation(record, installed)) return "Installation status unavailable";
    if (installed?.status === "installed_stopped") return clockActive ? "Installed · clock controls busy" : "Installed · stopped";
    if (installed?.status === "not_installed") return "Not installed";
    return "Installation unavailable";
  };
  const showDetails = (record: EnvironmentHomePackage, configure = false) => {
    if (selected === record.package_version_id && connection === configure) {
      detailsPanel.current?.focus({ preventScroll: true });
      detailsPanel.current?.scrollIntoView({ block: "start", behavior: "auto" });
    }
    setSelected(record.package_version_id); setConnection(configure); setMenu(null); setMinecraftPreview(false);
  };

  return <section className="min-h-full bg-slate-950 px-5 py-6 text-slate-100" aria-label="Environment Home">
    <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-xs uppercase tracking-widest text-cyan-300">Workspace</p>
        <h1 className="mt-1 text-2xl font-semibold">{store ? "Environment Store" : "Home"}</h1>
        <p className="mt-2 max-w-xl text-sm text-slate-400">Your programs and local tools, in one workspace.</p></div>
      <div className="flex gap-2">
        <button className={button} aria-pressed={controllerEnabled} disabled={!controllerEnabled && (busy || !directory || typeof navigator.getGamepads !== "function")}
          title={typeof navigator.getGamepads !== "function" ? "Controller input is unavailable in this browser." : undefined}
          onClick={() => { setControllerEnabled(!controllerEnabled); if (!controllerEnabled)
            grid.current?.querySelector<HTMLButtonElement>("[data-home-tile-primary]")?.focus(); }}>
          {controllerEnabled ? "Stop controller navigation" : "Use controller"}</button>
        {store && <button className={button} onClick={() => setStore(false)}>Back to Home</button>}
        <button className={button} onClick={() => void load()} disabled={busy || removalBusy} aria-label="Refresh environment catalog"><RefreshCw className="h-4 w-4" /></button></div>
    </header>
    {store && <p role="status" aria-live="polite" className="mb-4 text-sm text-slate-300">{busy ? "Checking your local packages…" : message}</p>}
    {!store && <section aria-label="Choose how to start" className="mb-6 grid gap-3 rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.04] p-4 md:grid-cols-2 xl:grid-cols-4">
      <div><p className="text-sm font-semibold text-cyan-100">Free personal tools</p>
        <p className="mt-1 text-xs leading-5 text-slate-300">Explore local tools below. Each program asks for its own permission when needed.</p></div>
      <div><p className="text-sm font-semibold text-cyan-100">Use my AI connection</p>
        <p className="mt-1 text-xs leading-5 text-slate-300">Connect your own provider or Codex access. Provider charges stay with your account.</p>
        <button type="button" className="mt-2 text-xs font-medium text-cyan-200 underline underline-offset-4 hover:text-white" onClick={() => openPanel("agent-access")}>Set up AI connection</button></div>
      <div><p className="text-sm font-semibold text-cyan-100">Hosted rooms</p>
        <p className="mt-1 text-xs leading-5 text-slate-300">Shared sessions are in development. The hosted-room pilot uses a separate subscription and can work without model calls. Capped managed AI is planned as a separate option.</p></div>
      <div><p className="text-sm font-semibold text-cyan-100">CasimirBot-managed AI</p>
        <p className="mt-1 text-xs leading-5 text-slate-300">A no-key option is planned for eligible subscriptions, with a measured usage cap. Not available yet.</p>
        <button type="button" className="mt-2 text-xs font-medium text-cyan-200 underline underline-offset-4 hover:text-white"
          onClick={() => {
            if (window.casimirDesktop) openPanel("account-session");
            else window.location.assign("/account");
          }}>{window.casimirDesktop ? "Connect website account" : "View CasimirBot account"}</button></div>
    </section>}
    {controllerEnabled && <p className="mb-4 text-sm text-cyan-100">Connect a standard controller. D-pad or left stick moves between tiles; A opens a tile. Release controls first. Keyboard and mouse remain available.</p>}
    <div ref={grid} className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Environment tiles"
      onKeyDown={event => {
        if (!(event.target instanceof HTMLElement) || !event.target.hasAttribute("data-home-tile-primary")) return;
        const tiles = Array.from(grid.current?.querySelectorAll<HTMLButtonElement>("[data-home-tile-primary]") ?? []);
        const columns = Math.max(1, getComputedStyle(grid.current!).gridTemplateColumns.split(" ").filter(Boolean).length);
        const steps: Record<string, number | undefined> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns, ArrowUp: -columns };
        const offset = steps[event.key];
        if (!offset || !tiles.length) return;
        event.preventDefault(); tiles[(tiles.indexOf(event.target as HTMLButtonElement) + offset % tiles.length + tiles.length) % tiles.length]?.focus();
      }}>
      {!store && [
        { name: "Environment Store", text: "Browse reviewed packages", Icon: Store, open: () => { setStore(true); setSelected(null); setMinecraftPreview(false); } },
        { name: "Account", text: "Your identity and sessions", Icon: UserRound, open: () => openPanel("account-session") },
        { name: "Agent Access", text: "Connect and pair an AI task", Icon: Bot, open: () => openPanel("agent-access") },
        { name: "Connections, Billing & Security", text: "Review providers, billing, and device access", Icon: ShieldCheck, open: () => openPanel("connections-billing-security") },
        { name: "Local Harness", text: "Connections and device readiness", Icon: Monitor, open: () => openPanel("local-harness") },
        { name: "Star Watcher", text: "Explore the solar workbench", Icon: Sparkles, open: () => openPanel("star-watcher") },
        { name: "Civilization Bounds Roadmap", text: "Explore civilization boundaries", Icon: Globe2, open: () => openPanel("civilization-bounds-roadmap") },
      ].map(tile => <button data-home-tile-primary key={tile.name} onClick={tile.open} className="rounded-2xl border border-cyan-300/20 bg-gradient-to-br from-slate-800 to-slate-900 p-6 text-left transition hover:border-cyan-300/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300">
        <tile.Icon className="mb-6 h-8 w-8 text-cyan-200" aria-hidden="true" /><span className="block text-lg font-medium">{tile.name}</span><span className="mt-1 block text-sm text-slate-400">{tile.text}</span>
      </button>)}
      {!store && <article className="relative rounded-2xl border border-cyan-300/20 bg-gradient-to-br from-slate-800 to-slate-900 p-6">
        <div className="flex items-start justify-between gap-2"><Gamepad2 className="h-8 w-8 text-cyan-200" aria-hidden="true" />
          <button className={button} type="button" aria-label="Options for Minecraft Adapter" aria-haspopup="menu"
            aria-expanded={menu === MINECRAFT_MENU} aria-controls={menu === MINECRAFT_MENU ? menuId : undefined}
            onKeyDown={event => {
              if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
              event.preventDefault(); menuTrigger.current = event.currentTarget; menuFromEnd.current = event.key === "ArrowUp";
              setMenu(MINECRAFT_MENU);
            }}
            onClick={event => { menuTrigger.current = event.currentTarget; menuFromEnd.current = false;
              setMenu(menu === MINECRAFT_MENU ? null : MINECRAFT_MENU); }}><MoreHorizontal className="h-4 w-4" /></button></div>
        {menu === MINECRAFT_MENU && <div ref={menuPanel} id={menuId} role="menu" aria-label="Minecraft Adapter options"
          className="absolute right-5 top-16 z-10 rounded-lg border border-white/20 bg-slate-950 p-2 shadow-xl"
          onKeyDown={event => {
            if (event.key === "Escape" || event.key === "Tab") {
              if (event.key === "Escape") event.preventDefault();
              event.stopPropagation(); setMenu(null); menuTrigger.current?.focus(); return;
            }
            const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
            const index = items.indexOf(event.target as HTMLButtonElement);
            const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 :
              event.key === "ArrowDown" ? (index + 1) % items.length :
              event.key === "ArrowUp" ? (index - 1 + items.length) % items.length : null;
            if (next !== null) { event.preventDefault(); event.stopPropagation(); items[next]?.focus(); }
          }}>
          <button role="menuitem" tabIndex={-1} className="block p-2 text-sm hover:bg-white/10 focus-visible:outline focus-visible:outline-cyan-300"
            onClick={() => { minecraftTrigger.current = menuTrigger.current; setMinecraftPreview(true); setSelected(null); setMenu(null); }}>Inspect setup</button>
          <button role="menuitem" tabIndex={-1} className="block p-2 text-sm hover:bg-white/10 focus-visible:outline focus-visible:outline-cyan-300"
            onClick={() => { setMenu(null); openPanel("agent-access"); }}>Configure connection</button>
        </div>}
        <button data-home-tile-primary type="button" className="mt-5 text-left focus-visible:outline focus-visible:outline-cyan-300"
          onClick={event => { minecraftTrigger.current = event.currentTarget; setMinecraftPreview(true); setSelected(null); setMenu(null); }}>
          <span className="block text-lg font-medium">Minecraft Adapter</span>
          <span className="mt-1 block text-sm text-slate-400">Inspect saved local setup · no launch</span>
        </button>
        <p className="mt-3 text-xs text-slate-400">Developer-only session preview. No player authority.</p>
      </article>}
      {directory?.packages.map(record => <article key={record.package_version_id} className="relative rounded-2xl border border-white/15 bg-slate-900 p-5">
        <div className="flex items-start justify-between gap-2"><Package className="h-8 w-8 text-sky-200" aria-hidden="true" />
          <button className={button} aria-label={`Options for ${title(record)}`} aria-haspopup="menu" aria-expanded={menu === record.package_version_id}
            aria-controls={menu === record.package_version_id ? menuId : undefined}
            onKeyDown={event => {
              if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
              event.preventDefault(); menuTrigger.current = event.currentTarget; menuFromEnd.current = event.key === "ArrowUp";
              setMenu(record.package_version_id);
              if (menu === record.package_version_id) {
                const items = menuPanel.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
                items?.[menuFromEnd.current ? items.length - 1 : 0]?.focus();
              }
            }}
            onClick={event => { menuTrigger.current = event.currentTarget; menuFromEnd.current = false; setMenu(menu === record.package_version_id ? null : record.package_version_id); }}><MoreHorizontal className="h-4 w-4" /></button></div>
        {menu === record.package_version_id && <div ref={menuPanel} id={menuId} role="menu" aria-label={`${title(record)} options`} className="absolute right-5 top-16 z-10 rounded-lg border border-white/20 bg-slate-950 p-2 shadow-xl"
          onKeyDown={event => {
            if (event.key === "Escape" || event.key === "Tab") {
              if (event.key === "Escape") event.preventDefault();
              event.stopPropagation(); setMenu(null); menuTrigger.current?.focus(); return;
            }
            const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
            const index = items.indexOf(event.target as HTMLButtonElement);
            const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 :
              event.key === "ArrowDown" ? (index + 1) % items.length :
              event.key === "ArrowUp" ? (index - 1 + items.length) % items.length : null;
            if (next !== null) { event.preventDefault(); event.stopPropagation(); items[next]?.focus(); }
          }}>
          <button role="menuitem" tabIndex={-1} className="block p-2 text-sm hover:bg-white/10 focus-visible:outline focus-visible:outline-cyan-300" onClick={() => { detailsTrigger.current = menuTrigger.current; showDetails(record); }}>Package details</button>
          <button role="menuitem" tabIndex={-1} className="block p-2 text-sm hover:bg-white/10 focus-visible:outline focus-visible:outline-cyan-300" onClick={() => { detailsTrigger.current = menuTrigger.current; showDetails(record, true); }}>Configure connection</button>
        </div>}
        <button data-home-tile-primary onClick={event => { detailsTrigger.current = event.currentTarget; showDetails(record); }} className="mt-5 text-left focus-visible:outline focus-visible:outline-cyan-300"><span className="block text-lg font-medium">{title(record)}</span>
          <span className="text-xs text-slate-400">{record.installation_artifact.version}</span></button>
        <p className="mt-3 text-sm text-cyan-100">{stateLabel(record)}</p>
        <p className="mt-1 text-xs text-slate-400">No provider or subscription required.</p>
        <div className="mt-4 flex gap-2"><button className={button} disabled={!canInstall(record)} onClick={() => void install(record)}>
          {matchesEnvironmentHomeInstallation(record, installed) && installed?.status === "installed_stopped" ? "Verify / reinstall" : "Install reviewed package"}</button>
          <button className={button} disabled title="General program execution is unavailable in this private preview">Run</button></div>
      </article>)}
    </div>
    {!store && <p role="status" aria-live="polite" className="mt-5 text-sm text-slate-300">{busy ? "Checking your local packages…" : message}</p>}
    {!store && !(details && connection) && <div className="mt-6"><LocalPersonalConnectionSetup /></div>}
    {!store && minecraftPreview && <MinecraftHomeReadinessPreview
      onClose={() => { setMinecraftPreview(false); minecraftTrigger.current?.focus(); }}
      onOpenLocalHarness={() => openPanel("local-harness")}
      onOpenAgentAccess={() => openPanel("agent-access")} />}
    {store && directory?.packages.length === 0 && <p className="mt-6 text-slate-400">No packages are currently approved for this private catalog.</p>}
    {!window.casimirDesktop?.getPrivateEnvironmentState && <p className="mt-5 text-sm text-slate-400">Open the Windows desktop harness to inspect or install local packages.</p>}
    {clockBridge && <PrivateClockCheck bridge={clockBridge} admission={clockAdmission} onActivityChange={setClockActive} blocked={busy || removalBusy} />}
    <PrivateClockMcpPermission installationRef={clockAdmission?.installationRef ?? null} blocked={busy || removalBusy || clockActive} onOpenSetup={() => openPanel("device-check")} />
    {removalBridge && <PrivatePackageRemoval bridge={removalBridge} installationRef={installed?.installationRef} enabled={!busy && !clockActive}
      onBusyChange={setRemovalBusy} onRemoved={removed} />}
    {details && <section ref={detailsPanel} tabIndex={-1} aria-label={`${title(details)} details`} className="mt-6 rounded-2xl border border-white/15 bg-slate-900 p-5 focus-visible:outline focus-visible:outline-cyan-300">
      <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-medium">{connection ? "Configure connection" : title(details)}</h2>
        <button className={button} onClick={() => { setSelected(null); detailsTrigger.current?.focus(); }}>Close details</button></div>
      {connection ? <div className="mt-4 space-y-2 text-sm"><p>This package uses a local, deterministic interpreter. No API key or CasimirBot subscription is needed.</p>
        <p className="text-slate-400">Payer: no provider charges. Scope: this package only. Connection and grant require current inspection; general execution remains unavailable.</p>
        <p className="text-slate-400">Other provider connections and execution profiles are not available here yet.</p>
        <LocalPersonalConnectionSetup /></div>
        : <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">{[
          ["Package", details.package_id], ["Publisher", details.publisher_id], ["Connector version", details.package_version],
          ["Artifact version", details.installation_artifact.version], ["Artifact SHA-256", details.installation_artifact.archive_sha256],
          ["Metadata compatibility", details.host_compatibility.join(", ")], ["Private installer", "Windows · Node 24+"],
          ["Source and rights", "Private local evaluation. Public GitHub release unavailable."], ["Connection / grant", "Inspect Configure connection for current status"],
          ["Subject / active operation", clockActive ? "Clock process / check or cleanup" : "None / none"], ["Runtime evidence", "Private clock check results appear separately below the tiles"],
          ["Catalog approval ends", new Date(directory!.policy_expires_at).toLocaleString()],
        ].map(([label,value]) => <div key={label}><dt className="text-slate-400">{label}</dt><dd className="mt-1 break-all">{value}</dd></div>)}</dl>}</section>}
    <p className="mt-6 flex items-center gap-2 text-xs text-slate-500"><Clock3 className="h-3 w-3" aria-hidden="true" />Catalog status is separate from a running program or permission to control it.</p>
  </section>;
}
