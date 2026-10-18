import { createRoot } from "react-dom/client";
import MarketLandingPage from "../src/pages/market-landing";
import AccountPortalPage from "../src/pages/account-portal";
import { SiteDownloadPage } from "./site-download";
import { SiteResetPasswordPage } from "./site-reset-password";
import { SiteConnectPage } from "./site-connect";
import "../src/index.css";

document.documentElement.dataset.casimirSiteBuildId = import.meta.env.VITE_BUILD_ID || "dev";

const pathname = window.location.pathname;
const page = pathname === "/account" || pathname === "/sign-in"
  ? <AccountPortalPage />
  : pathname === "/account/connect"
    ? <SiteConnectPage />
  : pathname === "/download"
    ? <SiteDownloadPage />
    : pathname === "/account/reset-password"
      ? <SiteResetPasswordPage />
      : <MarketLandingPage />;

createRoot(document.getElementById("root")!).render(page);
