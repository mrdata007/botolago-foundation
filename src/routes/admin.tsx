import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { loadAdminRouteAccess } from "@/backend/admin/route-access.functions";
import {
  getAdminCopy,
  type AdminRouteState,
  type AdminRouteStateName,
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
}: {
  state: AdminRouteStateName | "loading";
  copy: ReturnType<typeof getAdminCopy>;
}) {
  const content = copy.states[state];
  return (
    <main
      dir={copy.dir}
      className="min-h-dvh bg-slate-950 px-4 py-16 text-slate-100"
      data-admin-state={state}
    >
      <section className="mx-auto max-w-2xl rounded-xl border border-slate-800 bg-slate-900 p-6">
        <ShieldCheck className="mb-5 h-8 w-8 text-emerald-400" aria-hidden />
        <p className="text-sm text-slate-400">{copy.subtitle}</p>
        <h1 className="mt-2 text-2xl font-semibold">{content.title}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">{content.description}</p>
      </section>
    </main>
  );
}

function AdminRoute() {
  const result = Route.useLoaderData() as AdminRouteState;
  const { lang } = useI18n();
  const copy = getAdminCopy(lang);
  if (result.state !== "authorized") {
    return <AdminStatePanel state={result.state} copy={copy} />;
  }

  const roleNames = result.context.roles.map((role) => role.name);
  return (
    <main
      dir={copy.dir}
      className="min-h-dvh bg-slate-950 px-4 py-10 text-slate-100"
      data-admin-state="authorized"
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
        </header>

        <section className="mt-6 grid gap-4 md:grid-cols-2">
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
