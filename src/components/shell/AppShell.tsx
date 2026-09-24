// BotolaGO shell — built on the UI kit (`@/components/ui-kit`).
//
// The shell is what makes Home → News → Fixtures → Fantasy → Profile feel
// like one product: the flat page, the white top bar, the content column with
// its gutter and bottom-nav clearance, and the bottom nav, all from `--ui-*`
// rather than from ad-hoc Tailwind.
//
// Option A adds two slots, both optional, both full-bleed (outside the
// content gutter, which a band drawn edge to edge cannot live inside):
//
//   `topBar`      replaces the wordmark bar. A detail screen whose first row
//                 is "← Retour · kicker · share" passes its `UiHeader` here
//                 instead of stacking it under the global bar (A-Match).
//   `pageHeader`  sits directly under the top bar, above the live strip and
//                 the content column: a hub's `UiPageTitle` ("Matches",
//                 "Profil") with its chip row, or any other edge-to-edge band.

import type { ReactNode } from "react";

import { UiScreen } from "@/components/ui-kit";
import { LiveStrip } from "@/components/matches/LiveStrip";
import { cn } from "@/lib/utils";
import { TopBar } from "./TopBar";
import { BottomNav } from "./BottomNav";
import { PageBackground, type BackgroundVariant } from "./PageBackground";

export function AppShell({
  children,
  backgroundVariant,
  contentWidth = "compact",
  bottomNav,
  liveStrip = false,
  topBar,
  pageHeader,
  className,
}: {
  children: ReactNode;
  backgroundVariant?: BackgroundVariant;
  contentWidth?: "compact" | "wide";
  bottomNav?: ReactNode;
  /** Live scores under the top bar while any match is live (Home, Matches). */
  liveStrip?: boolean;
  /**
   * Replaces the global top bar (wordmark + language). For a detail screen
   * whose own header — back, kicker, actions — is its first row, e.g.
   * `<UiHeader sticky kicker={…} backTo="/matches" trailing={…} />`.
   * `--topbar-h` still describes the GLOBAL bar: anything sticking under a
   * replacement (the live strip, sticky tabs) must use its own offset.
   */
  topBar?: ReactNode;
  /**
   * Full-bleed band(s) under the top bar, outside the content gutter: a
   * hub's `UiPageTitle`, a chip row, a photo band. Rendered before the live
   * strip, so the strip still sticks directly under the top bar on scroll.
   */
  pageHeader?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("relative min-h-dvh text-[color:var(--ui-on-surface)]", className)}>
      <PageBackground variant={backgroundVariant} />
      {topBar ?? <TopBar />}
      {pageHeader}
      {liveStrip && <LiveStrip />}
      <UiScreen width={contentWidth === "wide" ? "wide" : "content"} bottomNav>
        {children}
      </UiScreen>
      {bottomNav ?? <BottomNav />}
    </div>
  );
}
