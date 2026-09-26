import type { ReactNode } from "react";

import { AppShell } from "@/components/shell/AppShell";
import { cn } from "@/lib/utils";

import { pp } from "./pepites-design";
import { PepitesTopBar } from "./PepitesTopBar";
import { NightBand } from "./PepitesVisuals";

/**
 * The frame every Pépites page shares (Figma 01–04): the night top bar, the
 * page's night band under it (`hero`), and the light page with the bottom
 * bar. A page without a band of its own gets a short one, so the night bar
 * always ends on the slant; a night page runs on under the bar instead.
 */
export function PepitesShell({
  hero,
  tone = "page",
  children,
  className,
}: {
  hero?: ReactNode;
  /** `night`: the whole page is night (the player's matches, Figma 04). */
  tone?: "page" | "night";
  children: ReactNode;
  className?: string;
}) {
  return (
    <AppShell
      className={tone === "night" ? pp.night : pp.page}
      topBar={<PepitesTopBar />}
      pageHeader={
        hero ?? (
          <NightBand cut={20}>
            <div className="h-6" />
          </NightBand>
        )
      }
    >
      <div className={cn("flex flex-col gap-4 pt-3", className)} data-testid="pepites-page">
        {children}
      </div>
    </AppShell>
  );
}
