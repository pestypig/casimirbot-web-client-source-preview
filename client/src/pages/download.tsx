import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  ExternalLink,
  MonitorCog,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useLocation } from "wouter";
import {
  desktopReleaseStatusSchema,
  type DesktopReleaseStatus,
} from "@shared/desktop-release";
import type { RuntimeSurface } from "@shared/runtime-surface";
import { Button } from "@/components/ui/button";
import { useRuntimeSurface } from "@/lib/runtime/RuntimeSurfaceProvider";

const PENDING_PANEL_KEY = "helix:pending-panel";
const RELEASE_QUERY_KEY = ["/api/desktop-release/latest"] as const;

async function fetchDesktopReleaseStatus(): Promise<DesktopReleaseStatus> {
  const response = await fetch(RELEASE_QUERY_KEY[0], {
    headers: { Accept: "application/json" },
    credentials: "same-origin",
  });
  if (!response.ok) {
    throw new Error(`Desktop release status request failed (${response.status})`);
  }
  return desktopReleaseStatusSchema.parse(await response.json());
}

const compactHash = (value: string): string =>
  `${value.slice(0, 12)}…${value.slice(-12)}`;

export const shouldQueryDesktopRelease = (
  surface: RuntimeSurface,
  nativeBridgePresent: boolean,
): boolean => surface !== "desktop_native" && !nativeBridgePresent;

export type DownloadPageViewProps = Readonly<{
  surface: RuntimeSurface;
  status?: DesktopReleaseStatus;
  loading?: boolean;
  failed?: boolean;
  onBack: () => void;
  onOpenDesktopUpdates: () => void;
  onRetry: () => void;
}>;

