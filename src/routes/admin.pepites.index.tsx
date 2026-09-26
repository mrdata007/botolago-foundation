import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { AdminFunctionalLoading, AdminFunctionalRoute } from "@/backend/admin/functional-route";
import { loadAdminPepitesRouteAccess } from "@/backend/admin/route-access.functions";
import { PepitesAdminEditions } from "@/components/pepites/admin/PepitesAdminEditions";
import { useI18n } from "@/i18n/provider";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/admin/pepites/")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): { edition?: string } =>
    typeof search.edition === "string" && UUID.test(search.edition)
      ? { edition: search.edition }
      : {},
  loader: () => loadAdminPepitesRouteAccess(),
  pendingComponent: AdminFunctionalLoading,
  component: AdminPepitesRoute,
});

function AdminPepitesRoute() {
  const access = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/admin/pepites/" });
  const { lang } = useI18n();
  const rtl = lang === "ar";
  return (
    <AdminFunctionalRoute
      access={access}
      layout="hub"
      title={rtl ? "Pépites — توب 10 الأسبوعي" : "Pépites — le Top 10 de la semaine"}
      description={
        rtl
          ? "المسودات، البرمجة، النشر، التصحيحات والسحب. كل خطوة تُسجَّل."
          : "Brouillons, programmation, publication, corrections et retraits. Chaque étape est consignée."
      }
      testId="admin-pepites"
    >
      {access.state === "authorized" ? (
        <PepitesAdminEditions
          rtl={rtl}
          canPublish={access.context.permissions.includes("pepites.publish")}
          selectedId={search.edition ?? null}
          onSelect={(edition) =>
            void navigate({ search: edition ? { edition } : {}, replace: true })
          }
        />
      ) : null}
    </AdminFunctionalRoute>
  );
}
