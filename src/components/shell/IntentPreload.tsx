import { useRouter } from "@tanstack/react-router";
import { useEffect } from "react";

import { INTENT_DELAY_MS, intentPath, preloadCode } from "@/lib/intent-preload";
import { savesData, type WarmupRouter } from "@/lib/section-warmup";

/**
 * Fetches a page's code when the reader is about to open it: the mouse
 * resting on its link, a finger touching it, or the keyboard focusing it
 * (src/lib/intent-preload.ts). Code only, never data. Renders nothing.
 */
export function IntentPreload() {
  const router = useRouter();

  useEffect(() => {
    if (savesData()) return;
    const done = new Set<string>();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const linkOf = (target: EventTarget | null) =>
      target instanceof Element ? target.closest("a") : null;
    const preload = (target: EventTarget | null) => {
      const path = intentPath(linkOf(target), window.location.origin);
      if (path) preloadCode(router as unknown as WarmupRouter, path, done);
    };

    const onPointerOver = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      clearTimeout(timer);
      timer = setTimeout(() => preload(event.target), INTENT_DELAY_MS);
    };
    const onPointerOut = () => clearTimeout(timer);
    const onTouchStart = (event: TouchEvent) => preload(event.target);
    const onFocusIn = (event: FocusEvent) => preload(event.target);

    document.addEventListener("pointerover", onPointerOver);
    document.addEventListener("pointerout", onPointerOut);
    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("focusin", onFocusIn);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("pointerover", onPointerOver);
      document.removeEventListener("pointerout", onPointerOut);
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, [router]);

  return null;
}
