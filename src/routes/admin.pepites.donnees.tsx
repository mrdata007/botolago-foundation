import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { AdminFunctionalLoading, AdminFunctionalRoute } from "@/backend/admin/functional-route";
import { loadAdminPepitesDataRouteAccess } from "@/backend/admin/route-access.functions";
import { PepitesAdminData, type DataTab } from "@/components/pepites/admin/PepitesAdminData";
import { useI18n } from "@/i18n/provider";

export const Route = createFileRoute("/admin/pepites/donnees")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): { onglet?: "joueurs" | "photos" } =>
    search.onglet === "joueurs" || search.onglet === "photos" ? { onglet: search.onglet } : {},
  loader: () => loadAdminPepitesDataRouteAccess(),
  pendingComponent: AdminFunctionalLoading,
  component: AdminPepitesDataRoute,
});

function AdminPepitesDataRoute() {
  const access = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/admin/pepites/donnees" });
  const { lang } = useI18n();
  const rtl = lang === "ar";
  const tab: DataTab =
    search.onglet === "joueurs" ? "players" : search.onglet === "photos" ? "photos" : "desk";
  return (
    <AdminFunctionalRoute
      access={access}
      layout="hub"
      title={rtl ? "بيانات اللاعبين" : "Données des joueurs"}
      description={
        rtl
          ? "بلاغات القراء، البيانات الناقصة، التصحيحات مع مصدرها، وحقوق الصور."
          : "Signalements des fans, données manquantes, corrections avec leur source, et droits des photos."
      }
      testId="admin-pepites-data"
    >
      {access.state === "authorized" ? (
        <PepitesAdminData
          rtl={rtl}
          canCorrect={access.context.permissions.includes("football.correct")}
          tab={tab}
          onTabChange={(next) =>
            void navigate({
              search:
                next === "players"
                  ? { onglet: "joueurs" }
                  : next === "photos"
                    ? { onglet: "photos" }
                    : {},
              replace: true,
            })
          }
        />
      ) : null}
    </AdminFunctionalRoute>
  );
}
