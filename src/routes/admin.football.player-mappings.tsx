import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { AdminFunctionalLoading, AdminFunctionalRoute } from "@/backend/admin/functional-route";
import { loadAdminPlayerMappingsRouteAccess } from "@/backend/admin/route-access.functions";
import {
  SupabasePlayerMappingRepository,
  type MappingRpcClient,
} from "@/backend/football/identity/mapping-repository";
import { PlayerMappingsScreen } from "@/components/admin/player-mappings/PlayerMappingsScreen";
import { getAdminApi } from "@/integrations/supabase/v2-client";
import { useI18n } from "@/i18n/provider";

export const Route = createFileRoute("/admin/football/player-mappings")({
  ssr: false,
  // Not on intent: a staff access check (see `admin.tsx`).
  preload: false,
  loader: () => loadAdminPlayerMappingsRouteAccess(),
  pendingComponent: AdminFunctionalLoading,
  component: AdminPlayerMappingsRoute,
});

function AdminPlayerMappingsRoute() {
  const access = Route.useLoaderData();
  const { lang } = useI18n();
  const rtl = lang === "ar";
  // The only door to the data: RPC functions that authorise the caller again.
  // No table is read from the browser.
  const repository = useMemo(
    () => new SupabasePlayerMappingRepository(getAdminApi() as unknown as MappingRpcClient),
    [],
  );
  return (
    <AdminFunctionalRoute
      access={access}
      layout="hub"
      title={rtl ? "مطابقة اللاعبين" : "Rapprochement des joueurs"}
      description={
        rtl
          ? "قائمة مراجعة لاعبي المزوّدين مقابل لاعبي التطبيق. اقتراح ثم موافقة شخص آخر."
          : "File de relecture des joueurs des fournisseurs face aux joueurs de l’application. Une proposition, puis l’approbation d’une autre personne."
      }
      testId="admin-player-mappings"
    >
      {access.state === "authorized" ? (
        <PlayerMappingsScreen
          repository={repository}
          actorId={access.identity.userId}
          canManage={access.context.permissions.includes("football.manage_mappings")}
          lang={rtl ? "ar" : "fr"}
        />
      ) : null}
    </AdminFunctionalRoute>
  );
}
