import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { AppShell } from "@/components/shell/AppShell";
import { FantasySubNav } from "@/components/fantasy/FantasySubNav";
import { FantasyMobileNav } from "@/components/fantasy/FantasyMobileNav";
import { GameweekStatusStrip } from "@/components/fantasy/GameweekStatusStrip";
import { FantasyOnboarding } from "@/components/fantasy/FantasyOnboarding";
import { CloudSyncBanner } from "@/components/fantasy/CloudSyncBanner";
import { FantasyImportPrompt } from "@/components/fantasy/FantasyImportPrompt";
import { FantasyUnavailableState } from "@/components/fantasy/FantasyUnavailableState";
import { ErrorState, LoadingState } from "@/components/common/States";
import { useFantasyAvailability } from "@/services/use-fantasy-availability";
import { fantasyRouteUnavailableReason } from "@/services/fantasy-availability";

export const Route = createFileRoute("/fantasy")({
  head: () => ({
    meta: [
      { title: "Fantasy — BotolaGO" },
      {
        name: "description",
        content:
          "La Fantasy BotolaGO ouvrira lorsque les effectifs et le calendrier nécessaires seront disponibles et vérifiés.",
      },
      { property: "og:title", content: "Fantasy — BotolaGO" },
      {
        property: "og:description",
        content:
          "La Fantasy BotolaGO ouvrira lorsque les effectifs et le calendrier nécessaires seront disponibles et vérifiés.",
      },
    ],
  }),
  component: FantasyLayout,
});

function FantasyLayout() {
  const availability = useFantasyAvailability();
  const pathname = useLocation({ select: (location) => location.pathname });
  const unavailableReason = availability.data
    ? fantasyRouteUnavailableReason(availability.data, pathname)
    : null;

  if (availability.isPending || availability.isError || unavailableReason) {
    return (
      <AppShell contentWidth="wide" bottomNav={<FantasyMobileNav />}>
        <FantasySubNav />
        <div className="pt-3">
          {availability.isPending ? (
            <LoadingState />
          ) : availability.isError ? (
            <ErrorState onRetry={() => void availability.refetch()} />
          ) : unavailableReason ? (
            <FantasyUnavailableState reason={unavailableReason} />
          ) : null}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell contentWidth="wide" bottomNav={<FantasyMobileNav />}>
      <FantasySubNav />
      <GameweekStatusStrip />
      <CloudSyncBanner />
      <FantasyImportPrompt />
      <div className="pt-3">
        <Outlet />
      </div>
      <FantasyOnboarding />
    </AppShell>
  );
}
