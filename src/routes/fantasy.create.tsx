import { createFileRoute, Navigate, Outlet, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { useAuth } from "@/auth/AuthProvider";
import { AtlasCreateProvider, useAtlasCreate } from "@/components/fantasy/AtlasCreateProvider";
import { LoadingState } from "@/components/common/States";
import { FantasyCatalogUnavailable } from "@/components/fantasy/FantasyCatalogUnavailable";
import { useFantasyOwned } from "@/services/fantasy-owned-provider";

export const Route = createFileRoute("/fantasy/create")({
  component: AtlasCreateLayout,
});

function AtlasCreateLayout() {
  const { status, user } = useAuth();
  const owned = useFantasyOwned();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  if (status === "loading") return <LoadingState />;
  if (status !== "authenticated" || !user) {
    return <Navigate to="/auth/login" search={{ next: "/fantasy/create" }} replace />;
  }
  if (owned.source === "cloud" && owned.isLoading) return <LoadingState />;
  if (owned.source === "cloud" && owned.snapshot?.teamId && pathname !== "/fantasy/create/review") {
    return <Navigate to="/fantasy/team" replace />;
  }

  return (
    <AtlasCreateProvider>
      <AtlasCreateAvailability>
        <Outlet />
      </AtlasCreateAvailability>
    </AtlasCreateProvider>
  );
}

function AtlasCreateAvailability({ children }: { children: ReactNode }) {
  const { status, unavailableReason } = useAtlasCreate();
  if (status === "loading") return <LoadingState />;
  if (status === "unavailable") {
    const detailKey =
      unavailableReason === "rules"
        ? "fantasy.atlas.create.unavailable.rules"
        : unavailableReason === "clubs"
          ? "fantasy.atlas.create.unavailable.clubs"
          : unavailableReason === "gameweek"
            ? "fantasy.atlas.create.unavailable.gameweek"
            : "fantasy.atlas.create.unavailable.catalog";
    return (
      <FantasyCatalogUnavailable detailKey={detailKey} onRetry={() => window.location.reload()} />
    );
  }
  return children;
}
