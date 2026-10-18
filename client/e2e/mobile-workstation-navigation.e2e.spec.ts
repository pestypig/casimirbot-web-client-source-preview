import { expect, test, type Locator, type Page } from "@playwright/test";
import { HELIX_USER_ACCOUNT_POLICY } from "../../shared/helix-account-session";

test.use({
  viewport: { width: 320, height: 568 },
  isMobile: true,
  hasTouch: true,
  serviceWorkers: "block",
});

test.setTimeout(120_000);

async function expectSwitchOwnsItsHitTarget(page: Page, surfaceSwitch: Locator) {
  await expect(surfaceSwitch).toBeVisible();
  const box = await surfaceSwitch.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  if (!box || !viewport) throw new Error("mobile switch geometry is unavailable");

  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  const ownsHitTarget = await surfaceSwitch.evaluate((button) => {
    const bounds = button.getBoundingClientRect();
    const hit = document.elementFromPoint(
      bounds.left + bounds.width / 2,
      bounds.top + bounds.height / 2,
    );
    return hit === button || Boolean(hit && button.contains(hit));
  });
  expect(ownsHitTarget).toBe(true);
}

async function expectLeftRailReserved(surfaceSwitch: Locator, content: Locator) {
  const switchBox = await surfaceSwitch.boundingBox();
  const contentBox = await content.boundingBox();
  expect(switchBox).not.toBeNull();
  expect(contentBox).not.toBeNull();
  if (!switchBox || !contentBox) throw new Error("left rail geometry is unavailable");
  expect(contentBox.x).toBeGreaterThanOrEqual(switchBox.x + switchBox.width);
}

async function expectRightRailReserved(surfaceSwitch: Locator, content: Locator) {
  const switchBox = await surfaceSwitch.boundingBox();
  const contentBox = await content.boundingBox();
  expect(switchBox).not.toBeNull();
  expect(contentBox).not.toBeNull();
  if (!switchBox || !contentBox) throw new Error("right rail geometry is unavailable");
  expect(contentBox.x + contentBox.width).toBeLessThanOrEqual(switchBox.x);
}

test("Workflow Demo cannot cover or displace the mobile Ask/workstation switch", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  await page.route("**/api/account/session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ account_policy: HELIX_USER_ACCOUNT_POLICY, session: null }),
    });
  });
  await page.route("**/api/essence/preferences", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ preferences: [], environment: null }),
    });
  });
  await page.route("**/api/workspace-os/browser-performance/sample", async (route) => {
    await route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({ accepted: true }),
    });
  });

  await page.goto("/mobile", { waitUntil: "domcontentloaded" });

  const shell = page.getByTestId("helix-mobile-workstation-shell");
  const askSurface = page.getByTestId("helix-mobile-ask-surface");
  const workstationSurface = page.getByTestId("helix-mobile-workstation-surface");
  const surfaceSwitch = page.getByTestId("helix-mobile-surface-switch");

  await expect(shell).toHaveAttribute("data-mobile-surface", "ask", { timeout: 90_000 });
  await expect(surfaceSwitch).toHaveAttribute("data-target-surface", "workstation");
  await expect.poll(() => askSurface.evaluate((node) => node.hasAttribute("inert"))).toBe(false);
  await expect.poll(() => workstationSurface.evaluate((node) => node.hasAttribute("inert"))).toBe(true);

  await surfaceSwitch.click();
  await expect(shell).toHaveAttribute("data-mobile-surface", "workstation");
  await expect(surfaceSwitch).toHaveAttribute("data-target-surface", "ask");
  await expect.poll(() => askSurface.evaluate((node) => node.hasAttribute("inert"))).toBe(true);
  await expect.poll(() => workstationSurface.evaluate((node) => node.hasAttribute("inert"))).toBe(false);

  await page.getByRole("button", { name: "Open panel picker", exact: true }).click();
  await page.getByRole("button", { name: "Workflow Demo Lab", exact: true }).click();
  const demoPanel = page.getByTestId("workflow-demo-lab-panel");
  await expect(demoPanel).toBeVisible();
  await demoPanel.getByRole("button", { name: "Custom topic", exact: true }).click();
  await demoPanel.getByLabel("Custom workflow objective").fill(
    "Quantum energy inequalities and negative-energy constraints",
  );
  await demoPanel.getByRole("button", { name: /Enable demo/i }).click();

  await expect(page.getByTestId("helix-ask-workflow-qte")).toHaveCount(2);
  await expect(demoPanel.getByTestId("helix-ask-workflow-qte")).toBeVisible();
  await expectSwitchOwnsItsHitTarget(page, surfaceSwitch);

  await surfaceSwitch.click();
  await expect(shell).toHaveAttribute("data-mobile-surface", "ask");
  const inlineQte = askSurface.getByTestId("helix-ask-workflow-qte");
  await expect(inlineQte).toBeVisible();
  await page.waitForTimeout(350);
  await expectSwitchOwnsItsHitTarget(page, surfaceSwitch);
  await expectLeftRailReserved(surfaceSwitch, inlineQte);

  await inlineQte.getByRole("button", { name: /Use next prompt/i }).click();
  await expect(page).toHaveURL(/\/mobile(?:[?#]|$)/);
  await expect(shell).toHaveAttribute("data-mobile-surface", "ask");
  await expectSwitchOwnsItsHitTarget(page, surfaceSwitch);
  await expectLeftRailReserved(surfaceSwitch, inlineQte);

  await surfaceSwitch.click();
  await expect(shell).toHaveAttribute("data-mobile-surface", "workstation");
  await expect(demoPanel).toBeVisible();
  await page.waitForTimeout(350);
  await expectSwitchOwnsItsHitTarget(page, surfaceSwitch);
  await expectRightRailReserved(surfaceSwitch, demoPanel);

  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(350);
  await expectSwitchOwnsItsHitTarget(page, surfaceSwitch);
  await expectRightRailReserved(surfaceSwitch, demoPanel);

  await surfaceSwitch.click();
  await expect(shell).toHaveAttribute("data-mobile-surface", "ask");
  await expect(inlineQte).toBeVisible();
  await page.waitForTimeout(350);
  await expectSwitchOwnsItsHitTarget(page, surfaceSwitch);
  await expectLeftRailReserved(surfaceSwitch, inlineQte);

  await surfaceSwitch.click();
  await expect(shell).toHaveAttribute("data-mobile-surface", "workstation");
  await expect(demoPanel).toBeVisible();
});
