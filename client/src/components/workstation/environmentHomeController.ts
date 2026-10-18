import {HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT} from "@/lib/workstation/accountCapabilityPolicy";

/** Standard gamepad input is limited to Home's primary tile buttons. */
export function startEnvironmentHomeController(grid: HTMLElement): () => void {
  let stopped = false, frame = 0, identity: string | null = null;
  let armed = false, previous = "";
  const reset = () => { armed = false; previous = ""; identity = null; };
  const tick = () => {
    if (stopped) return;
    frame = window.requestAnimationFrame(tick);
    const target = document.activeElement;
    if (!document.hasFocus() || document.visibilityState !== "visible" ||
        !grid.isConnected || !grid.getClientRects().length ||
        document.querySelector('[role="dialog"], [aria-modal="true"]') ||
        !(target instanceof HTMLButtonElement) || !grid.contains(target) ||
        !target.hasAttribute("data-home-tile-primary") || target.disabled) {
      reset(); return;
    }
    let pad: Gamepad | undefined;
    try { pad = Array.from(navigator.getGamepads?.() ?? []).find(
      (candidate): candidate is Gamepad => Boolean(candidate?.connected && candidate.mapping === "standard")); }
    catch { reset(); return; }
    if (!pad) { reset(); return; }
    const currentIdentity = `${pad.index}:${pad.id}`;
    if (identity !== currentIdentity) { reset(); identity = currentIdentity; }
    const pressed = (index: number) => pad!.buttons[index]?.pressed === true;
    const x = pad.axes[0] ?? 0, y = pad.axes[1] ?? 0;
    const actions = [
      pressed(0) && "activate", (pressed(12) || y < -0.6) && "up",
      (pressed(13) || y > 0.6) && "down", (pressed(14) || x < -0.6) && "left",
      (pressed(15) || x > 0.6) && "right",
    ].filter(Boolean) as Array<"activate" | "up" | "down" | "left" | "right">;
    if (!actions.length) { armed = true; previous = ""; return; }
    // Conflicting inputs must be released before another action is admitted.
    if (actions.length !== 1) { armed = false; previous = ""; return; }
    const action = actions[0];
    if (!armed || action === previous) return;
    previous = action;
    if (action === "activate") { armed = false; target.click(); return; }
    const tiles = Array.from(grid.querySelectorAll<HTMLButtonElement>("[data-home-tile-primary]"))
      .filter(tile => !tile.disabled && tile.getClientRects().length > 0);
    const columns = Math.max(1, getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length);
    const offset = { right: 1, left: -1, down: columns, up: -columns }[action];
    const index = tiles.indexOf(target);
    if (offset === undefined || index < 0 || !tiles.length) return;
    tiles[(index + offset % tiles.length + tiles.length) % tiles.length]?.focus();
  };
  const stop = () => {
    stopped = true; window.cancelAnimationFrame(frame);
    window.removeEventListener("blur", reset);
    window.removeEventListener("gamepaddisconnected", reset);
    window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, stop);
    document.removeEventListener("visibilitychange", reset);
  };
  window.addEventListener("blur", reset);
  window.addEventListener("gamepaddisconnected", reset);
  window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, stop);
  document.addEventListener("visibilitychange", reset);
  frame = window.requestAnimationFrame(tick);
  return stop;
}
