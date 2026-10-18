import { lazy, Suspense, useEffect } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import LumaBackgroundPortal from "@/components/LumaBackgroundPortal";
import { BackgroundLuma } from "@/components/BackgroundLuma";
import { LumaOverlayHost } from "@/components/LumaOverlayHost";
import { useQiStream } from "@/hooks/useQiStream";
import { LumaWhispersProvider } from "@/lib/luma-whispers";
import { useIsMobileViewport } from "@/hooks/useIsMobileViewport";
import RouteBootSplash from "@/components/RouteBootSplash";
import { buildWorkstationShellHandoff } from "@/lib/workstation/workstationEntryRoute";
import { RuntimeSurfaceProvider } from "@/lib/runtime/RuntimeSurfaceProvider";

const Simulation = lazy(() => import("@/pages/simulation"));
const AgentAccessPage = lazy(() => import("@/pages/agent-access"));
const NoiseGenAlias = lazy(() => import("@/pages/noisegen"));
const Why = lazy(() => import("@/pages/why"));
const StartPortal = lazy(() => import("@/pages/start"));
const MarketLandingPage = lazy(() => import("@/pages/market-landing"));
const AccountPortalPage = lazy(() => import("@/pages/account-portal"));
const DownloadPage = lazy(() => import("@/pages/download"));
const StationPage = lazy(() => import("@/pages/station"));
const NotFound = lazy(() => import("@/pages/not-found"));
const LumaPage = lazy(() => import("@/pages/luma"));
const HelixObservablesPage = lazy(() => import("@/pages/helix-observables"));
const IngestPage = lazy(() => import("@/pages/ingest"));
const RagAdminPage = lazy(() => import("@/pages/rag-admin"));
const CodeAdminPage = lazy(() => import("@/pages/code-admin"));
const DesktopPage = lazy(() => import("@/pages/desktop"));
const SignInPage = lazy(() => import("@/pages/sign-in"));
const AccountResetPasswordPage = lazy(() => import("@/pages/account-reset-password"));
const StarHydrostaticPanel = lazy(() => import("@/pages/star-hydrostatic-panel"));
const IdeologyRenderPage = lazy(() => import("@/pages/ideology-render"));
const EssenceRenderPage = lazy(() => import("@/pages/essence-render"));
const AgiRefineryDashboard = lazy(() => import("@/pages/agi-refinery"));

const hasDesktopOverride = () => {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("desktop") === "1";
  } catch {
    return false;
  }
};

const hasMobileOverride = () => {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("mobile") === "1";
  } catch {
    return false;
  }
};

const buildCurrentWorkstationHandoff = (
  targetPath: "/desktop" | "/mobile",
) => {
  if (typeof window === "undefined") return targetPath;
  return buildWorkstationShellHandoff(targetPath, window.location);
};

function AdaptiveWorkstationRoute() {
  const [, setLocation] = useLocation();
  const { isMobile, isReady } = useIsMobileViewport();
  const desktopOverride = hasDesktopOverride();
  const mobileOverride = hasMobileOverride();

  useEffect(() => {
    if (mobileOverride) {
      setLocation(buildCurrentWorkstationHandoff("/mobile"), { replace: true });
      return;
    }

    if (desktopOverride) {
      setLocation(buildCurrentWorkstationHandoff("/desktop"), { replace: true });
      return;
    }

    if (!isReady) return;

    if (isMobile) {
      setLocation(buildCurrentWorkstationHandoff("/mobile"), { replace: true });
      return;
    }

    setLocation(buildCurrentWorkstationHandoff("/desktop"), { replace: true });
  }, [desktopOverride, isMobile, isReady, mobileOverride, setLocation]);

  return (
    <RouteBootSplash
      message="Preparing your Helix workspace..."
      detail="Selecting desktop or mobile mode"
    />
  );
}

function PublicEntryRoute() {
  const nativeBridgePresent =
    typeof window !== "undefined" &&
    typeof window.casimirDesktop?.getRuntimeSnapshot === "function";

  if (nativeBridgePresent || hasDesktopOverride() || hasMobileOverride()) {
    return <AdaptiveWorkstationRoute />;
  }

  return <MarketLandingPage />;
}

function StartRoute() {
  const [, setLocation] = useLocation();
  const { isMobile, isReady } = useIsMobileViewport();
  const desktopOverride = hasDesktopOverride();
  const mobileOverride = hasMobileOverride();

  useEffect(() => {
    if (mobileOverride) {
      setLocation(buildCurrentWorkstationHandoff("/mobile"), { replace: true });
      return;
    }

    if (desktopOverride) return;

    if (!isReady) return;
    if (isMobile) {
      setLocation(buildCurrentWorkstationHandoff("/mobile"), { replace: true });
    }
  }, [desktopOverride, isMobile, isReady, mobileOverride, setLocation]);

  if (mobileOverride || (!desktopOverride && (!isReady || isMobile))) {
    return (
      <RouteBootSplash
        message="Preparing your Helix workspace..."
        detail="Routing to mobile workstation"
      />
    );
  }

  return <StartPortal />;
}

