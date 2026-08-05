import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { AppShell } from "@/components/shell/AppShell";
import { FantasySubNav } from "@/components/fantasy/FantasySubNav";
import { FantasyMobileNav } from "@/components/fantasy/FantasyMobileNav";
import { GameweekStatusStrip } from "@/components/fantasy/GameweekStatusStrip";
import { FantasyOnboarding } from "@/components/fantasy/FantasyOnboarding";
import { CloudSyncBanner } from "@/components/fantasy/CloudSyncBanner";
import { FantasyImportPrompt } from "@/components/fantasy/FantasyImportPrompt";
import { FantasyCatalogUnavailable } from "@/components/fantasy/FantasyCatalogUnavailable";
import { useAtlasMatchdayAccess } from "@/components/fantasy/use-atlas-matchday-access";
import { useI18n } from "@/i18n/provider";

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
  const { t } = useI18n();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const normalizedPathname = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const isFantasyHub = normalizedPathname === "/fantasy";
  const isCreateFlow = normalizedPathname.startsWith("/fantasy/create");
  const { isResolving, isUnavailable, showAtlasMatchday, retry } =
    useAtlasMatchdayAccess(isFantasyHub);

  if (isResolving) {
    return (
      <div
        role="status"
        aria-label={t("state.loading")}
        className="grid min-h-dvh place-items-center bg-[#07101f] text-white"
      >
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/25 border-t-[#2f82ff] motion-reduce:animate-none" />
      </div>
    );
  }

  if (showAtlasMatchday) return <Outlet />;

  if (isUnavailable) {
    return (
      <AppShell contentWidth="wide" bottomNav={false}>
        <FantasyCatalogUnavailable onRetry={() => void retry()} backTo="/" />
      </AppShell>
    );
  }

  if (isCreateFlow) {
    return (
      <AppShell contentWidth="wide" bottomNav={false}>
        <Outlet />
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
