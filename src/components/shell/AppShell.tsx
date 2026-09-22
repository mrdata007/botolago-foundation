// BotolaGO shell — built on the UI kit (`@/components/ui-kit`).
//
// The shell is what makes Home → News → Fixtures → Fantasy → Profile feel
// like one product, so it is the first surface converted to the Fantasy
// design language: the page surface, gutter, column widths and bottom-nav
// clearance all come from `--ui-*` rather than from ad-hoc Tailwind.

import type { ReactNode } from "react";

import { UiScreen } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import { TopBar } from "./TopBar";
import { BottomNav } from "./BottomNav";
import { PageBackground, type BackgroundVariant } from "./PageBackground";

export function AppShell({
  children,
  backgroundVariant,
  contentWidth = "compact",
  bottomNav,
  className,
}: {
  children: ReactNode;
  backgroundVariant?: BackgroundVariant;
  contentWidth?: "compact" | "wide";
  bottomNav?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("relative min-h-dvh text-[color:var(--ui-on-surface)]", className)}>
      <PageBackground variant={backgroundVariant} />
      <TopBar />
      <UiScreen width={contentWidth === "wide" ? "wide" : "content"} bottomNav>
        {children}
      </UiScreen>
      {bottomNav ?? <BottomNav />}
    </div>
  );
}
