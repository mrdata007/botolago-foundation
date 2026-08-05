import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { TopBar } from "./TopBar";
import { BottomNav } from "./BottomNav";
import { PageBackground, type BackgroundVariant } from "./PageBackground";

export function AppShell({
  children,
  backgroundVariant,
  contentWidth = "compact",
  bottomNav,
}: {
  children: ReactNode;
  backgroundVariant?: BackgroundVariant;
  contentWidth?: "compact" | "wide";
  bottomNav?: ReactNode;
}) {
  return (
    <div className="relative min-h-dvh text-foreground">
      <PageBackground variant={backgroundVariant} />
      <TopBar />
      <main
        className={cn(
          "mx-auto px-3 pb-28 pt-4 sm:px-5 md:pb-12 md:pt-6",
          contentWidth === "wide" ? "max-w-5xl" : "max-w-2xl",
        )}
      >
        {children}
      </main>
      {bottomNav ?? <BottomNav />}
    </div>
  );
}
