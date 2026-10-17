import { useEffect, useRef } from "react";

export function useTouchToMouseBridge<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const dispatchMouse = (pointerEvent: PointerEvent, type: string) => {
      const target = pointerEvent.target as HTMLElement | null;
      if (!target) return;
      const synthetic = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: pointerEvent.clientX,
        clientY: pointerEvent.clientY,
        screenX: pointerEvent.screenX,
        screenY: pointerEvent.screenY,
        buttons: pointerEvent.buttons,
        ctrlKey: pointerEvent.ctrlKey,
        shiftKey: pointerEvent.shiftKey,
        altKey: pointerEvent.altKey,
        metaKey: pointerEvent.metaKey
      });
      target.dispatchEvent(synthetic);
    };

    const handleDown = (event: PointerEvent) => {
      if (event.pointerType !== "touch") return;
      dispatchMouse(event, "mousedown");
    };
    const handleMove = (event: PointerEvent) => {
      if (event.pointerType !== "touch") return;
      dispatchMouse(event, "mousemove");
    };
    const handleUp = (event: PointerEvent) => {
      if (event.pointerType !== "touch") return;
      dispatchMouse(event, "mouseup");
    };

    el.addEventListener("pointerdown", handleDown, { capture: true });
    el.addEventListener("pointermove", handleMove, { capture: true });
    el.addEventListener("pointerup", handleUp, { capture: true });
    el.addEventListener("pointercancel", handleUp, { capture: true });

    return () => {
      el.removeEventListener("pointerdown", handleDown, { capture: true });
      el.removeEventListener("pointermove", handleMove, { capture: true });
      el.removeEventListener("pointerup", handleUp, { capture: true });
      el.removeEventListener("pointercancel", handleUp, { capture: true });
    };
  }, []);

  return ref;
}
