import { useCallback, useEffect, useId, useState, type FormEvent } from "react";
import { Check, LoaderCircle, MoreHorizontal, RefreshCw, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CIVILIZATION_GEOSPATIAL_CONFIG_CHANGED_EVENT,
  clearCivilizationMapsBrowserKey,
  loadCivilizationMapsBrowserKey,
  saveCivilizationMapsBrowserKey,
  type CivilizationMapsKeyState,
} from "./civilizationGeospatialClientConfig";

type ProviderStatus = {
  mapsTiles: { browserKeyConfigured: boolean };
  routes: { serverKeyConfigured: boolean };
  earthEngine: {
    projectConfigured: boolean;
    credentialsConfigured: boolean;
  };
  dataAdapters?: {
    naturalSources: Array<{
      sourceId: string;
      label: string;
      providerOffersLiveData: boolean;
      plannedOperations: string[];
      normalizedOperations: string[];
      liveFetchOperations: string[];
      runtimeAccess: "not_checked";
    }>;
    osmInfrastructure: { liveFetchImplemented: boolean; runtimeAccess: "not_checked" };
    geoboundariesAdm0: { liveFetchImplemented: boolean; runtimeAccess: "not_checked" };
    naturalEarthBoundaryLines: { liveFetchImplemented: boolean; runtimeAccess: "not_checked" };
    naturalEarthHydrography: { pinnedSnapshotBundled: boolean; runtimeAccess: "local_asset" };
    mappedNetworkRoutes: { implemented: boolean; runtimeAccess: "not_checked" };
    googleRoutes: { implemented: boolean; runtimeAccess: "not_checked" };
    diplomaticCorridorPacket: { implemented: boolean; runtimeAccess: "not_checked" };
    proposedCorridorScreen: { implemented: boolean; runtimeAccess: "not_checked" };
  };
};

type RoutesDesktopBridge = {
  getCivilizationRoutesKeyState?: () => Promise<unknown>;
  saveCivilizationRoutesKey?: (key: string) => Promise<unknown>;
  clearCivilizationRoutesKey?: () => Promise<unknown>;
};

