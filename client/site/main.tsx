import { createRoot } from "react-dom/client";
import MarketLandingPage from "../src/pages/market-landing";
import AccountPortalPage from "../src/pages/account-portal";
import { SiteDeviceRegisterPage } from "./site-device-register";
import { SiteP1ApprovePage } from "./site-p1-approve";
import { SiteDownloadPage } from "./site-download";
import { SiteResetPasswordPage } from "./site-reset-password";
import { SiteConnectPage } from "./site-connect";
import { SiteRoomPresencePage } from "./site-room-presence";
import GettingStartedPage from "../src/pages/getting-started";
import "../src/index.css";

document.documentElement.dataset.casimirSiteBuildId = import.meta.env.VITE_BUILD_ID || "dev";

const pathname = window.location.pathname;
const page = pathname === "/account" || pathname === "/sign-in"
  ? <AccountPortalPage />
  : pathname === "/account/connect"
    ? <SiteConnectPage />
  : pathname === "/account/device-register"
    ? <SiteDeviceRegisterPage />
  : pathname === "/account/p1-approve"
    ? <SiteP1ApprovePage />
  : pathname === "/download"
    ? <SiteDownloadPage />
    : pathname === "/desktop"
      ? <SiteRoomPresencePage />
    : pathname === "/getting-started"
      ? <GettingStartedPage />
    : pathname === "/account/reset-password"
      ? <SiteResetPasswordPage />
      : <MarketLandingPage />;

createRoot(document.getElementById("root")!).render(page);
