import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { AdminFunctionalLoading, AdminFunctionalRoute } from "@/backend/admin/functional-route";
import { loadAdminSofascorePlayersRouteAccess } from "@/backend/admin/route-access.functions";
import type { MappingRpcClient } from "@/backend/football/identity/mapping-repository";
import { SupabaseSofascorePlayerQueueRepository } from "@/backend/football/identity/sofascore-player-queue";
import { SofascorePlayerQueueScreen } from "@/components/admin/sofascore-player-queue/SofascorePlayerQueueScreen";
import { getAdminApi } from "@/integrations/supabase/v2-client";
import { useI18n } from "@/i18n/provider";

export const Route = createFileRoute("/admin/football/sofascore-players")({
  ssr: false,
  loader: () => loadAdminSofascorePlayersRouteAccess(),
  pendingComponent: AdminFunctionalLoading,
  component: AdminSofascorePlayersRoute,
});

function AdminSofascorePlayersRoute() {
  const access = Route.useLoaderData();
  const { lang } = useI18n();
  const rtl = lang === "ar";
  // The only door to the data: RPC functions that authorise the caller again.
  // No table is read from the browser.
  const repository = useMemo(
    () => new SupabaseSofascorePlayerQueueRepository(getAdminApi() as unknown as MappingRpcClient),
    [],
  );
  return (
    <AdminFunctionalRoute
      access={access}
      layout="hub"
      title={rtl ? "لاعبو SofaScore بانتظار التأكيد" : "Joueurs SofaScore à confirmer"}
      description={
        rtl
          ? "لاعبون لم تتمكن المطابقة التلقائية من ربطهم بأمان. اختر اللاعب الصحيح بنقرة واحدة ثم أكّد."
          : "Joueurs que le rapprochement automatique n’a pas pu associer sans risque. Choisissez le bon joueur en un geste, puis confirmez."
      }
      testId="admin-sofascore-players"
    >
      {access.state === "authorized" ? (
        <SofascorePlayerQueueScreen
          repository={repository}
          canManage={access.context.permissions.includes("football.manage_mappings")}
          lang={rtl ? "ar" : "fr"}
        />
      ) : null}
    </AdminFunctionalRoute>
  );
}