function HelixCoreRoute() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    const search = typeof window !== "undefined" ? window.location.search ?? "" : "";
    const hash = typeof window !== "undefined" ? window.location.hash ?? "" : "";
    setLocation(`/desktop${search}${hash}`, { replace: true });
  }, [setLocation]);

  return (
    <RouteBootSplash
      message="Opening desktop..."
      detail="Applying Helix route handoff"
    />
  );
}

function PotatoThresholdLegacyRoute() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    setLocation("/desktop?panels=theory-badge-graph&focus=theory-badge-graph", { replace: true });
  }, [setLocation]);

  return (
    <RouteBootSplash
      message="Opening Theory Badge Graph..."
      detail="Showing the curvature proxy and claim boundaries"
    />
  );
}

function BridgeLegacyRoute() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    setLocation("/desktop?panels=theory-badge-graph&focus=theory-badge-graph", { replace: true });
  }, [setLocation]);

  return (
    <RouteBootSplash
      message="Opening Theory Badge Graph..."
      detail="Showing Casimir and NHM2 claim boundaries"
    />
  );
}

function DocumentationLegacyRoute() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    setLocation("/desktop?panels=docs-viewer&focus=docs-viewer", { replace: true });
  }, [setLocation]);

  return (
    <RouteBootSplash
      message="Opening Docs & Papers..."
      detail="Showing the workstation document viewer"
    />
  );
}

function DesktopRoute() {
  return (
    <LumaWhispersProvider>
      <DesktopPage />
    </LumaWhispersProvider>
  );
}

function MobileRoute() {
  return (
    <LumaWhispersProvider>
      <DesktopPage layoutVariant="mobile" />
    </LumaWhispersProvider>
  );
}

function Router() {
  return (
    <Suspense
      fallback={
        <RouteBootSplash
          message="Loading Helix..."
          detail="Preparing the requested workspace"
        />
      }
    >
      <Switch>
        <Route path="/" component={PublicEntryRoute} />
        <Route path="/open" component={AdaptiveWorkstationRoute} />
        <Route path="/start" component={StartRoute} />
        <Route path="/download" component={DownloadPage} />
        <Route path="/account" component={AccountPortalPage} />
        <Route path="/mobile" component={MobileRoute} />
        <Route path="/bridge" component={BridgeLegacyRoute} />
        <Route path="/simulation" component={Simulation} />
        <Route path="/documentation" component={DocumentationLegacyRoute} />
        <Route path="/agent-access" component={AgentAccessPage} />
        <Route path="/helix-core" component={HelixCoreRoute} />
        <Route path="/helix-observables" component={HelixObservablesPage} />
        <Route path="/helix/noise-gens" component={NoiseGenAlias} />
        <Route path="/helix-noise-gens" component={NoiseGenAlias} />
        <Route path="/noisegen" component={NoiseGenAlias} />
        <Route path="/potato-threshold-lab" component={PotatoThresholdLegacyRoute} />
        <Route path="/luma" component={LumaPage} />
        <Route path="/rag/ingest" component={IngestPage} />
        <Route path="/rag/admin" component={RagAdminPage} />
        <Route path="/code-admin" component={CodeAdminPage} />
        <Route path="/desktop" component={DesktopRoute} />
        <Route path="/sign-in" component={SignInPage} />
        <Route path="/account/reset-password" component={AccountResetPasswordPage} />
        <Route path="/ideology-render" component={IdeologyRenderPage} />
        <Route path="/essence-render" component={EssenceRenderPage} />
        <Route path="/agi-refinery" component={AgiRefineryDashboard} />
        <Route path="/why" component={Why} />
        <Route path="/star-hydrostatic" component={StarHydrostaticPanel} />
        <Route path="/station/:role" component={StationPage} />
        <Route path="/optimist-station" component={StationPage} />
        <Route path="/engineer-station" component={StationPage} />
        <Route path="/diplomat-station" component={StationPage} />
        <Route path="/strategist-station" component={StationPage} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  useQiStream(true, { hz: 10 });
  return (
    <RuntimeSurfaceProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          {/* Background behind everything, once */}
          <LumaBackgroundPortal>
            <BackgroundLuma opacity={0.12} blurPx={8} />
          </LumaBackgroundPortal>

          {/* Your entire app (router, pages, etc.) */}
          <div className="relative z-10 min-h-screen">
            <Toaster />
            <Router />
          </div>

          {/* Whispers host once, on top */}
          <LumaOverlayHost />
        </TooltipProvider>
      </QueryClientProvider>
    </RuntimeSurfaceProvider>
  );
}

export default App;
