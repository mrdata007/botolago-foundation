import type { ReactNode } from "react";
import { TopBar } from "./TopBar";
import { BottomNav } from "./BottomNav";
import { PageBackground, type BackgroundVariant } from "./PageBackground";

export function AppShell({ children, backgroundVariant }: { children: ReactNode; backgroundVariant?: BackgroundVariant }) {
  return (
    <div className="relative min-h-dvh text-foreground">
      <PageBackground variant={backgroundVariant} />
      <TopBar />
      <main className="mx-auto max-w-2xl px-3 pt-4 pb-28">{children}</main>
      <BottomNav />
    </div>
  );
}

