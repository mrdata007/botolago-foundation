import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  ClipboardCheck,
  KeyRound,
  ScrollText,
  ShieldCheck,
  UserCog,
  type LucideIcon,
} from "lucide-react";
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
import {
  ADMIN_CARD_CLASS,
  ADMIN_LABEL_CLASS,
  AdminDatum,
  AdminIconTile,
  AdminSummaryCard,
} from "@/components/admin/AdminSurfaces";
import { ui, UiCard, UiLinkButton } from "@/components/ui-kit";
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

// The card surface, micro-label, icon tile and summary card now live in
// `@/components/admin/AdminSurfaces`, shared with the five security
// sub-pages that render inside this shell's <Outlet />. One definition only.

/**
 * The Admin console stays dark, and it stays dark on tokens.
 *
 * It is not a page of the product: it is an operator's console, read beside a
 * terminal, and the ruling is that it keeps its dark register while the
 * product's screens follow the theme. That register is expressed as SCOPE
 * rather than as hardcoded greys. `src/styles.css` redeclares every
 * colour-bearing `--ui-*` token inside a plain `.dark { … }` block, and custom
 * properties inherit, so putting `dark` on the console's outermost element
 * hands the dark values to everything underneath it -- the shared surfaces in
 * `AdminSurfaces`, the nine sub-routes rendered through <Outlet />, and every
 * kit primitive any of them use.
 *
 * Both states need it, because they are two different roots: the refusal /
 * loading panel is its own <main>, and a `dark` on the authorized shell alone
 * would leave an unauthenticated operator looking at a light card. Verified by
 * rendering both and reading `--ui-page` inside the scope (oklch(0.15 0.03
 * 260), the dark value) against outside it (oklch(0.975 0.004 250)).
 *
 * The one thing `dark` cannot reach is `AdminFunctionalRoute` /
 * `AdminFunctionalLoading` in `src/backend/admin/functional-route.tsx`, which
 * wraps seven admin routes in a literal slate-900/amber section. `src/backend`
 * is owned elsewhere. Those tones still read correctly under a dark console,
 * which is part of why the ruling went this way.
 */
