import type { ReactNode } from "react";

import { flashClass, useChangeFlash, useCountUp } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * A figure that counts to its new value when it changes and flashes green or
 * red for a second. It does not count on first show, only on a change the
 * reader can see (a refresh while the page is open).
 *
 * It renders plain text in a plain span: a text change outside a live region
 * is not announced, so a screen reader hears the number once, as it reads the
 * page, and not every frame of the count. Reduced motion jumps to the value.
 */
export function AnimatedNumber({
  value,
  format,
  better = "higher",
  className,
}: {
  value: number;
  format: (value: number) => string;
  better?: "higher" | "lower";
  className?: string;
}) {
  const shown = useCountUp(value);
  const flash = flashClass(useChangeFlash(value), better);
  return (
    <span className={cn(flash && ["rounded-sm", flash], className) || undefined}>
      {format(shown)}
    </span>
  );
}

/** Flashes its children green or red when `value` changes, without counting. */
export function FlashOnChange({
  value,
  better = "higher",
  children,
  className,
}: {
  value: number | null | undefined;
  better?: "higher" | "lower";
  children: ReactNode;
  className?: string;
}) {
  const flash = flashClass(useChangeFlash(value), better);
  return (
    <span className={cn(flash && ["rounded-sm", flash], className) || undefined}>{children}</span>
  );
}
