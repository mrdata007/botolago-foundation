import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/shell/AppShell";
import { FantasySubNav } from "@/components/fantasy/FantasySubNav";
import { FantasyOnboarding } from "@/components/fantasy/FantasyOnboarding";
import { CloudSyncBanner } from "@/components/fantasy/CloudSyncBanner";

export const Route = createFileRoute("/fantasy")({
  head: () => ({
    meta: [
      { title: "Fantasy — BotolaGO" },
      { name: "description", content: "Créez votre équipe fantasy de la Botola Pro et affrontez vos amis." },
      { property: "og:title", content: "Fantasy — BotolaGO" },
      { property: "og:description", content: "Créez votre équipe fantasy de la Botola Pro et affrontez vos amis." },
    ],
  }),
  component: FantasyLayout,
});

function FantasyLayout() {
  return (
    <AppShell>
      <FantasySubNav />
      <CloudSyncBanner />
      <div className="pt-3">
        <Outlet />
      </div>
      <FantasyOnboarding />
    </AppShell>
  );
}
