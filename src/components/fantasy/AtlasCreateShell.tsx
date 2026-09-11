import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Check, Shield } from "lucide-react";
import type { ReactNode } from "react";

import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

const steps = [
  {
    number: 1,
    label: "fantasy.atlas.create.step.identity" as const,
  },
  {
    number: 2,
    label: "fantasy.atlas.create.step.squad" as const,
  },
  {
    number: 3,
    label: "fantasy.atlas.create.step.review" as const,
  },
];

export function AtlasCreateShell({
  step,
  title,
  description,
  backTo,
  children,
}: {
  step: 1 | 2 | 3;
  title: string;
  description: string;
  backTo: "/fantasy" | "/fantasy/create" | "/fantasy/create/squad";
  children: ReactNode;
}) {
  const { t, dir } = useI18n();
  const BackIcon = dir === "rtl" ? ArrowRight : ArrowLeft;
  return (
    <main className="mx-auto w-full max-w-6xl pb-28" aria-labelledby="atlas-create-title">
      <header className="rounded-3xl border border-white/70 bg-white/80 p-4 shadow-sm backdrop-blur-xl sm:p-6">
        <div className="flex items-start gap-3">
          <Link
            to={backTo}
            aria-label={t("common.back")}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-black/5 bg-white text-foreground shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]"
          >
            <BackIcon className="h-4 w-4" aria-hidden />
          </Link>
          <div className="min-w-0 flex-1">
            <div className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-[color:var(--brand-accent)]">
              <Shield className="h-3.5 w-3.5" aria-hidden />
              {t("fantasy.atlas.create.eyebrow")}
            </div>
            <h1
              id="atlas-create-title"
              className="mt-1 text-2xl font-black tracking-tight text-foreground sm:text-3xl"
            >
              {title}
            </h1>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          </div>
        </div>

        <ol aria-label={t("fantasy.atlas.create.progress")} className="mt-5 grid grid-cols-3 gap-2">
          {steps.map((item) => {
            const complete = item.number < step;
            const current = item.number === step;
            return (
              <li key={item.number} className="min-w-0">
                <div
                  aria-current={current ? "step" : undefined}
                  className={cn(
                    "flex min-h-11 items-center gap-2 rounded-2xl border px-2.5 py-2 text-start",
                    current && "border-blue-500/30 bg-blue-50 text-blue-950",
                    complete && "border-emerald-500/25 bg-emerald-50 text-emerald-950",
                    !current && !complete && "border-black/5 bg-slate-50 text-slate-500",
                  )}
                >
                  <span
                    className={cn(
                      "grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-black",
                      current && "bg-blue-600 text-white",
                      complete && "bg-emerald-600 text-white",
                      !current && !complete && "bg-slate-200 text-slate-600",
                    )}
                  >
                    {complete ? <Check className="h-3.5 w-3.5" aria-hidden /> : item.number}
                  </span>
                  <span className="truncate text-[11px] font-black sm:text-xs">
                    {t(item.label)}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      </header>

      <div className="mt-4 sm:mt-6">{children}</div>
    </main>
  );
}

export function AtlasStickyAction({ summary, action }: { summary: ReactNode; action: ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/70 bg-white/90 px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 shadow-[0_-12px_30px_rgb(15_23_42/0.08)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center gap-3">
        <div className="min-w-0 flex-1">{summary}</div>
        {action}
      </div>
    </div>
  );
}
