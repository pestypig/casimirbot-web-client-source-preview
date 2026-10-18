import { useEffect, useState } from "react";
import { ArrowLeft, Download, RefreshCw, ShieldCheck } from "lucide-react";
import { desktopReleaseStatusSchema, type DesktopReleaseStatus } from "@shared/desktop-release";

type ReleaseState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; status: DesktopReleaseStatus };

export function SiteDownloadPage() {
  const [state, setState] = useState<ReleaseState>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setState({ kind: "loading" });
    fetch("/api/desktop-release/latest", {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      cache: "no-store",
    }).then(async (response) => {
      if (!response.ok) throw new Error("Release service unavailable");
      return desktopReleaseStatusSchema.parse(await response.json());
    }).then((status) => {
      if (active) setState({ kind: "ready", status });
    }).catch(() => {
      if (active) setState({ kind: "error" });
    });
    return () => { active = false; };
  }, [attempt]);

  const release = state.kind === "ready" && state.status.available
    ? state.status.release : null;

  return (
    <main className="min-h-screen bg-[#050b18] px-5 py-6 text-slate-100 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <nav className="flex items-center justify-between gap-4 border-b border-white/10 pb-5">
          <a href="/" className="inline-flex items-center gap-2 text-sm text-slate-200 hover:text-white"><ArrowLeft className="h-4 w-4" /> Home</a>
          <a href="/account" className="text-sm text-cyan-200 hover:text-white">Account</a>
        </nav>
        <section className="py-16 sm:py-24">
          <span className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-sm text-cyan-100"><ShieldCheck className="h-4 w-4" /> Release availability</span>
          <h1 className="mt-7 text-4xl font-semibold tracking-tight sm:text-5xl">Install CasimirBot on your computer.</h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-300">The harness is the workspace. The website provides account access, release information, and hosted service coordination.</p>
          <div className="mt-10 max-w-2xl rounded-3xl border border-white/10 bg-white/[0.055] p-7">
            {state.kind === "loading" ? <p role="status">Checking for an approved signed installer…</p> : null}
            {state.kind === "error" ? (
              <div>
                <p role="alert" className="text-amber-200">Release status could not be checked. No download is offered until verification succeeds.</p>
                <button type="button" onClick={() => setAttempt((value) => value + 1)} className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/25 px-5 py-2 text-sm hover:border-cyan-200"><RefreshCw className="h-4 w-4" /> Try again</button>
              </div>
            ) : null}
            {state.kind === "ready" && !release ? (
              <div>
                <h2 className="text-xl font-semibold">No approved installer yet</h2>
                <p className="mt-3 leading-7 text-slate-300">Downloads open only after a signed release and its verification evidence are approved.</p>
              </div>
            ) : null}
            {release ? (
              <div>
                <h2 className="text-xl font-semibold">{release.version}</h2>
                <p className="mt-2 text-sm text-slate-300">Publisher: {release.publisher}</p>
                <p className="mt-1 break-all font-mono text-xs text-slate-400">SHA-256: {release.sha256}</p>
                <a href={release.downloadUrl} rel="noreferrer" className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-full bg-cyan-300 px-6 py-3 text-sm font-semibold text-slate-950 hover:bg-cyan-200"><Download className="h-4 w-4" /> Download {release.installerFileName}</a>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
