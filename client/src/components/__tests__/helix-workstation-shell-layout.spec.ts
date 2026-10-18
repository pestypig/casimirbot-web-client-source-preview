import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveMobileSurfaceSwipe } from "@/components/workstation/HelixWorkstationShell";

describe("HelixWorkstationShell layout contract", () => {
  it("anchors the desktop workstation grid to the viewport", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/components/workstation/HelixWorkstationShell.tsx"),
      "utf8",
    );

    expect(source).toContain('className="fixed inset-0 z-10 grid min-h-0 w-full"');
    expect(source).not.toContain('className="relative z-10 grid h-full min-h-0 w-full"');
  });

  it("waits for persisted chat hydration before creating a fallback Ask session", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/components/workstation/HelixWorkstationShell.tsx"),
      "utf8",
    );

    expect(source).toContain("const chatStoreHydrated = useAgiChatStore((state) => state.hydrated)");
    expect(source).toContain("if (!chatStoreHydrated) return;");
    expect(source).toContain("ensureContextSession(HELIX_ASK_CONTEXT_ID.desktop");
  });

  it("switches mobile surfaces only for intentional horizontal swipes", () => {
    expect(resolveMobileSurfaceSwipe({ surface: "ask", deltaX: 80, deltaY: 10 })).toBe("workstation");
    expect(resolveMobileSurfaceSwipe({ surface: "workstation", deltaX: -80, deltaY: 10 })).toBe("ask");
    expect(resolveMobileSurfaceSwipe({ surface: "ask", deltaX: -80, deltaY: 10 })).toBeNull();
    expect(resolveMobileSurfaceSwipe({ surface: "ask", deltaX: 40, deltaY: 5 })).toBeNull();
    expect(resolveMobileSurfaceSwipe({ surface: "ask", deltaX: 80, deltaY: 70 })).toBeNull();
  });

  it("renders the shared session header and chat switcher inside the mobile workstation", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/components/workstation/HelixWorkstationShell.tsx"),
      "utf8",
    );

    expect(source).toContain("const sessionHeaderContent = (");
    expect(source).toContain("const sessionSwitcher = sessionListOpen ? (");
    expect(source).toContain('data-mobile-workstation-session-shell="true"');
    expect(source).toContain('<WorkstationStage layoutVariant="mobile" />');
    expect(source.match(/\{sessionHeaderContent\}/g)).toHaveLength(2);
    expect(source.match(/\{sessionSwitcher\}/g)).toHaveLength(2);
  });

  it("owns one isolated mobile navigation rail outside both surfaces", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/components/workstation/HelixWorkstationShell.tsx"),
      "utf8",
    );

    expect(source).toContain('style={{ "--helix-mobile-edge-rail": "3rem" } as CSSProperties}');
    expect(source).toContain('data-testid="helix-mobile-surface-navigation"');
    expect(source).toContain('className="pointer-events-none absolute inset-0 z-[60] isolate"');
    expect(source).toContain("absolute inset-y-0 flex w-[var(--helix-mobile-edge-rail)] items-center");
    expect(source.match(/data-testid="helix-mobile-surface-switch"/g)).toHaveLength(1);
    expect(source).not.toContain("top-1/2 z-40");
  });

  it("reserves the rail and isolates the inactive mobile surface", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/components/workstation/HelixWorkstationShell.tsx"),
      "utf8",
    );

    expect(source).toContain("pl-[var(--helix-mobile-edge-rail)]");
    expect(source).toContain("pr-[var(--helix-mobile-edge-rail)]");
    expect(source).toContain('node.toggleAttribute("inert", mobileSurface !== "ask")');
    expect(source).toContain('node.toggleAttribute("inert", mobileSurface !== "workstation")');
    expect(source).toContain('"-translate-x-full pointer-events-none"');
    expect(source).toContain('"translate-x-full pointer-events-none"');
  });

  it("uses the dynamic mobile viewport and safe-area insets", () => {
    const desktopSource = fs.readFileSync(
      path.resolve(process.cwd(), "client/src/pages/desktop.tsx"),
      "utf8",
    );
    const htmlSource = fs.readFileSync(
      path.resolve(process.cwd(), "client/index.html"),
      "utf8",
    );

    expect(desktopSource).toContain('height: "100dvh"');
    expect(desktopSource).toContain('paddingLeft: "env(safe-area-inset-left, 0px)"');
    expect(desktopSource).toContain('paddingRight: "env(safe-area-inset-right, 0px)"');
    expect(htmlSource).toContain("viewport-fit=cover");
  });
});
