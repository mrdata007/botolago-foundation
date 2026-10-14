import { createFileRoute, notFound } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { ADMIN_CONSOLE_NAV_ITEMS } from "@/backend/admin/admin-console-contracts";
import { AdminFunctionalRoute } from "@/backend/admin/functional-route";
import type { AdminRouteState } from "@/backend/admin/route-access";
import type { PremiumAdminRepository } from "@/backend/premium/admin";
import { AdminShell, type AdminAuthorized } from "@/components/admin/AdminShell";
import { PlusAdminScreen } from "@/components/admin/plus/PlusAdminScreen";

/**
 * A SAMPLE of the whole Admin shell (the real grouped nav, the real home cards and, one click away,
 * the real memberships page) on invented data, for looking at it and measuring it without a
 * database. Development servers only: anywhere else this route is "not found", and the sample data
 * module is a dynamic import that a production build removes with the `import.meta.env.DEV` branch.
 *
 * `?view=home` (default) or `?view=plus`; `lang`, `reader=1`, `state` and `mode` as on
 * `/dev/plus-admin-sample`. `all=0` shows the nav for a narrower role (memberships only).
 */
type Search = {
  lang?: "fr" | "ar";
  view?: "home" | "plus";
  reader?: "1";
  state?: "error" | "refuse" | "old";
  mode?: "off" | "preview" | "on";
  all?: "0";
};

export const Route = createFileRoute("/dev/admin-shell-sample")({
  ssr: false,
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  validateSearch: (search: Record<string, unknown>): Search => ({
    ...(search.lang === "ar" || search.lang === "fr" ? { lang: search.lang } : {}),
    ...(search.view === "plus" || search.view === "home" ? { view: search.view } : {}),
    ...(String(search.reader) === "1" ? { reader: "1" as const } : {}),
    ...(search.state === "error" || search.state === "refuse" || search.state === "old"
      ? { state: search.state }
      : {}),
    ...(search.mode === "off" || search.mode === "preview" || search.mode === "on"
      ? { mode: search.mode }
      : {}),
    ...(String(search.all) === "0" ? { all: "0" as const } : {}),
  }),
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound();
  },
  component: ShellSample,
});

const SAMPLE_USER = "5a000000-0000-4000-8000-0000000000aa";

function sampleAccess(search: Search): AdminAuthorized {
  const permissions = new Set<string>(
    search.all === "0" ? ["premium.read"] : ADMIN_CONSOLE_NAV_ITEMS.map((item) => item.permission),
  );
  if (search.reader !== "1") permissions.add("premium.grant");
  permissions.add("users.read_support");
  const state = {
    state: "authorized",
    identity: { userId: SAMPLE_USER, emailSummary: "o***@example.test" },
    context: {
      isStaff: true,
      staffPrincipalId: "5a000000-0000-4000-8000-0000000000bb",
      status: "active",
      roles: [{ name: "platform_admin", expiresAt: null }],
      permissions: [...permissions],
      emailVerified: true,
      mfaRequired: true,
      mfaEnrolled: true,
      currentAal: "aal2",
      recentAuthRequired: false,
      recentAuthSufficient: true,
      recentAuthWindowSeconds: 900,
      pendingSessionRevocation: false,
      pendingSessionRevocationCount: 0,
      accessAllowed: true,
      suspended: false,
      revoked: false,
      cachePolicy: "private, no-store",
    },
  } as AdminRouteState;
  return state as AdminAuthorized;
}

function ShellSample() {
  const search = Route.useSearch();
  const lang = search.lang ?? "fr";
  const rtl = lang === "ar";
  const view = search.view ?? "home";
  const access = useMemo(() => sampleAccess(search), [search]);
  const [repository, setRepository] = useState<PremiumAdminRepository | null>(null);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    let cancelled = false;
    void import("@/backend/premium/admin-sample").then(({ InMemoryPremiumAdminRepository }) => {
      if (cancelled) return;
      setRepository(
        new InMemoryPremiumAdminRepository({
          ...(search.mode ? { mode: search.mode } : {}),
          ...(search.state === "error" ? { failOverviewWith: "premium_admin_unavailable" } : {}),
          ...(search.state === "refuse" ? { failWriteWith: "recent_auth_required" } : {}),
          ...(search.state === "old" ? { withoutByProduct: true } : {}),
        }),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [search.state, search.mode]);

  const makeContext = () => ({ actorId: SAMPLE_USER, requestId: crypto.randomUUID() });
  const canGrant = access.context.permissions.includes("premium.grant");

  return (
    <div data-testid="admin-shell-sample">
      <AdminShell
        access={access}
        lang={lang}
        isHome={view === "home"}
        currentRoute={view === "plus" ? "/admin/plus" : undefined}
        premiumRepository={repository ?? undefined}
        makeContext={makeContext}
      >
        {view === "plus" && (
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
            {repository && (
              <PlusAdminScreen
                repository={repository}
                canGrant={canGrant}
                canLookupEmail
                lang={lang}
                makeContext={makeContext}
              />
            )}
          </AdminFunctionalRoute>
        )}
      </AdminShell>
    </div>
  );
}