async function readProviderStatus(signal?: AbortSignal): Promise<ProviderStatus> {
  const response = await fetch("/api/civilization/geospatial/status", {
    credentials: "same-origin",
    cache: "no-store",
    signal,
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error("provider_status_unavailable");
  return (await response.json()) as ProviderStatus;
}

function Status({ ready, label }: { ready: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] ${
        ready
          ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-100"
          : "border-amber-300/25 bg-amber-300/5 text-amber-100"
      }`}
    >
      {ready ? <Check className="h-3 w-3" aria-hidden="true" /> : <X className="h-3 w-3" aria-hidden="true" />}
      {label}
    </span>
  );
}

function ProviderRow({
  title,
  purpose,
  setup,
  ready,
  statusLabel,
}: {
  title: string;
  purpose: string;
  setup: string;
  ready: boolean;
  statusLabel: string;
}) {
  return (
    <section className="rounded-lg border border-white/10 bg-black/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-white">{title}</h3>
        <Status ready={ready} label={statusLabel} />
      </div>
      <p className="mt-1 text-xs leading-5 text-slate-300">{purpose}</p>
      <p className="mt-2 font-mono text-[10px] leading-4 text-slate-500">{setup}</p>
    </section>
  );
}

export function CivilizationGeospatialSettings() {
  const nativeRoutes = (window as Window & { casimirDesktop?: RoutesDesktopBridge }).casimirDesktop;
  const mapsKeyInputId = useId();
  const routesKeyInputId = useId();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mapsKeyDraft, setMapsKeyDraft] = useState("");
  const [mapsKeySaved, setMapsKeySaved] = useState(false);
  const [mapsKeyState, setMapsKeyState] = useState<CivilizationMapsKeyState>({ key: null, source: "none" });
  const [mapsKeyBusy, setMapsKeyBusy] = useState(false);
  const [mapsKeyMessage, setMapsKeyMessage] = useState("");
  const [routesKeyDraft, setRoutesKeyDraft] = useState("");
  const [routesKeyState, setRoutesKeyState] = useState<{ configured: boolean; source: string } | null>(null);
  const [routesKeyMessage, setRoutesKeyMessage] = useState("");
  const [routesKeyBusy, setRoutesKeyBusy] = useState(false);

  const refreshSavedKeyState = useCallback(async () => {
    try {
      const state = await loadCivilizationMapsBrowserKey();
      setMapsKeyState(state);
      setMapsKeySaved(state.source === "desktop-profile" || state.source === "browser-origin");
      setMapsKeyMessage(state.migrationFailed
        ? "This key still uses browser storage. Protected desktop storage is unavailable; it may need to be saved again after an address change."
        : "");
    } catch {
      setMapsKeySaved(false);
      setMapsKeyState({ key: null, source: "none" });
      setMapsKeyMessage("Could not read the saved Maps key. Check that you are signed in as a developer in the desktop EXE.");
    }
  }, []);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      setStatus(await readProviderStatus(signal));
    } catch {
      if (!signal?.aborted) setError("Could not read application configuration.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void refreshSavedKeyState();
    void refresh(controller.signal);
    const inspect = nativeRoutes?.getCivilizationRoutesKeyState;
    if (inspect) void inspect().then((result: unknown) => {
      if (controller.signal.aborted) return;
      const value = result as { ok?: boolean; state?: { configured?: boolean; source?: string } };
      if (value?.ok && value.state) setRoutesKeyState({
        configured: value.state.configured === true,
        source: typeof value.state.source === "string" ? value.state.source : "none",
      });
      else setRoutesKeyMessage("Protected Routes key storage is unavailable.");
    }).catch(() => { if (!controller.signal.aborted) setRoutesKeyMessage("Could not inspect protected Routes key storage."); });
    return () => controller.abort();
  }, [open, refresh, refreshSavedKeyState, nativeRoutes]);

  const saveRoutesKey = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const key = routesKeyDraft.trim();
    if (!/^AIza[0-9A-Za-z_-]{20,}$/u.test(key)) {
      setRoutesKeyMessage("That does not look like a Google API key. Check the value and try again.");
      return;
    }
    const save = nativeRoutes?.saveCivilizationRoutesKey;
    if (!save) { setRoutesKeyMessage("Protected Routes key storage is available in the desktop EXE only."); return; }
    setRoutesKeyBusy(true);
    setRoutesKeyMessage("");
    try {
      const result = await save(key) as { ok?: boolean; active?: boolean; code?: string; state?: { configured?: boolean; source?: string } };
      if (!result?.ok) throw new Error(result?.code ?? "storage_unavailable");
      setRoutesKeyDraft("");
      setRoutesKeyState({ configured: result.state?.configured === true, source: result.state?.source ?? "saved" });
      setRoutesKeyMessage(result.active
        ? "Routes key saved in protected storage and activated in the local service. It was not placed in browser storage."
        : "Routes key saved in protected storage, but the local service did not activate it. Restart this EXE before using Google Routes.");
      void refresh();
    } catch {
      setRoutesKeyMessage("The Routes key could not be saved. Check that you are signed in as a developer in the desktop EXE.");
    } finally { setRoutesKeyBusy(false); }
  };

  const clearRoutesKey = async () => {
    const clear = nativeRoutes?.clearCivilizationRoutesKey;
    if (!clear) return;
    setRoutesKeyBusy(true);
    try {
      const result = await clear() as { ok?: boolean; active?: boolean; state?: { configured?: boolean; source?: string } };
      if (!result?.ok) throw new Error("storage_unavailable");
      setRoutesKeyDraft("");
      setRoutesKeyState({ configured: false, source: result.state?.source ?? "none" });
      setRoutesKeyMessage(result.active
        ? "Routes key cleared from protected storage and the local service."
        : "Routes key cleared from protected storage. Restart this EXE to clear it from the current service.");
      void refresh();
    } catch {
      setRoutesKeyMessage("The Routes key could not be cleared.");
    } finally { setRoutesKeyBusy(false); }
  };

  const saveMapsKey = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const key = mapsKeyDraft.trim();
    if (!/^AIza[0-9A-Za-z_-]{20,}$/u.test(key)) {
      setMapsKeyMessage("That does not look like a Google Maps API key. Check the value and try again.");
      return;
    }

    setMapsKeyBusy(true);
    try {
      const saved = await saveCivilizationMapsBrowserKey(key);
      setMapsKeyDraft("");
      setMapsKeySaved(true);
      setMapsKeyState(saved);
      setMapsKeyMessage(saved.source === "desktop-profile"
        ? "Browser key saved in this desktop profile across EXE restarts and rebuilds. It was not sent to the app server."
        : "Browser key saved in this browser. It was not sent to the app server.");
      window.dispatchEvent(new Event(CIVILIZATION_GEOSPATIAL_CONFIG_CHANGED_EVENT));
    } catch {
      setMapsKeyMessage("The browser key could not be saved. Check desktop developer sign-in or browser storage.");
    } finally { setMapsKeyBusy(false); }
  };

  const forgetMapsKey = async () => {
    setMapsKeyBusy(true);
    try {
      await clearCivilizationMapsBrowserKey();
      setMapsKeySaved(false);
      setMapsKeyState({ key: null, source: "none" });
      setMapsKeyDraft("");
      setMapsKeyMessage("Browser key removed from this device.");
      window.dispatchEvent(new Event(CIVILIZATION_GEOSPATIAL_CONFIG_CHANGED_EVENT));
    } catch {
      setMapsKeyMessage("The saved browser key could not be cleared.");
    } finally { setMapsKeyBusy(false); }
  };

  const mapsReady = Boolean(mapsKeyState.key) || Boolean(status?.mapsTiles.browserKeyConfigured);
  const routesReady = Boolean(status?.routes.serverKeyConfigured);
  const earthEngineReady = Boolean(
    status?.earthEngine.projectConfigured && status.earthEngine.credentialsConfigured,
  );

  return (
    <>
      <button
        type="button"
        aria-label="Civilization map data settings"
        title="Map and geospatial API settings"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="absolute left-3 top-3 z-20 grid h-9 w-9 place-items-center rounded-md border border-white/15 bg-black/80 text-slate-200 shadow-lg backdrop-blur hover:border-white/30 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto border-white/10 bg-[#07120f] text-slate-100 sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Geospatial data connections</DialogTitle>
            <DialogDescription className="text-slate-400">
              Review this panel’s real-world data connections for map imagery, route evidence, and geographic field layers.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 rounded-lg border border-sky-300/20 bg-sky-300/5 p-3">
              <p className="text-xs leading-5 text-sky-100/90">
                Status checks configuration; it does not test live API access, billing, or Earth Engine registration. Server credentials stay server-side. The Maps browser key is public by design and must be restricted in Google Cloud. The desktop EXE saves it in the retained local profile; a web browser uses that browser’s storage.
              </p>
              <button
                type="button"
                onClick={() => void refresh()}
                disabled={loading}
                aria-label="Refresh geospatial provider status"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-white/15 text-slate-200 hover:bg-white/10 disabled:opacity-50"
              >
                {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </button>
            </div>

            {error ? <p role="status" className="text-xs text-rose-200">{error}</p> : null}

            <ProviderRow
              title="Google Maps Map Tiles"
              purpose="Candidate basemap and imagery source for the civilization atlas. Browser keys must be restricted to our application origins and required Maps APIs."
              setup="VITE_GOOGLE_MAPS_BROWSER_API_KEY"
              ready={mapsReady}
              statusLabel={mapsReady ? "Application key configured" : "Application key missing"}
            />
            <form onSubmit={(event) => void saveMapsKey(event)} className="space-y-2 rounded-lg border border-white/10 bg-black/20 p-3">
              <label htmlFor={mapsKeyInputId} className="block text-xs font-medium text-slate-200">
                {mapsKeySaved ? "Replace saved browser key" : "Save browser key on this device"}
              </label>
              <input
                id={mapsKeyInputId}
                type="password"
                autoComplete="off"
                spellCheck={false}
                maxLength={256}
                value={mapsKeyDraft}
                onChange={(event) => setMapsKeyDraft(event.target.value)}
                placeholder="Paste the restricted Maps browser key"
                className="w-full rounded-md border border-white/15 bg-[#030907] px-3 py-2 font-mono text-xs text-white outline-none focus:border-emerald-300"
              />
              <p className="text-[11px] leading-4 text-slate-400">
                This browser key is used by the map client. The desktop EXE keeps it in its local profile across rebuilds; a web browser keeps it in browser storage. It is not sent to the app server or shown again.
              </p>
              {mapsKeyMessage ? <p role="status" className="text-[11px] text-emerald-100">{mapsKeyMessage}</p> : null}
              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={!mapsKeyDraft.trim() || mapsKeyBusy}
                  className="rounded-md bg-emerald-300 px-3 py-2 text-xs font-semibold text-emerald-950 disabled:opacity-40"
                >
                  Save key
                </button>
                <button
                  type="button"
                  onClick={() => void forgetMapsKey()}
                  disabled={!mapsKeySaved || mapsKeyBusy}
                  className="rounded-md border border-white/15 px-3 py-2 text-xs text-slate-200 disabled:opacity-40"
                >
                  Forget saved key
                </button>
              </div>
            </form>
            <ProviderRow
              title="Google Maps Routes API"
              purpose="Optional route evidence for a selected Google-supported travel mode, displayed on the Google map. Its reader is implemented, but the dedicated server key still needs to be connected. It does not define the general infrastructure graph."
              setup="GOOGLE_MAPS_ROUTES_API_KEY"
              ready={routesReady}
              statusLabel={routesReady ? "Server key configured" : "Server key missing"}
            />
            {nativeRoutes?.saveCivilizationRoutesKey && <form onSubmit={(event) => void saveRoutesKey(event)} className="space-y-2 rounded-lg border border-cyan-300/20 bg-black/20 p-3">
              <label htmlFor={routesKeyInputId} className="block text-xs font-medium text-slate-200">
                {routesKeyState?.configured ? "Replace protected Routes key" : "Save Routes key on this device"}
              </label>
              <input
                id={routesKeyInputId}
                type="password"
                autoComplete="off"
                spellCheck={false}
                maxLength={256}
                value={routesKeyDraft}
                onChange={(event) => setRoutesKeyDraft(event.target.value)}
                placeholder="Paste the dedicated Routes-only key"
                className="w-full rounded-md border border-white/20 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-slate-500"
              />
              <p className="text-xs leading-5 text-slate-400">The EXE encrypts this key for the current Windows user and sends it only to its local service. Use the dedicated Routes-only key, never the Maps browser key.</p>
              <div className="flex flex-wrap gap-2">
                <button type="submit" disabled={routesKeyBusy || !routesKeyDraft.trim()} className="rounded-md border border-cyan-300/40 px-3 py-2 text-xs text-cyan-100 disabled:opacity-40">
                  {routesKeyBusy ? "Saving…" : "Save Routes key"}
                </button>
                <button type="button" onClick={() => void clearRoutesKey()} disabled={routesKeyBusy || !routesKeyState?.configured} className="rounded-md border border-white/15 px-3 py-2 text-xs text-slate-200 disabled:opacity-40">
                  Clear saved key
                </button>
              </div>
              {routesKeyMessage && <p role="status" className="text-xs text-cyan-100">{routesKeyMessage}</p>}
            </form>}
            <ProviderRow
              title="Google Earth Engine"
              purpose="Candidate source for geospatial datasets and computed field layers, subject to dataset-specific terms and Earth Engine project access. It is separate from the panel’s route/pathfinding logic."
              setup="EARTH_ENGINE_PROJECT_ID + Google application credentials"
              ready={earthEngineReady}
              statusLabel={earthEngineReady ? "Project and explicit credentials configured" : "Project or explicit credentials missing"}
            />

            {status?.dataAdapters && <section className="rounded-lg border border-white/10 bg-black/20 p-3">
              <h3 className="text-sm font-medium text-white">Evidence adapter capabilities</h3>
              <p className="mt-1 text-xs leading-5 text-slate-400">These describe implemented code paths. Live source access has not been checked by this status request.</p>
              <ul className="mt-2 space-y-1 text-xs text-slate-300">
                {status.dataAdapters.naturalSources.map((source) => <li key={source.sourceId}>
                  <span className="font-medium text-slate-100">{source.label}:</span> {source.liveFetchOperations.length > 0
                    ? `live fetch path for ${source.liveFetchOperations.join(", ")}`
                    : "planning and normalization only"}
                </li>)}
                <li>OpenStreetMap infrastructure: bounded live fetch path; access not checked.</li>
                <li>geoBoundaries ADM0: bounded live fetch path; access not checked.</li>
                <li>Natural Earth claim and reference lines: pinned source fetch path; access not checked.</li>
                <li>Natural Earth rivers and lake centerlines: versioned public-domain snapshot bundled locally; live update not implied.</li>
                <li>Mapped-network alignment: bounded graph path over OpenStreetMap evidence; access not checked.</li>
                <li>Google Routes: bounded supported-travel-mode reader; dedicated server key and live access not checked.</li>
                <li>Diplomatic corridor packet: read-only source ledger and route comparison path; live provider access not checked.</li>
                <li>Proposed corridor screen: compares a user sketch with boundary and waterway depictions; no route finding or construction claim.</li>
              </ul>
            </section>}

            <a
              href="https://console.cloud.google.com/google/maps-apis/api-list"
              target="_blank"
              rel="noreferrer"
              className="inline-flex rounded-md border border-white/15 px-3 py-2 text-xs text-slate-200 hover:bg-white/10"
            >
              Open Google Maps Platform API settings
            </a>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
