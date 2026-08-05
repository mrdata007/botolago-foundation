import { createFileRoute, Navigate, Outlet } from "@tanstack/react-router";
import { AlertTriangle, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";

import { useAuth } from "@/auth/AuthProvider";
import { AtlasCreateProvider, useAtlasCreate } from "@/components/fantasy/AtlasCreateProvider";
import { LoadingState } from "@/components/common/States";
import { useI18n } from "@/i18n/provider";
import { useFantasyOwned } from "@/services/fantasy-owned-provider";

export const Route = createFileRoute("/fantasy/create")({
  component: AtlasCreateLayout,
});

function AtlasCreateLayout() {
  const { status, user } = useAuth();
  const owned = useFantasyOwned();

  if (status === "loading") return <LoadingState />;
  if (status !== "authenticated" || !user) {
    return <Navigate to="/auth/login" search={{ next: "/fantasy/create" }} replace />;
  }
  if (owned.source === "cloud" && owned.isLoading) return <LoadingState />;
  if (owned.source === "cloud" && owned.snapshot?.teamId) {
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
  const { t } = useI18n();
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
      <section
        role="alert"
        aria-labelledby="atlas-create-unavailable-title"
        className="mx-auto mt-6 max-w-xl rounded-3xl border border-amber-500/25 bg-amber-50/85 p-5 text-amber-950 shadow-sm"
      >
        <AlertTriangle className="h-7 w-7 text-amber-700" aria-hidden />
        <h1 id="atlas-create-unavailable-title" className="mt-3 text-xl font-black">
          {t("fantasy.atlas.create.unavailable.title")}
        </h1>
        <p className="mt-2 text-sm leading-relaxed">{t(detailKey)}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-amber-900 px-4 text-sm font-black text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700 focus-visible:ring-offset-2"
        >
          <RefreshCw className="h-4 w-4" aria-hidden />
          {t("state.retry")}
        </button>
      </section>
    );
  }
  return children;
}
