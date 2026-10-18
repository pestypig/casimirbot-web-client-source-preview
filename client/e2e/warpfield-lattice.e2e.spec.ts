import { test, expect } from "@playwright/test";

const BASE_URL =
  process.env.PLAYWRIGHT_TEST_BASE_URL ??
  process.env.BASE_URL ??
  "http://localhost:5173";

const TARGET_PATH = "/helix-core";

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

test.describe("Warpfield lattice preview auto-apply", () => {
  test.use({ baseURL: BASE_URL, serviceWorkers: "block" });

  test("auto-applies preview and surfaces fallback reasons when budgets clamp", async ({ page }) => {
    const updateBodies: any[] = [];

    await page.route("**/api/**", async (route) => {
      const url = route.request().url();
      if (
        url.includes("/api/helix/pipeline/update") ||
        url.includes("/api/helix/pipeline") ||
        url.includes("/api/helix/metrics")
      ) {
        await route.fallback();
        return;
      }
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({ status: 200 });
        return;
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });

    await page.route("**/api/helix/pipeline", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(basePipeline),
      });
    });

    await page.route("**/api/helix/metrics", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(metricsSnapshot),
      });
    });

    await page.route("**/api/helix/pipeline/update", async (route) => {
      const body = await route.request().postDataJSON();
      updateBodies.push(body);
      const isFallback = updateBodies.length > 1;
      const geometryFallback = {
        mode: (body as any)?.fallbackMode ?? "warn",
        applied: isFallback,
        reasons: isFallback ? ["clamp:dims:maxVoxels"] : [],
        requestedKind: (body as any)?.warpGeometryKind ?? "sdf",
        resolvedKind: isFallback ? "ellipsoid" : "sdf",
      };

      const payload = {
        ...basePipeline,
        warpGeometryKind: isFallback ? "ellipsoid" : "sdf",
        geometryPreview: {
          preview: (body as any)?.preview ?? null,
          mesh: (body as any)?.previewMesh ?? { meshHash: (body as any)?.meshHash ?? "mesh-hash" },
          lattice: {
            hashes: { volume: "vol-hash", sdf: "sdf-hash" },
            frame: { clampReasons: isFallback ? ["dims:maxVoxels"] : [] },
          },
        },
        geometryFallback,
      };

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(payload),
      });
    });

    await page.goto(TARGET_PATH, { waitUntil: "domcontentloaded" });

    const preview = {
      version: "v1",
      glbUrl: "/luma/test.glb",
      meshHash: "mesh-ok",
      targetDims: { Lx_m: 12, Ly_m: 6, Lz_m: 4 },
      updatedAt: Date.now(),
    };

    await page.evaluate((payload) => {
      localStorage.setItem("phoenixHullPreview", JSON.stringify(payload));
      window.dispatchEvent(new Event("phoenix-hull-preview"));
    }, preview);

    await expect(page.getByText("GLB preview applied")).toBeVisible({ timeout: 15_000 });
    expect(updateBodies[0]?.warpGeometryKind).toBe("sdf");
    expect(updateBodies[0]?.fallbackMode).toBe("warn");

    const fallbackPreview = { ...preview, meshHash: "mesh-fallback", updatedAt: preview.updatedAt + 10_000 };
    await page.evaluate((payload) => {
      localStorage.setItem("phoenixHullPreview", JSON.stringify(payload));
      window.dispatchEvent(new Event("phoenix-hull-preview"));
    }, fallbackPreview);

    await expect(page.getByText("GLB preview applied with fallback")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("clamp:dims:maxVoxels")).toBeVisible({ timeout: 15_000 });
    expect(updateBodies[1]?.warpGeometryKind).toBe("sdf");
    expect(updateBodies[1]?.previewMesh?.meshHash ?? updateBodies[1]?.mesh?.meshHash).toBe("mesh-fallback");
  });
});
