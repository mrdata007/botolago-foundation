import { Lock } from "lucide-react";

import { cn } from "@/lib/utils";

import { PlusLogo } from "./PlusLogo";
import { PLUS_NAME, usePlusCopy } from "./plus-copy";

/**
 * A lock and the logo: « this one is for members ». Sits beside a premium entry point in Curva
 * (card editions, career detail, detailed duel). The product name is the logo, never typed; the
 * chip's spoken label carries the name as plain text (`plus.lock.aria`). A dark chip with a mint
 * rim on every surface, so it reads the same in light and dark themes.
 */
export function PlusLockChip({ className }: { className?: string }) {
  const { text } = usePlusCopy();
  return (
    <span
      className={cn("plus-lock", className)}
      role="img"
      aria-label={text("plus.lock.aria", { name: PLUS_NAME })}
    >
      <Lock aria-hidden />
      <PlusLogo label={PLUS_NAME} decorative />
    </span>
  );
}
