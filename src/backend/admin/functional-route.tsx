import type { ReactNode } from "react";
import type { AdminRouteState } from "./route-access";

export function AdminFunctionalRoute({
  access,
  title,
  description,
  children,
}: {
  access: AdminRouteState;
  title: string;
  description: string;
  children: ReactNode;
}) {
  if (access.state !== "authorized") {
    return (
      <section
        className="mt-6 rounded-xl border border-amber-700/60 bg-amber-950/30 p-5"
        role="alert"
        data-admin-state={access.state}
      >
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mt-2 text-sm text-amber-100">{description}</p>
      </section>
    );
  }
  return (
    <section className="mt-6 rounded-xl border border-slate-800 bg-slate-900 p-5">
      <header>
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-300">{description}</p>
      </header>
      <div className="mt-6">{children}</div>
    </section>
  );
}

export function AdminFunctionalLoading() {
  return (
    <section
      className="mt-6 min-h-28 animate-pulse rounded-xl border border-slate-800 bg-slate-900 p-5"
      aria-label="Loading"
    />
  );
}
