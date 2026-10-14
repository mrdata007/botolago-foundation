import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";

import { AdminFunctionalLoading, AdminFunctionalRoute } from "@/backend/admin/functional-route";
import { adminRepositoryContext } from "@/backend/admin/functional-route-helpers";
import { loadAdminPlusRouteAccess } from "@/backend/admin/route-access.functions";
import { SupabasePremiumAdminRepository } from "@/backend/premium/admin";
import { PlusAdminScreen } from "@/components/admin/plus/PlusAdminScreen";
import { useI18n } from "@/i18n/provider";

export const Route = createFileRoute("/admin/plus")({
  ssr: false,
  loader: () => loadAdminPlusRouteAccess(),
  pendingComponent: AdminFunctionalLoading,
  component: AdminPlusRoute,
});

/**
 * BotolaGO+ memberships. The loader lets in staff holding premium.read (MFA is part of the shell's
 * own access check); granting and revoking are offered only with premium.grant, and the database
 * checks both, recent authentication and the audit on every call.
 */
function AdminPlusRoute() {
  const access = Route.useLoaderData();
  const { lang } = useI18n();
  const rtl = lang === "ar";
  const repository = useMemo(() => new SupabasePremiumAdminRepository(), []);
  const authorized = access.state === "authorized" ? access : null;
  const makeContext = useCallback(
    () => adminRepositoryContext(authorized as NonNullable<typeof authorized>),
    [authorized],
  );

  return (
    <AdminFunctionalRoute
      access={access}
      layout="hub"
      title={rtl ? "الاشتراكات" : "Abonnements"}
      description={
        rtl
          ? "أعداد الأعضاء، والبحث عن عضو، ومنح العضوية أو سحبها. يُسجَّل كل اطلاع وكل قرار في التدقيق."
          : "Les chiffres des membres, la consultation d’un membre, l’offre ou le retrait d’un abonnement. Chaque consultation et chaque décision est consignée dans l’audit."
      }
      testId="admin-plus"
    >
      {authorized && (
        <PlusAdminScreen
          repository={repository}
          canGrant={authorized.context.permissions.includes("premium.grant")}
          lang={lang}
          makeContext={makeContext}
        />
      )}
    </AdminFunctionalRoute>
  );
}
