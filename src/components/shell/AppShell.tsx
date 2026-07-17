import type { ReactNode } from "react";
import { TopBar } from "./TopBar";
import { BottomNav } from "./BottomNav";
import { FirstLaunchLanguage } from "./FirstLaunchLanguage";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen bg-[var(--app-bg)] text-foreground">
      {/* Ambient background: subtle stadium-like gradient */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[var(--app-bg-gradient)]" />
        <div className="absolute -top-32 -end-32 h-96 w-96 rounded-full bg-[color:var(--brand-accent)]/20 blur-3xl" />
        <div className="absolute -bottom-40 -start-24 h-96 w-96 rounded-full bg-[color:var(--brand-primary)]/25 blur-3xl" />
      </div>

      <TopBar />
      <main className="mx-auto max-w-2xl px-3 pt-4 pb-28">{children}</main>
      <BottomNav />
      <FirstLaunchLanguage />
    </div>
  );
}
