import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { useMemo } from "react";
import { ADMIN_STATE_TEST_IDS } from "@/backend/admin/admin-console-contracts";
import { adminRepositoryContext } from "@/backend/admin/functional-route-helpers";
import { loadAdminRouteAccess } from "@/backend/admin/route-access.functions";
import {
  getAdminCopy,
  selectAdminPanel,
  type AdminRouteState,
  type AdminRouteStateName,
  type UnauthenticatedDetail,
  type UnauthenticatedReason,
} from "@/backend/admin/route-access";
import { Logo } from "@/components/brand/Logo";
import { SupabasePremiumAdminRepository } from "@/backend/premium/admin";
import { ADMIN_CARD_CLASS, AdminDatum } from "@/components/admin/AdminSurfaces";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminAnalyticsDashboard } from "@/components/admin/AdminAnalyticsDashboard";
import { LanguageSwitcher } from "@/components/shell/LanguageSwitcher";
import { ui, UiLinkButton } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin")({
  ssr: false,
  // Every CMS/Admin page, children included: never indexed, never followed.
  // robots.txt disallows /admin as well; this covers a crawler that ignores it.
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  loader: () => loadAdminRouteAccess(),
  pendingComponent: AdminLoadingShell,
  component: AdminRoute,
});

// The card surface, micro-label and summary card live in
// `@/components/admin/AdminSurfaces`, shared with the sub-pages that render
// inside this shell's <Outlet />. One definition only.

/**
 * The Admin console wears BotolaGO's own look (Option A), not a register of
 * its own: the light page, a white top bar with the wordmark, round chips for
 * its sections, white 14px cards, titles in the display face.
 *
 * It used to be a dark operator's console, kept dark by a `dark` class on
 * this file's two outermost elements. Every Admin surface was already on the
 * `--ui-*` tokens, so taking that class off is what moved the whole console
 * -- the CMS and the security pages alike -- onto the product's look; the
 * one surface on literal greys, `AdminFunctionalRoute`, is on the kit now
 * too. It follows the product's theme: light, or dark since dark mode was
 * switched on (BG-0149, `DARK_MODE_ENABLED`), with the white wordmark and
 * the selected fill (`--ui-selected`) on the current section's chip.
 *
 * The shell itself (top bar, grouped section chips, home cards) is
 * `components/admin/AdminShell.tsx`, shared with the development sample.
 */

function AdminLoadingShell() {
  const { lang } = useI18n();
  const copy = getAdminCopy(lang);
  return <AdminStatePanel state="loading" copy={copy} />;
}

function AdminStatePanel({
  state,
  copy,
  reason,
  detail,
}: {
  state: AdminRouteStateName | "loading";
  copy: ReturnType<typeof getAdminCopy>;
  reason?: UnauthenticatedReason;
  detail?: UnauthenticatedDetail;
}) {
  // A support reference, so a refused sign-in can be reported and diagnosed
  // from what is on screen. It names only the outcome and the caller's own
  // credential -- never an account, a role, or whether either exists.
  const { content, showSignIn, reference } = selectAdminPanel(state, copy, reason, detail);
  return (
    <main
      dir={copy.dir}
      className={cn("grid min-h-dvh place-items-center py-12", ui.surface.page, ui.space.gutter)}
      data-admin-state={state}
      data-testid={ADMIN_STATE_TEST_IDS[state]}
    >
      <section className={cn("w-full max-w-xl p-6 sm:p-8", ADMIN_CARD_CLASS)}>
        {/* The wordmark says whose door this is; the display face carries
            the one thing the panel has to say. */}
        <Logo size="sm" />
        <h1 className={cn("mt-6", ui.display.section)}>{content.title}</h1>
        <p className={cn("mt-2", ui.text.secondary, ui.tone.muted)}>{content.description}</p>
        {showSignIn && (
          // The one action on a refusal panel, so it takes the action
          // gradient. `size="sm"` is the inline control at `--ui-tap-min`;
          // `w-full sm:w-auto` keeps it thumb-width on a phone.
          <UiLinkButton
            to="/auth/login"
            search={{ next: "/admin" }}
            size="sm"
            className="mt-6 w-full sm:w-auto"
            data-testid="admin-reauthenticate"
          >
            {copy.dir === "rtl" ? "إعادة المصادقة" : "Se réauthentifier"}
          </UiLinkButton>
        )}
        {state !== "loading" && state !== "authorized" && (
          <p
            className={cn(
              "mt-7 flex flex-wrap items-center gap-x-2 gap-y-1 pt-4",
              ui.rule.blockStart,
              ui.text.meta,
              ui.tone.faint,
            )}
            data-testid="admin-state-reference"
          >
            <span>
              {copy.referenceLabel}
              {" : "}
            </span>
            {/* Only the value is forced LTR, so the label keeps its logical
                position for a screen reader and survives copy/paste. That rule
                is <AdminDatum>'s whole job. */}
            <AdminDatum className={cn(ui.surface.sunken, ui.radius.tight, "px-2 py-0.5")}>
              {reference}
            </AdminDatum>
          </p>
        )}
      </section>
    </main>
  );
}

function AdminRoute() {
  const result = Route.useLoaderData() as AdminRouteState;
  const { lang } = useI18n();
  const copy = getAdminCopy(lang);
  const isAdminRoot = useRouterState({
    select: (state) => state.location.pathname === "/admin",
  });
  // The memberships card reads the existing overview; the repository is built only for staff who
  // may open that page (the database checks premium.read again on the call).
  const premiumRepository = useMemo(
    () =>
      result.state === "authorized" && result.context.permissions.includes("premium.read")
        ? new SupabasePremiumAdminRepository()
        : undefined,
    [result],
  );
  if (result.state !== "authorized") {
    return (
      <AdminStatePanel
        state={result.state}
        copy={copy}
        reason={result.state === "unauthenticated" ? result.reason : undefined}
        detail={result.state === "unauthenticated" ? result.detail : undefined}
      />
    );
  }

  return (
    <AdminShell
      access={result}
      lang={lang}
      isHome={isAdminRoot}
      headerEnd={<LanguageSwitcher />}
      analytics={
        /* The numbers first: what the owner opens the console to see. Only for staff holding
           analytics.read; the database checks it again on every call. */
        result.context.permissions.includes("analytics.read") ? (
          <AdminAnalyticsDashboard access={result} />
        ) : undefined
      }
      premiumRepository={premiumRepository}
      makeContext={() => adminRepositoryContext(result)}
    >
      <Outlet />
    </AdminShell>
  );
}
