import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useEffect } from "react";

import { useAuth } from "@/auth/AuthProvider";
import { FantasyFrame } from "@/components/fpl/FantasyFrame";
import { CurvaLoading } from "@/components/curva/StateBlocks";
import { CurvaLockScreen } from "@/components/curva/CurvaLockScreen";
import { preloadCardRenderer } from "@/components/manager-card/use-card-renderer";
import { curvaAccess } from "@/services/curva-access";
import { shouldRedirectFromCurva } from "@/services/manager-card-status";

/**
 * `/curva` and everything under it (the Manager Card section). Two layers decide whether it
 * exists (`src/lib/feature-flags.ts`): the build, and the database status the root route read
 * during the server render. While either says no, every Curva address goes to Fantasy before any
 * loader runs, so nothing of the section is ever drawn. Never indexed, never in a shared cache.
 *
 * Every page under it draws cards, so the layout starts the renderer's chunk and fonts as it
 * mounts, in parallel with the page's data (the card box appears when the data does, and the card
 * should not wait a further chunk and font load behind it).
 */
export const Route = createFileRoute("/curva")({
  beforeLoad: ({ context }) => {
    if (shouldRedirectFromCurva(context.queryClient)) {
      throw redirect({ to: "/fantasy", replace: true });
    }
  },
  head: () => ({
    // The card's own face (the autograph's signature script), fetched with the page instead of
    // when the card's stylesheet (`shield.css`) declares it.
    links: [
      {
        rel: "preload",
        as: "font",
        type: "font/woff2",
        href: "/fonts/mr-dafoe-latin-400-normal.woff2",
        crossOrigin: "anonymous",
      },
    ],
  }),
  headers: () => ({ "Cache-Control": "private, no-store" }),
  component: CurvaLayout,
});

/**
 * Started when this layout's code is evaluated, not when it mounts: the code is only fetched once
 * the route has matched and `beforeLoad` let the section through, and it is evaluated before the
 * router finishes loading the page's own chunk and hydrates, so the renderer's chunk and the card's
 * faces start a whole hydration earlier than an effect would start them. Only this component
 * refers to it, so it travels with the layout's lazy chunk and with the section off nothing runs.
 */
const cardRendererStarted: true = (startCardRendererOnCurva(), true);

/**
 * Only while the address is Curva's. Every page warms the other sections' code once it has loaded
 * (`SectionWarmup`), which evaluates this module on Home and everywhere else too, and then the
 * renderer's chunk and all five card faces (Arabic ones included, in a French page) were fetched
 * for a visitor who never opened Curva. From another page the layout's own effect below starts
 * them when Curva is really shown.
 */
function startCardRendererOnCurva(): void {
  if (typeof window === "undefined") return;
  if (/^\/curva(\/|$)/.test(window.location.pathname)) preloadCardRenderer();
}

function CurvaLayout() {
  const { status } = useAuth();
  useEffect(() => {
    preloadCardRenderer(); // idempotent; covers a layout whose module was evaluated on the server
  }, []);
  if (!cardRendererStarted) return null;
  // Curva is for accounts. A signed-out visitor gets the lock screen for every address under it,
  // before any page component or read runs; until the session is known nothing of Curva is drawn.
  const access = curvaAccess(status);
  if (access === "locked") return <CurvaLockScreen />;
  if (access === "pending") {
    return (
      <FantasyFrame bottomNav>
        <CurvaLoading />
      </FantasyFrame>
    );
  }
  return <Outlet />;
}
