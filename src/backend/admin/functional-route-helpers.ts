import type { AdminRouteState } from "./route-access";

export const adminFieldClass =
  "min-h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-emerald-400";

export const adminButtonClass =
  "inline-flex min-h-11 items-center justify-center rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 outline-none disabled:cursor-not-allowed disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-emerald-300";

export const adminDangerButtonClass =
  "inline-flex min-h-11 items-center justify-center rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white outline-none disabled:cursor-not-allowed disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-rose-300";

export function adminRepositoryContext(access: Extract<AdminRouteState, { state: "authorized" }>) {
  return {
    actorId: access.identity.userId,
    requestId: crypto.randomUUID(),
  };
}
