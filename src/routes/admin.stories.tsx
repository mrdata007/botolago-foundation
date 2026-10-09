import { createFileRoute } from "@tanstack/react-router";
import { loadAdminNewsReadRouteAccess } from "@/backend/admin/route-access.functions";
import { AdminFunctionalLoading, AdminFunctionalRoute } from "@/backend/admin/functional-route";
import { AdminStoriesEditor } from "@/components/admin/AdminStoriesEditor";
import { useI18n } from "@/i18n/provider";

export const Route = createFileRoute("/admin/stories")({
  ssr: false,
  loader: () => loadAdminNewsReadRouteAccess(),
  pendingComponent: AdminFunctionalLoading,
  component: AdminStoriesRoute,
});
function AdminStoriesRoute() {
  const access = Route.useLoaderData();
  const { lang } = useI18n();
  const ar = lang === "ar";
  return (
    <AdminFunctionalRoute
      access={access}
      layout="hub"
      testId="admin-stories"
      title={ar ? "القصص" : "Stories"}
      description={
        ar
          ? "ارفع صورك وانشر قصص البطولة على الصفحة الرئيسية."
          : "Téléversez vos images et publiez les stories de la Botola sur l’accueil."
      }
    >
      {access.state === "authorized" && (
        <AdminStoriesEditor permissions={access.context.permissions} />
      )}
    </AdminFunctionalRoute>
  );
}
