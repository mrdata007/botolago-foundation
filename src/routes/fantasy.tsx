import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/shell/AppShell";
import { FantasySubNav } from "@/components/fantasy/FantasySubNav";
import { FantasyMobileNav } from "@/components/fantasy/FantasyMobileNav";
import { GameweekStatusStrip } from "@/components/fantasy/GameweekStatusStrip";
import { FantasyOnboarding } from "@/components/fantasy/FantasyOnboarding";
import { CloudSyncBanner } from "@/components/fantasy/CloudSyncBanner";
import { FantasyImportPrompt } from "@/components/fantasy/FantasyImportPrompt";

export const Route = createFileRoute("/fantasy")({
  head: () => ({
    meta: [
      { title: "Fantasy — BotolaGO" },
      {
        name: "description",
        content: "Créez votre équipe fantasy de la Botola Pro et affrontez vos amis.",
      },
      { property: "og:title", content: "Fantasy — BotolaGO" },
      {
        property: "og:description",
        content: "Créez votre équipe fantasy de la Botola Pro et affrontez vos amis.",
      },
    ],
  }),
  component: FantasyLayout,
});

function FantasyLayout() {
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
