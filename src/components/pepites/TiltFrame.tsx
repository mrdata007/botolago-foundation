import { useEffect, useRef, type PointerEvent } from "react";

import { prefersReducedMotion, tiltAngles } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * A card that leans a few degrees towards a mouse pointer moving over it, and
 * settles flat when the pointer leaves. Only for a mouse: a finger has no hover
 * to follow, so touch and pen are left alone, and so is anyone who asked for
 * less motion. At most 6 degrees; it moves with `transform` only.
 */
export function TiltFrame({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const inner = useRef<HTMLDivElement>(null);
  const frame = useRef(0);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const lean = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse" || prefersReducedMotion()) return;
    const box = event.currentTarget.getBoundingClientRect();
    const { rotateX, rotateY } = tiltAngles(
      event.clientX - box.left,
      event.clientY - box.top,
      box.width,
      box.height,
    );
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      if (inner.current) {
        inner.current.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
      }
    });
  };

  const settle = () => {
    cancelAnimationFrame(frame.current);
    if (inner.current) inner.current.style.transform = "";
  };

  return (
    <div
      className={cn("flex [perspective:700px]", className)}
      onPointerMove={lean}
      onPointerLeave={settle}
    >
      <div
        ref={inner}
        className="flex transition-transform duration-[var(--duration-quick)] ease-[var(--ease-standard)]"
      >
        {children}
      </div>
    </div>
  );
}