const ADMIN_DARK_SCOPE = "dark";

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
      className={cn(
        ADMIN_DARK_SCOPE,
        "grid min-h-dvh place-items-center py-12",
        ui.surface.page,
        ui.space.gutter,
      )}
      data-admin-state={state}
      data-testid={ADMIN_STATE_TEST_IDS[state]}
    >
      <section className={`w-full max-w-xl ${ADMIN_CARD_CLASS} p-6 sm:p-8`}>
        <AdminIconTile icon={ShieldCheck} />
        {/* `ui.text.title` is the ramp's screen-header step. The `text-2xl` it
            replaces (24px) is between two steps and was not one of them; the
            `ltr:tracking-tight` goes with it, because the type ramp owns
            tracking now and only the stat ramp tightens. */}
        <h1 className={cn("mt-5", ui.text.title)}>{content.title}</h1>
        <p className={cn("mt-3", ui.text.secondary, ui.tone.muted)}>{content.description}</p>
        {showSignIn && (
          // The one action on a refusal panel, so it takes the action
          // gradient. `size="sm"` is the inline control at `--ui-tap-min`,
          // which is the same 44px the literal `min-h-11` was asking for;
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
                position for a screen reader and survives copy/paste. Mirroring
                the whole string by hand renders correctly and reads backwards.
                That rule is <AdminDatum>'s whole job, so the hand-written
                <bdi> is now one: same element, same `dir`, same mono face. */}
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

  const roleNames = result.context.roles.map((role) => role.name);
  return (
    <main
      dir={copy.dir}
      className={cn(ADMIN_DARK_SCOPE, "min-h-dvh py-8 sm:py-10", ui.surface.page, ui.space.gutter)}
      data-admin-state="authorized"
      data-testid="admin-shell"
    >
      <div className="mx-auto max-w-5xl">
        <header className={`${ADMIN_CARD_CLASS} p-5 sm:p-6`}>
          <div className="flex items-center gap-3">
            <AdminIconTile icon={ShieldCheck} />
            {/* One ramp step, not `text-xl sm:text-2xl`. The ramp is the
                responsive answer: `--ui-text-title` is the screen-header size
                at every width, and a breakpoint bump is a second size the
                system does not declare. */}
            <h1 className={cn("min-w-0", ui.text.title)}>{copy.title}</h1>
          </div>
          <nav
            className={cn("mt-5 flex flex-wrap gap-2 pt-5", ui.rule.blockStart)}
            aria-label={copy.dir === "rtl" ? "أقسام الإدارة" : "Sections administratives"}
            data-testid="admin-navigation"
          >
            {/* Filtered on the caller's own permissions, and driven entirely by
                the contract list -- a new nav entry appears here on its own. */}
            {ADMIN_CONSOLE_NAV_ITEMS.filter((item) =>
              result.context.permissions.includes(item.permission),
            ).map((item) => (
              <Link
                key={item.route}
                to={item.route}
                // The current section used to be styled through `activeProps`,
                // and it did not work: `activeProps.className` is APPENDED to
                // `className`, so both sets land on the element and Tailwind's
                // emission order decides the winner. Measured in this project's
                // own build, `.text-emerald-200` and `.bg-emerald-500/10` are
                // both emitted BEFORE `.text-slate-200` and `.bg-slate-900/60`,
                // so the resting colours won and the active entry rendered
                // identically to its neighbours. `data-[status=active]:` is the
                // same state -- TanStack's Link sets `data-status="active"` and
                // `aria-current="page"` itself, independently of activeProps --
                // but as an attribute selector it outranks the resting utility
                // on specificity rather than on emission order. The accessible
                // state is unchanged; only the paint now follows it.
                className={cn(
                  "inline-flex items-center px-4 transition-colors",
                  ui.space.tap,
                  ui.radius.control,
                  ui.text.meta,
                  "[font-weight:var(--ui-weight-strong)]",
                  ui.surface.sunken,
                  ui.tone.muted,
                  "data-[status=active]:bg-[color:var(--ui-ink)] data-[status=active]:text-[color:var(--ui-on-ink)]",
                  ui.focus,
                )}
                data-testid={item.testId}
              >
                {item.labels[lang]}
              </Link>
            ))}
          </nav>
        </header>

        {isAdminRoot && (
          <>
            <section className="mt-8" aria-labelledby="admin-context-heading">
              <h2 id="admin-context-heading" className={ADMIN_LABEL_CLASS}>
                {copy.labels.contextHeading}
              </h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2" data-testid="admin-home">
                <AdminSummaryCard title={copy.labels.identity}>
                  {/* A masked address and a UUID are both LTR data: only the
                      value is forced, the label keeps the ambient direction.
                      That is <AdminDatum>, so the hand-written <bdi> is one --
                      it already carries `dir="ltr"`, the mono face and the
                      break-all these values need. */}
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
                  {/* A figure a reader scans, so it is on the stat ramp
                      (rule 4) rather than on `text-2xl` + a hand-rolled
                      `tabular-nums`. */}
                  <p className={ui.stat.lg}>{result.context.permissions.length}</p>
                </AdminSummaryCard>
                <AdminSummaryCard title={copy.labels.security}>
                  <p className="flex flex-wrap items-center gap-2">
                    {/* Not a `UiBadge`: the badge tone is the label type,
                        which is uppercase, and this is a VALUE rather than a
                        status word -- "AAL2 · 30 min" would be rendered
                        "AAL2 · 30 MIN". So it stays a datum on the sunken
                        surface, and only the emerald foreground becomes the
                        token that means the same thing, `--ui-positive`. */}
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
              <h2 id="admin-modules-heading" className={ADMIN_LABEL_CLASS}>
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
                      className="flex items-start gap-3"
                    >
                      <span
                        className={cn(
                          // Decorative and `aria-hidden`, so it is not a
                          // control and rule 5's 44px floor does not apply:
                          // this stays the 36px glyph plate it was drawn as.
                          "grid h-9 w-9 shrink-0 place-items-center",
                          ui.radius.control,
                          ui.surface.sunken,
                          ui.tone.muted,
                        )}
                        aria-hidden
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      {/* No "coming soon" badge: every module listed here is
                          shipped and linked in the nav directly above, so the
                          badge told an admin their own working tools were
                          unavailable. */}
                      <div className="min-w-0 flex-1">
                        <h3
                          className={cn(
                            ui.text.secondary,
                            "[font-weight:var(--ui-weight-heavy)]",
                            ui.tone.default,
                          )}
                        >
                          {section}
                        </h3>
                      </div>
                    </UiCard>
                  );
                })}
              </div>
            </section>
          </>
        )}
        <Outlet />
      </div>
    </main>
  );
}

/** Module icons, positional and wrapped, so a shorter or longer `sections`
 *  list can never index past the end. */
const SECTION_ICONS: readonly LucideIcon[] = [UserCog, ClipboardCheck, ScrollText, KeyRound];
