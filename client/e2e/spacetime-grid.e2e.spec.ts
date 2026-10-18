import { test, expect, type Page } from "@playwright/test";
import path from "path";

const BASE_URL =
  process.env.PLAYWRIGHT_TEST_BASE_URL ??
  process.env.BASE_URL ??
  "http://localhost:5173";

const CORE_PATH = "/helix-core";
const DESKTOP_PATH = "/desktop";

const basePipeline = {
  currentMode: "hover",
  dutyCycle: 0.14,
  sectorStrobing: 1,
  qSpoilingFactor: 1,
  gammaGeo: 26,
  gammaVanDenBroeck: 1,
  qCavity: 1e9,
  modulationFreq_GHz: 15,
  N_tiles: 400,
  P_avg: 83.3,
  U_cycle: 1,
  M_exotic: 1,
  TS_ratio: 5.03e4,
  tileArea_cm2: 1,
  hull: { Lx_m: 12, Ly_m: 6, Lz_m: 4 },
  warpGeometryKind: "ellipsoid",
  sweep: { active: false, status: "idle", top: [], last: null, cancelRequested: false, cancelled: false },
};

const metricsSnapshot = {
  activeSectors: 1,
  totalSectors: 400,
  lightCrossing: { tauLC_ms: 10, dwell_ms: 20, burst_ms: 2, sectorCount: 400 },
  energyOutput: 1,
  overallStatus: "NOMINAL",
};

const wireHelixApi = async (
  page: Page,
  opts?: { uploadResponse?: { glbUrl: string; meshHash: string; updatedAt: number } },
) => {
  await page.route("**/api/**", async (route) => {
    const url = route.request().url();
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 200 });
      return;
    }
    if (url.includes("/api/helix/hull-preview/upload")) {
      const payload = opts?.uploadResponse ?? {
        glbUrl: "/luma/needle-ellipsoid.glb",
        meshHash: "mesh-upload",
        updatedAt: Date.now(),
      };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(payload),
      });
      return;
    }
    if (url.includes("/api/helix/pipeline/update")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(basePipeline),
      });
      return;
    }
    if (url.includes("/api/helix/pipeline")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(basePipeline),
      });
      return;
    }
    if (url.includes("/api/helix/metrics")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(metricsSnapshot),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
};

const enableSpacetimeGrid = async (page: Page) => {
  const label = page.getByText("Spacetime grid");
  await label.scrollIntoViewIfNeeded();
  const row = label.locator("..");
  const toggle = row.getByRole("checkbox", { name: "Enabled" });
  await toggle.check();
  await page.waitForFunction(() => (window as any).__spacetimeGridDbg?.enabled === true);
};

const waitForLatticeVolume = async (page: Page) =>
  page.waitForFunction(() => Boolean((window as any).__hullLatticeVolume), null, { timeout: 30_000 });

test.describe("Spacetime grid overlays", () => {
  test.use({ baseURL: BASE_URL, serviceWorkers: "block" });

  test("toggles spacetime grid with an active lattice volume", async ({ page }) => {
    await wireHelixApi(page);
    await page.goto(CORE_PATH, { waitUntil: "domcontentloaded" });

    const previewPayload = {
      version: "v1",
      glbUrl: "/luma/needle-ellipsoid.glb",
      meshHash: "mesh-e2e-grid",
      targetDims: { Lx_m: 2, Ly_m: 1, Lz_m: 1 },
      updatedAt: Date.now(),
      lodCoarse: {
        tag: "coarse",
        indexedGeometry: {
          positions: [
            0, 0, 0,
            2, 0, 0,
            0, 1, 0,
            0, 0, 1,
          ],
          indices: [0, 1, 2, 0, 2, 3],
        },
      },
      lods: [
        {
          tag: "coarse",
          indexedGeometry: {
            positions: [
              0, 0, 0,
              2, 0, 0,
              0, 1, 0,
              0, 0, 1,
            ],
            indices: [0, 1, 2, 0, 2, 3],
          },
        },
      ],
    };

    await page.evaluate((payload) => {
      localStorage.setItem("phoenixHullPreview", JSON.stringify(payload));
      window.dispatchEvent(new Event("phoenix-hull-preview"));
    }, previewPayload);

    await waitForLatticeVolume(page);
    await enableSpacetimeGrid(page);

    const latticeStillActive = await page.evaluate(() => Boolean((window as any).__hullLatticeVolume));
    expect(latticeStillActive).toBe(true);
  });

  test("GLB upload preview keeps grid visible alongside lattice volume", async ({ page }) => {
    const updatedAt = Date.now();
    await wireHelixApi(page, {
      uploadResponse: {
        glbUrl: "/luma/needle-ellipsoid.glb",
        meshHash: "mesh-uploaded-e2e",
        updatedAt,
      },
    });

    await page.goto(DESKTOP_PATH, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("open-helix-panel", { detail: { id: "nhm2-solve-state" } }));
    });
    await page.getByRole("tab", { name: "Live diagnostics" }).click();
    await page.locator("#nhm2-diagnostic-select").click();
    await page.getByRole("option", { name: "Model Silhouette editor" }).click();

    const glbPath = path.resolve(__dirname, "../public/luma/needle-ellipsoid.glb");
    const fileInput = page.locator("#glb-file");
    await fileInput.waitFor({ state: "visible" });
    await fileInput.setInputFiles(glbPath);

    await page.waitForFunction(
      ({ expectedAt, expectedUrl }) => {
        const raw = localStorage.getItem("phoenixHullPreview");
        if (!raw) return false;
        try {
          const parsed = JSON.parse(raw);
          return parsed.updatedAt === expectedAt && parsed.glbUrl === expectedUrl;
        } catch {
          return false;
        }
      },
      { expectedAt: updatedAt, expectedUrl: "/luma/needle-ellipsoid.glb" },
      { timeout: 30_000 },
    );

    await page.goto(CORE_PATH, { waitUntil: "domcontentloaded" });
    await waitForLatticeVolume(page);
    await enableSpacetimeGrid(page);

    const latticeStillActive = await page.evaluate(() => Boolean((window as any).__hullLatticeVolume));
    expect(latticeStillActive).toBe(true);
  });
});
