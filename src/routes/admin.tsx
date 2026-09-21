import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import {
  ADMIN_CONSOLE_NAV_ITEMS,
  ADMIN_STATE_TEST_IDS,
} from "@/backend/admin/admin-console-contracts";
import { loadAdminRouteAccess } from "@/backend/admin/route-access.functions";
import {
  getAdminCopy,
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
  const reference = [state, reason, detail].filter(Boolean).join("/");

  // Nothing here implicates the reader's credential: either the server could
  // not reach a verdict on it, or the failure came from the control plane
  // after it had already been accepted. Signing in again would not help, and
  // saying "session expired" would be a false diagnosis.
  const serverSideFailure =
    state === "unauthenticated" &&
    (detail === "unverifiable" || reason === "backend_unauthenticated");

  const content = !serverSideFailure
    ? state === "unauthenticated" && reason === "invalid_token"
      ? copy.invalidToken
      : copy.states[state]
    : copy.verificationUnavailable;

  // Every state a sign-in can actually clear needs a way to sign in.
  // "unauthenticated" previously rendered a dead end: the copy asked the reader
  // to connect, with no link to do it. It must stay off where signing in is
  // not the remedy.
  const showSignIn =
    (state === "unauthenticated" && !serverSideFailure) ||
    state === "recent_auth_required" ||
    state === "mfa_required";
  return (
    <main
      dir={copy.dir}
      className="min-h-dvh bg-slate-950 px-4 py-16 text-slate-100"
      data-admin-state={state}
      data-testid={ADMIN_STATE_TEST_IDS[state]}
    >
      <section className="mx-auto max-w-2xl rounded-xl border border-slate-800 bg-slate-900 p-6">
        <ShieldCheck className="mb-5 h-8 w-8 text-emerald-400" aria-hidden />
        <p className="text-sm text-slate-400">{copy.subtitle}</p>
        <h1 className="mt-2 text-2xl font-semibold">{content.title}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">{content.description}</p>
        {showSignIn && (
          <Link
            to="/auth/login"
            search={{ next: "/admin" }}
            className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
            data-testid="admin-reauthenticate"
          >
            {copy.dir === "rtl" ? "إعادة المصادقة" : "Se réauthentifier"}
          </Link>
        )}
        {state !== "loading" && state !== "authorized" && (
          <p className="mt-6 text-xs text-slate-500" data-testid="admin-state-reference">
            {copy.referenceLabel}
            {" : "}
            {/* Only the value is forced LTR, so the label keeps its logical
                position for a screen reader and survives copy/paste. Mirroring
                the whole string by hand renders correctly and reads backwards. */}
            <bdi dir="ltr" className="font-mono">
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
      className="min-h-dvh bg-slate-950 px-4 py-10 text-slate-100"
      data-admin-state="authorized"
      data-testid="admin-shell"
    >
      <div className="mx-auto max-w-5xl">
        <header className="rounded-xl border border-slate-800 bg-slate-900 p-6">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-8 w-8 text-emerald-400" aria-hidden />
            <div>
              <p className="text-sm text-slate-400">{copy.subtitle}</p>
              <h1 className="text-2xl font-semibold">{copy.title}</h1>
            </div>
          </div>
          <nav
            className="mt-5 flex flex-wrap gap-2"
            aria-label={copy.dir === "rtl" ? "أقسام الإدارة" : "Sections administratives"}
            data-testid="admin-navigation"
          >
            {ADMIN_CONSOLE_NAV_ITEMS.filter((item) =>
              result.context.permissions.includes(item.permission),
            ).map((item) => (
              <Link
                key={item.route}
                to={item.route}
                className="inline-flex min-h-11 items-center rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium outline-none hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-emerald-400"
                activeProps={{ className: "border-emerald-500 bg-emerald-500/10" }}
                data-testid={item.testId}
              >
                {item.labels[lang]}
              </Link>
            ))}
          </nav>
        </header>

        {isAdminRoot && (
          <>
            <section className="mt-6 grid gap-4 md:grid-cols-2" data-testid="admin-home">
              <SafeCard title={copy.labels.identity}>
                <p>{result.identity.emailSummary ?? result.identity.userId}</p>
              </SafeCard>
              <SafeCard title={copy.labels.roles}>
                <p>{roleNames.length > 0 ? roleNames.join(", ") : copy.labels.none}</p>
              </SafeCard>
              <SafeCard title={copy.labels.permissions}>
                <p>{result.context.permissions.length}</p>
              </SafeCard>
              <SafeCard title={copy.labels.security}>
                <p>AAL2 · {result.context.recentAuthWindowSeconds / 60} min</p>
                <p className="mt-1 text-xs text-slate-400">
                  {copy.labels.pendingRevocation}: {result.context.pendingSessionRevocationCount}
                </p>
              </SafeCard>
            </section>

            <section className="mt-6 grid gap-3 sm:grid-cols-2" aria-label={copy.title}>
              {copy.sections.map((section) => (
                <div
                  key={section}
                  className="rounded-lg border border-dashed border-slate-700 bg-slate-900/60 p-4 text-sm text-slate-300"
                >
                  {section}
                </div>
              ))}
            </section>
          </>
        )}
        <Outlet />
      </div>
    </main>
  );
}

function SafeCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="rounded-lg border border-slate-800 bg-slate-900 p-4">
      <h2 className="text-sm font-medium text-slate-400">{title}</h2>
      <div className="mt-2 break-all text-sm text-slate-100">{children}</div>
    </article>
  );
}
