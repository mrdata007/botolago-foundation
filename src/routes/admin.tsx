import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  ClipboardCheck,
  KeyRound,
  ScrollText,
  ShieldCheck,
  UserCog,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
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
import { useI18n } from "@/i18n/provider";

export const Route = createFileRoute("/admin")({
  ssr: false,
  loader: () => loadAdminRouteAccess(),
  pendingComponent: AdminLoadingShell,
  component: AdminRoute,
});

/** Shared card surface, so every Admin panel reads as one set. */
const ADMIN_CARD_CLASS =
  "rounded-2xl border border-slate-800 bg-slate-900/70 shadow-lg shadow-slate-950/40";

/** Small uppercase label above a value; `tracking-wide` only, since Arabic
 *  letterforms join and must not be spaced apart. */
const ADMIN_LABEL_CLASS = "text-[11px] font-semibold uppercase tracking-wide text-slate-400";

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
      className="grid min-h-dvh place-items-center bg-slate-950 px-4 py-12 text-slate-100"
      data-admin-state={state}
      data-testid={ADMIN_STATE_TEST_IDS[state]}
    >
      <section className={`w-full max-w-xl ${ADMIN_CARD_CLASS} p-6 sm:p-8`}>
        <AdminIconTile icon={ShieldCheck} />
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">{content.title}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">{content.description}</p>
        {showSignIn && (
          <Link
            to="/auth/login"
            search={{ next: "/admin" }}
            className="mt-6 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 outline-none transition-colors hover:bg-emerald-400 focus-visible:ring-2 focus-visible:ring-emerald-300 sm:w-auto"
            data-testid="admin-reauthenticate"
          >
            {copy.dir === "rtl" ? "إعادة المصادقة" : "Se réauthentifier"}
          </Link>
        )}
        {state !== "loading" && state !== "authorized" && (
          <p
            className="mt-7 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-slate-800 pt-4 text-xs text-slate-500"
            data-testid="admin-state-reference"
          >
            <span>
              {copy.referenceLabel}
              {" : "}
            </span>
            {/* Only the value is forced LTR, so the label keeps its logical
                position for a screen reader and survives copy/paste. Mirroring
                the whole string by hand renders correctly and reads backwards. */}
            <bdi
              dir="ltr"
              className="rounded-md bg-slate-800/70 px-2 py-0.5 font-mono text-slate-300"
            >
              {reference}
            </bdi>
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
      className="min-h-dvh bg-slate-950 px-4 py-8 text-slate-100 sm:py-10"
      data-admin-state="authorized"
      data-testid="admin-shell"
    >
      <div className="mx-auto max-w-5xl">
        <header className={`${ADMIN_CARD_CLASS} p-5 sm:p-6`}>
          <div className="flex items-center gap-3">
            <AdminIconTile icon={ShieldCheck} />
            <h1 className="min-w-0 text-xl font-semibold tracking-tight sm:text-2xl">
              {copy.title}
            </h1>
          </div>
          <nav
            className="mt-5 flex flex-wrap gap-2 border-t border-slate-800 pt-5"
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
                className="inline-flex min-h-11 items-center rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-2 text-sm font-medium text-slate-200 outline-none transition-colors hover:border-slate-600 hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-emerald-400"
                activeProps={{
                  className: "border-emerald-500 bg-emerald-500/10 text-emerald-200",
                }}
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
                <SafeCard title={copy.labels.identity}>
                  {/* A masked address and a UUID are both LTR data: only the
                      value is forced, the label keeps the ambient direction. */}
                  <bdi dir="ltr" className="block break-all font-mono text-sm">
                    {result.identity.emailSummary ?? result.identity.userId}
                  </bdi>
                </SafeCard>
                <SafeCard title={copy.labels.roles}>
                  <p className="break-words">
                    {roleNames.length > 0 ? (
                      <bdi dir="ltr">{roleNames.join(", ")}</bdi>
                    ) : (
                      copy.labels.none
                    )}
                  </p>
                </SafeCard>
                <SafeCard title={copy.labels.permissions}>
                  <p className="text-2xl font-semibold tabular-nums">
                    {result.context.permissions.length}
                  </p>
                </SafeCard>
                <SafeCard title={copy.labels.security}>
                  <p className="flex flex-wrap items-center gap-2">
                    <bdi
                      dir="ltr"
                      className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-sm font-semibold text-emerald-300"
                    >
                      {`AAL2 · ${result.context.recentAuthWindowSeconds / 60} min`}
                    </bdi>
                  </p>
                  <p className="mt-2 text-xs text-slate-400">
                    {copy.labels.pendingRevocation}
                    {" : "}
                    <span className="font-semibold text-slate-200 tabular-nums">
                      {result.context.pendingSessionRevocationCount}
                    </span>
                  </p>
                </SafeCard>
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
                    <article
                      key={section}
                      className="flex items-start gap-3 rounded-2xl border border-slate-800 bg-slate-900/40 p-4"
                    >
                      <span
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-800/80 text-slate-300"
                        aria-hidden
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-semibold text-slate-100">{section}</h3>
                        <span className="mt-2 inline-flex items-center rounded-full border border-slate-700 px-2 py-0.5 text-[11px] font-medium text-slate-400">
                          {copy.labels.soon}
                        </span>
                      </div>
                    </article>
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

function AdminIconTile({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span
      className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
      aria-hidden
    >
      <Icon className="h-5 w-5" />
    </span>
  );
}

function SafeCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className={`${ADMIN_CARD_CLASS} p-4`}>
      <h3 className={ADMIN_LABEL_CLASS}>{title}</h3>
      <div className="mt-2 min-w-0 text-sm text-slate-100">{children}</div>
    </article>
  );
}
