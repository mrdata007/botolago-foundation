import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { ClipboardCheck, KeyRound, ScrollText, UserCog, type LucideIcon } from "lucide-react";
import {
  ADMIN_CONSOLE_NAV_ITEMS,
  ADMIN_STATE_TEST_IDS,
} from "@/backend/admin/admin-console-contracts";
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
import { ADMIN_CARD_CLASS, AdminDatum, AdminSummaryCard } from "@/components/admin/AdminSurfaces";
import { AdminAnalyticsDashboard } from "@/components/admin/AdminAnalyticsDashboard";
import { LanguageSwitcher } from "@/components/shell/LanguageSwitcher";
import { ui, UiBadge, UiCard, UiLinkButton } from "@/components/ui-kit";
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
 * too. With dark mode off in the product (`DARK_MODE_ENABLED`), this is the
 * light theme; if it is ever switched on, the console follows it.
 *
 * The content column, the top bar and the section row share one width, so
 * the wordmark, the first chip and the page title line up on a wide screen.
 */
const ADMIN_COLUMN = cn("mx-auto w-full max-w-4xl", ui.space.gutter);

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

  const rtl = copy.dir === "rtl";
  const roleNames = result.context.roles.map((role) => role.name);
  return (
    <div
      dir={copy.dir}
      className={cn("min-h-dvh", ui.surface.page)}
      data-admin-state="authorized"
      data-testid="admin-shell"
    >
      {/* The top bar is the app's own: an opaque bar with a hairline, the
          wordmark at the inline start and the round "FR" / "ع" button at the
          end. It does not stick: the article editor pins its own toolbar to
          the top, and two sticky bars would take a phone's screen between
          them. */}
      <header className={cn(ui.surface.bar, ui.rule.block)}>
        <div className={cn(ADMIN_COLUMN, "flex min-h-[var(--ui-row-min)] items-center gap-2 py-2")}>
          {/* The wordmark goes back to the site, as a wordmark does. */}
          <Link
            to="/"
            aria-label={rtl ? "BotolaGO — العودة إلى الموقع" : "BotolaGO — retour au site"}
            className={cn("inline-flex min-h-[var(--ui-tap-min)] items-center", ui.focus)}
          >
            <Logo size="sm" />
          </Link>
          <h1 className="sr-only">{copy.title}</h1>
          <span aria-hidden>
            <UiBadge tone="outline">{rtl ? "الإدارة" : "Admin"}</UiBadge>
          </span>
          <div className="ms-auto">
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      {/* The sections, as the round chips the app filters with: sunken at
          rest, white on navy for the current one. The row scrolls sideways on
          a phone rather than wrapping into a block of pills. */}
      <nav
        className={cn(ui.surface.bar, ui.rule.block)}
        aria-label={rtl ? "أقسام الإدارة" : "Sections administratives"}
        data-testid="admin-navigation"
      >
        <div className={cn(ADMIN_COLUMN, "flex gap-2 overflow-x-auto py-2 [scrollbar-width:none]")}>
          {/* Filtered on the caller's own permissions, and driven entirely by
              the contract list -- a new nav entry appears here on its own. */}
          {ADMIN_CONSOLE_NAV_ITEMS.filter((item) =>
            result.context.permissions.includes(item.permission),
          ).map((item) => (
            <Link
              key={item.route}
              to={item.route}
              // The current section is painted through `data-[status=active]:`
              // rather than `activeProps`: `activeProps.className` is APPENDED
              // to `className`, so both sets would land on the element and
              // Tailwind's emission order would pick the winner. TanStack's
              // Link sets `data-status="active"` and `aria-current="page"`
              // itself; as an attribute selector the active paint outranks
              // the resting one on specificity.
              className={cn(
                "inline-flex shrink-0 items-center justify-center px-4 transition-colors",
                ui.space.tap,
                ui.radius.full,
                ui.text.meta,
                "[font-weight:var(--ui-weight-strong)]",
                ui.surface.sunken,
                "data-[status=active]:bg-[color:var(--ui-ink)] data-[status=active]:text-[color:var(--ui-on-ink-plain)]",
                "data-[status=active]:shadow-[var(--ui-shadow-card)]",
                ui.focus,
              )}
              data-testid={item.testId}
            >
              {item.labels[lang]}
            </Link>
          ))}
        </div>
      </nav>

      <main className={cn(ADMIN_COLUMN, "pb-16")}>
        {isAdminRoot && (
          <>
            {/* The numbers first: what the owner opens the console to see.
                Only for staff holding analytics.read; the database checks it
                again on every call. */}
            {result.context.permissions.includes("analytics.read") && (
              <AdminAnalyticsDashboard access={result} />
            )}

            <section className="mt-8" aria-labelledby="admin-context-heading">
              {/* Section headings in the display face, like "À venir" and
                  "Classement" on the home screen. */}
              <h2 id="admin-context-heading" className={ui.display.section}>
                {copy.labels.contextHeading}
              </h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2" data-testid="admin-home">
                <AdminSummaryCard title={copy.labels.identity}>
                  {/* A masked address and a UUID are both LTR data: only the
                      value is forced, the label keeps the ambient direction. */}
                  <AdminDatum>{result.identity.emailSummary ?? result.identity.userId}</AdminDatum>
                </AdminSummaryCard>
                <AdminSummaryCard title={copy.labels.roles}>
                  <p className="break-words">
                    {roleNames.length > 0 ? (
                      <AdminDatum mono={false}>{roleNames.join(", ")}</AdminDatum>
                    ) : (
                      copy.labels.none
                    )}
                  </p>
                </AdminSummaryCard>
                <AdminSummaryCard title={copy.labels.permissions}>
                  {/* A figure a reader scans, so it is on the stat ramp. */}
                  <p className={ui.stat.lg}>{result.context.permissions.length}</p>
                </AdminSummaryCard>
                <AdminSummaryCard title={copy.labels.security}>
                  <p className="flex flex-wrap items-center gap-2">
                    {/* Not a `UiBadge`: the badge is uppercase label type, and
                        this is a VALUE rather than a status word -- "AAL2 · 15
                        min" would be rendered "AAL2 · 15 MIN". */}
                    <AdminDatum
                      mono={false}
                      className={cn(
                        ui.surface.sunken,
                        ui.radius.tight,
                        "px-2 py-0.5",
                        ui.text.secondary,
                        "[font-weight:var(--ui-weight-heavy)]",
                        ui.tone.positive,
                      )}
                    >
                      {`AAL2 · ${result.context.recentAuthWindowSeconds / 60} min`}
                    </AdminDatum>
                  </p>
                  <p className={cn("mt-2", ui.text.meta, ui.tone.muted)}>
                    {copy.labels.pendingRevocation}
                    {" : "}
                    <span className={cn(ui.stat.sm, ui.tone.default)}>
                      {result.context.pendingSessionRevocationCount}
                    </span>
                  </p>
                </AdminSummaryCard>
              </div>
            </section>

            <section className="mt-8" aria-labelledby="admin-modules-heading">
              <h2 id="admin-modules-heading" className={ui.display.section}>
                {copy.labels.modulesHeading}
              </h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {copy.sections.map((section, index) => {
                  const Icon = SECTION_ICONS[index % SECTION_ICONS.length];
                  return (
                    <UiCard
                      key={section}
                      as="article"
                      padding="md"
                      className="flex items-center gap-3"
                    >
                      {/* The icon disc of the app's list rows (Profile →
                          Langue): decorative and `aria-hidden`, so not a
                          control, and the 40px disc it is drawn as. */}
                      <span
                        className={cn(
                          "grid h-10 w-10 shrink-0 place-items-center",
                          ui.radius.full,
                          ui.surface.sunken,
                          ui.tone.ink,
                        )}
                        aria-hidden
                      >
                        <Icon className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <h3 className={cn(ui.text.bodyStrong, ui.tone.default)}>{section}</h3>
                      </div>
                    </UiCard>
                  );
                })}
              </div>
            </section>
          </>
        )}
        <Outlet />
      </main>
    </div>
  );
}

/** Module icons, positional and wrapped, so a shorter or longer `sections`
 *  list can never index past the end. */
const SECTION_ICONS: readonly LucideIcon[] = [UserCog, ClipboardCheck, ScrollText, KeyRound];
