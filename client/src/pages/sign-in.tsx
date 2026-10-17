import { useEffect } from "react";
import { useLocation } from "wouter";

export default function SignInPage() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    const nativeBridgePresent =
      typeof window.casimirDesktop?.getRuntimeSnapshot === "function";
    if (!nativeBridgePresent) {
      setLocation("/account", { replace: true });
      return;
    }
    try {
      window.localStorage.setItem("helix:pending-panel", "account-session");
    } catch {
      // ignore storage failures; the desktop still remains usable.
    }
    setLocation("/desktop", { replace: true });
  }, [setLocation]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10 text-slate-100">
      <div className="w-full max-w-md rounded-lg border border-white/10 bg-slate-900/80 p-6 text-sm text-slate-300">
        Opening account sign-in.
      </div>
    </div>
  );
}
