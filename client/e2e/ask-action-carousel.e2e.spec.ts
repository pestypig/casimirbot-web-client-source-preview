import { expect, test, type Locator, type Page } from "@playwright/test";
import { HELIX_DEVELOPER_ACCOUNT_POLICY } from "../../shared/helix-account-session";

test.setTimeout(120_000);

async function mockAskSurfaceApis(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  await page.route("**/api/account/session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        account_policy: HELIX_DEVELOPER_ACCOUNT_POLICY,
        session: {
          profile: {
            profile_id: "playwright-carousel-developer",
            account_type: "developer",
          },
          account_policy: HELIX_DEVELOPER_ACCOUNT_POLICY,
        },
      }),
    });
  });
  await page.route("**/api/essence/preferences", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ preferences: [], environment: null }),
    });
  });
  await page.route("**/api/agi/agent-providers", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ providers: [] }),
    });
  });
  await page.route(
    "**/api/workspace-os/browser-performance/sample",
    async (route) => {
      await route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({ accepted: true }),
      });
    },
  );
}

async function readActionEndpointBounds(
  track: Locator,
  edge: "left" | "right",
) {
  return track.evaluate((node, requestedEdge) => {
    const bounds = [
      ...node.querySelectorAll<HTMLElement>(
        "[data-helix-ask-action-item='true']",
      ),
    ]
      .filter((action) => action.getClientRects().length > 0)
      .map((action) => action.getBoundingClientRect());
    if (bounds.length === 0) return null;
    const endpoint = bounds.reduce((current, candidate) =>
      requestedEdge === "left"
        ? candidate.left < current.left
          ? candidate
          : current
        : candidate.right > current.right
          ? candidate
          : current,
    );
    return { left: endpoint.left, right: endpoint.right };
  }, edge);
}

async function moveCarouselToEdge(viewport: Locator, edge: "left" | "right") {
  await viewport.evaluate(async (node, requestedEdge) => {
    node.style.scrollBehavior = "auto";
    node.scrollLeft = requestedEdge === "left" ? 0 : node.scrollWidth;
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  }, edge);
}

async function expectCarouselReachability(
  page: Page,
  route: "/desktop" | "/mobile",
) {
  await mockAskSurfaceApis(page);
  await page.goto(route, { waitUntil: "domcontentloaded" });

  const viewport = page.getByTestId("helix-ask-action-carousel-viewport");
  const track = page.getByTestId("helix-ask-action-carousel-track");
  const leftArrow = page.getByRole("button", {
    name: "Scroll Ask controls left",
  });
  const rightArrow = page.getByRole("button", {
    name: "Scroll Ask controls right",
  });

  await expect(viewport).toBeVisible({ timeout: 90_000 });
  if (route === "/desktop") {
    await track.evaluate((node) => {
      for (let index = 0; index < 4; index += 1) {
        const delayedControl = document.createElement("button");
        delayedControl.type = "button";
        delayedControl.dataset.e2eCarouselControl = "true";
        delayedControl.dataset.helixAskActionItem = "true";
        delayedControl.textContent = `Delayed ${index + 1}`;
        delayedControl.style.flex = "0 0 48px";
        delayedControl.style.width = "48px";
        delayedControl.style.height = "40px";
        delayedControl.style.scrollSnapAlign = "center";
        node.append(delayedControl);
      }
    });
  }
  await expect
    .poll(() =>
      viewport.evaluate((node) => node.scrollWidth - node.clientWidth),
    )
    .toBeGreaterThan(2);

  // Async controls can preserve the browser's current scroll anchor. Normalize
  // to a known edge before asserting the controller's bidirectional states.
  await moveCarouselToEdge(viewport, "left");
  await expect(leftArrow).toBeDisabled();
  await expect(rightArrow).toBeEnabled();

  const viewportBounds = await viewport.boundingBox();
  const firstButtonBounds = await readActionEndpointBounds(track, "left");
  expect(viewportBounds).not.toBeNull();
  expect(firstButtonBounds).not.toBeNull();
  if (!viewportBounds || !firstButtonBounds) {
    throw new Error("Ask carousel start-edge geometry is unavailable");
  }
  expect(firstButtonBounds.left).toBeGreaterThanOrEqual(viewportBounds.x - 1);
  expect(firstButtonBounds.right).toBeLessThanOrEqual(
    viewportBounds.x + viewportBounds.width + 1,
  );

  const initialScrollLeft = await viewport.evaluate((node) => node.scrollLeft);
  await rightArrow.click();
  await expect
    .poll(() => viewport.evaluate((node) => node.scrollLeft))
    .toBeGreaterThan(initialScrollLeft);
  await expect(leftArrow).toBeEnabled();

  await moveCarouselToEdge(viewport, "right");
  await expect(rightArrow).toBeDisabled();
  await expect(leftArrow).toBeEnabled();

  const finalViewportBounds = await viewport.boundingBox();
  const lastButtonBounds = await readActionEndpointBounds(track, "right");
  expect(finalViewportBounds).not.toBeNull();
  expect(lastButtonBounds).not.toBeNull();
  if (!finalViewportBounds || !lastButtonBounds) {
    throw new Error("Ask carousel end-edge geometry is unavailable");
  }
  expect(lastButtonBounds.left).toBeGreaterThanOrEqual(
    finalViewportBounds.x - 1,
  );
  expect(lastButtonBounds.right).toBeLessThanOrEqual(
    finalViewportBounds.x + finalViewportBounds.width + 1,
  );
}

test.describe("Helix Ask action carousel", () => {
  test.describe("desktop Ask UI", () => {
    test.use({ viewport: { width: 1280, height: 800 } });

    test("keeps every overflowing toolbar control reachable", async ({
      page,
    }) => {
      await expectCarouselReachability(page, "/desktop");
    });
  });

  test.describe("mobile Ask UI", () => {
    test.use({
      viewport: { width: 320, height: 568 },
      isMobile: true,
      hasTouch: true,
    });

    test("uses the same reachable toolbar controller", async ({ page }) => {
      await expectCarouselReachability(page, "/mobile");
    });
  });
});