export function DownloadPageView({
  surface,
  status,
  loading = false,
  failed = false,
  onBack,
  onOpenDesktopUpdates,
  onRetry,
}: DownloadPageViewProps) {
  const isNative = surface === "desktop_native";
  const release = status?.available === true ? status.release : null;

  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-950 px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.16),transparent_42%),radial-gradient(circle_at_bottom_right,rgba(99,102,241,0.14),transparent_48%)]" />
      <div className="relative mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-5xl flex-col">
        <nav className="flex items-center justify-between gap-4">
          <Button variant="ghost" className="text-slate-300 hover:text-white" onClick={onBack}>
            <ArrowLeft />
            Back to CasimirBot
          </Button>
          <div className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-cyan-200">
            {isNative ? "Desktop runtime" : surface === "pwa" ? "Installed web app" : "Web"}
          </div>
        </nav>

        <section className="grid flex-1 items-center gap-8 py-10 lg:grid-cols-[1.05fr_0.95fr] lg:py-16">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1.5 text-sm text-emerald-200">
              <ShieldCheck className="h-4 w-4" />
              Signed, version-pinned release channel
            </div>
            <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              CasimirBot on your device
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-slate-300 sm:text-lg">
              Use the same responsive workstation in a local native host, with secure loopback services,
              Device Check, and signed in-app updates.
            </p>
            <div className="mt-7 grid gap-3 text-sm text-slate-300 sm:grid-cols-2">
              {[
                "Per-launch loopback authentication",
                "Read-only Device Check by default",
                "Capability-driven installed UI",
                "Authenticode and Casimir-gated updates",
              ].map((label) => (
                <div key={label} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.055] p-5 shadow-2xl shadow-cyan-950/30 backdrop-blur sm:p-7">
            {isNative ? (
              <div data-testid="native-update-card">
                <MonitorCog className="h-10 w-10 text-cyan-300" />
                <h2 className="mt-5 text-2xl font-semibold text-white">CasimirBot Desktop is installed</h2>
                <p className="mt-3 leading-6 text-slate-300">
                  Installer downloads are disabled inside the native app. Use Desktop Updates to check,
                  download, and install a publisher-verified update.
                </p>
                <Button className="mt-6 w-full" size="lg" onClick={onOpenDesktopUpdates}>
                  Open Desktop Updates
                </Button>
              </div>
            ) : loading ? (
              <div className="flex min-h-64 flex-col items-center justify-center text-center" role="status">
                <RefreshCw className="h-8 w-8 animate-spin text-cyan-300" />
                <p className="mt-4 font-medium text-white">Verifying the release channel…</p>
                <p className="mt-2 text-sm text-slate-400">No download is shown until metadata validates.</p>
              </div>
            ) : failed ? (
              <div className="min-h-64" role="alert">
                <ShieldCheck className="h-10 w-10 text-amber-300" />
                <h2 className="mt-5 text-2xl font-semibold text-white">Release verification unavailable</h2>
                <p className="mt-3 leading-6 text-slate-300">
                  The release service could not be verified, so CasimirBot is not presenting an installer.
                </p>
                <Button className="mt-6" variant="outline" onClick={onRetry}>
                  <RefreshCw />
                  Retry verification
                </Button>
              </div>
            ) : release ? (
              <div data-testid="approved-release-card">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-cyan-200">Approved Windows release</p>
                    <h2 className="mt-1 text-2xl font-semibold text-white">Version {release.version}</h2>
                  </div>
                  <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-200">
                    x64 · PASS
                  </span>
                </div>
                <dl className="mt-6 space-y-4 rounded-2xl border border-white/10 bg-slate-950/45 p-4 text-sm">
                  <div>
                    <dt className="text-slate-400">Signed publisher</dt>
                    <dd className="mt-1 font-medium text-slate-100">{release.publisher}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">Installer SHA-256</dt>
                    <dd className="mt-1 font-mono text-xs text-slate-200" title={release.sha256}>
                      {compactHash(release.sha256)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">Casimir certificate</dt>
                    <dd className="mt-1 font-mono text-xs text-slate-200" title={release.casimirGate.certificateHash}>
                      {compactHash(release.casimirGate.certificateHash)} · integrity OK
                    </dd>
                  </div>
                </dl>
                <Button asChild className="mt-6 w-full" size="lg">
                  <a href={release.downloadUrl} rel="noreferrer">
                    <Download />
                    Download {release.installerFileName}
                    <ExternalLink />
                  </a>
                </Button>
                <p className="mt-3 text-center text-xs leading-5 text-slate-400">
                  This versioned installer is the approved download. Before installation, confirm Windows
                  shows the publisher listed above.
                </p>
              </div>
            ) : (
              <div className="min-h-64" data-testid="release-unavailable-card">
                <ShieldCheck className="h-10 w-10 text-slate-400" />
                <h2 className="mt-5 text-2xl font-semibold text-white">No approved installer yet</h2>
                <p className="mt-3 leading-6 text-slate-300">
                  Downloads stay closed until a signed release and its verification evidence are explicitly approved.
                </p>
                <Button asChild className="mt-6" variant="outline">
                  <a href="/account">Set up your account</a>
                </Button>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

export default function DownloadPage() {
  const [, setLocation] = useLocation();
  const { surface, nativeHandshake } = useRuntimeSurface();
  const nativeBridgePresent =
    typeof window !== "undefined" &&
    typeof window.casimirDesktop?.getRuntimeSnapshot === "function";
  const waitingForNativeHandshake =
    nativeBridgePresent &&
    surface !== "desktop_native" &&
    nativeHandshake !== "rejected";
  const statusQuery = useQuery({
    queryKey: RELEASE_QUERY_KEY,
    queryFn: fetchDesktopReleaseStatus,
    enabled: shouldQueryDesktopRelease(surface, nativeBridgePresent),
    staleTime: 60_000,
    retry: false,
  });

  const openDesktopUpdates = () => {
    try {
      window.localStorage.setItem(PENDING_PANEL_KEY, "desktop-updates");
    } catch {
      // The workstation remains reachable even when storage is unavailable.
    }
    setLocation("/desktop");
  };

  return (
    <DownloadPageView
      surface={surface}
      status={statusQuery.data}
      loading={waitingForNativeHandshake || statusQuery.isLoading}
      failed={nativeHandshake === "rejected" || statusQuery.isError}
      onBack={() => setLocation("/")}
      onOpenDesktopUpdates={openDesktopUpdates}
      onRetry={() => void statusQuery.refetch()}
    />
  );
}
