import type { ReactNode } from "react";

import { BottomNav } from "@/components/shell/BottomNav";
import { TopBar } from "@/components/shell/TopBar";
import { cn } from "@/lib/utils";

/**
 * Fantasy screen frame reconstructed from the FPL reference.
 *
 * The reference is a phone canvas: every Fantasy screen is a single column
 * with its own header (gradient hero on the hub, "Back / Title" bar on inner
 * screens) and no application top bar. On wider viewports the same column
 * is centered at phone width under the BotolaGO top bar so global
 * navigation stays reachable without changing the screen composition.
 */
export function FantasyFrame({
  children,
  bottomNav = false,
  className,
  background = "light",
}: {
  children: ReactNode;
  /** The hub keeps the application bottom navigation exactly like the reference. */
  bottomNav?: boolean;
  className?: string;
  background?: "light" | "white";
}) {
  return (
    <div
      className={cn(
        "fpl-root relative min-h-dvh text-foreground",
        background === "white" ? "bg-white" : "bg-[color:var(--fpl-bg)]",
      )}
    >
      <div className="hidden md:block">
        <TopBar />
      </div>
      <main
        className={cn(
          "fpl-column relative mx-auto w-full max-w-[480px] md:my-4 md:min-h-[calc(100dvh-7rem)] md:overflow-hidden md:rounded-[28px] md:shadow-[var(--shadow-floating)]",
          bottomNav ? "pb-28" : "pb-8",
          background === "white" ? "bg-white" : "bg-[color:var(--fpl-bg)]",
          className,
        )}
      >
        {children}
      </main>
      {bottomNav ? <BottomNav /> : null}
    </div>
  );
}
