import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  CalendarDays,
  ChevronRight,
  CircleUserRound,
  Clock3,
  Coins,
  Crown,
  ShieldCheck,
  Trophy,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

import lightWordmark from "@/assets/brand/botolago-wordmark-light.svg";
import heroImage from "@/assets/fantasy/atlas-matchday-hero.png";
import { primaryNavItems } from "@/components/shell/primary-nav";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { fantasyService } from "@/services/fantasy-runtime";
import { useAuth } from "@/auth/AuthProvider";

type Step = {
  titleKey:
    | "fantasy.atlas.step.pick.title"
    | "fantasy.atlas.step.captain.title"
    | "fantasy.atlas.step.league.title";
  descriptionKey:
    | "fantasy.atlas.step.pick.description"
    | "fantasy.atlas.step.captain.description"
    | "fantasy.atlas.step.league.description";
  icon: LucideIcon;
};

const steps: Step[] = [
  {
    titleKey: "fantasy.atlas.step.pick.title",
    descriptionKey: "fantasy.atlas.step.pick.description",
    icon: UsersRound,
  },
  {
    titleKey: "fantasy.atlas.step.captain.title",
    descriptionKey: "fantasy.atlas.step.captain.description",
    icon: Crown,
  },
  {
    titleKey: "fantasy.atlas.step.league.title",
    descriptionKey: "fantasy.atlas.step.league.description",
    icon: ShieldCheck,
  },
];

export function AtlasMatchdayLanding() {
  const { t, lang, dir } = useI18n();
  const { status: authStatus } = useAuth();
  const gameweek = useQuery({
    queryKey: ["gameweek"],
    queryFn: () => fantasyService.getCurrentGameweek(),
    staleTime: 60_000,
  });
  const rules = useQuery({
    queryKey: ["fantasy-create", "rules"],
    queryFn: () => fantasyService.getRules(),
    staleTime: 60_000,
  });

  const deadline = gameweek.data?.deadline ? new Date(gameweek.data.deadline) : null;
  const deadlineLabel =
    deadline && !Number.isNaN(deadline.getTime())
      ? new Intl.DateTimeFormat(lang === "ar" ? "ar-MA" : "fr-FR", {
          day: "numeric",
          month: "long",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }).format(deadline)
      : t("fantasy.atlas.deadline_fallback");
  const daysRemaining = deadline
    ? Math.max(0, Math.ceil((deadline.getTime() - Date.now()) / 86_400_000))
    : null;

  return (
    <div className="min-h-dvh bg-[#07101f] sm:grid sm:place-items-center">
      <main
        aria-label={t("fantasy.atlas.a11y.label")}
        dir={dir}
        className="relative isolate mx-auto min-h-[844px] w-full max-w-[390px] overflow-hidden bg-[#031735] text-white shadow-[0_32px_90px_rgb(0_0_0/0.45)] sm:my-6 sm:rounded-[28px] sm:border sm:border-white/10"
      >
        <div
          aria-hidden
          className="absolute inset-0 -z-30"
          style={{
            background:
              "radial-gradient(circle at 74% 25%, rgb(23 98 209 / 0.26), transparent 30%), linear-gradient(180deg, #031735 0%, #052653 16%, #031735 55%, #011127 100%)",
          }}
        />
        <img
          src={heroImage}
          alt={t("fantasy.atlas.hero_alt")}
          width={1113}
          height={1413}
          fetchPriority="high"
          className="pointer-events-none absolute -left-5 top-5 -z-20 h-auto w-[430px] max-w-none select-none rtl:-scale-x-100"
          style={{
            WebkitMaskImage: "linear-gradient(to bottom, #000 0%, #000 72%, transparent 100%)",
            maskImage: "linear-gradient(to bottom, #000 0%, #000 72%, transparent 100%)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              "linear-gradient(90deg, rgb(0 15 39 / 0.2) 0%, transparent 58%), linear-gradient(180deg, rgb(1 16 41 / 0.06) 20%, rgb(1 16 41 / 0.92) 64%, #011127 83%)",
          }}
        />

        <header className="absolute inset-x-4 top-[37px] flex items-center justify-between">
          <img
            src={lightWordmark}
            alt="BotolaGO"
            width={1615}
            height={288}
            className="h-auto w-[138px] -translate-y-1.5 select-none"
            draggable={false}
          />
          <Link
            to="/profile"
            aria-label={t("nav.profile")}
            className="grid h-[34px] w-[34px] place-items-center rounded-full border border-white/30 bg-[#011432]/30 backdrop-blur-md transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <CircleUserRound className="h-[22px] w-[22px]" aria-hidden />
          </Link>
        </header>

        <section
          aria-label={t("fantasy.atlas.next_matchday")}
          className="absolute start-4 top-[76px] grid h-11 w-[246px] grid-cols-[25px_minmax(0,1fr)_1px_22px_28px] items-center gap-1 rounded-[7px] border border-[#126ff2]/60 bg-[#021f4d]/75 px-2.5 py-1.5 shadow-[0_10px_24px_rgb(0_9_28/0.24)] backdrop-blur-md"
        >
          <span className="grid h-6 w-6 place-items-center rounded-full bg-[#136bf0]/15 text-[#3f8cff]">
            <Clock3 className="h-4 w-4" aria-hidden />
          </span>
          <span className="min-w-0 leading-[1.15]">
            <span className="block truncate text-[10px] font-medium">
              {t("fantasy.atlas.next_matchday")}
            </span>
            <strong className="mt-0.5 block truncate text-[10px] font-semibold">
              {deadlineLabel}
            </strong>
          </span>
          <span className="h-7 bg-[#3087ff]" aria-hidden />
          <CalendarDays className="h-[18px] w-[18px] text-white/85" aria-hidden />
          <strong className="text-[13px] tabular-nums">
            {t("fantasy.atlas.day_prefix")}
            {daysRemaining ?? "—"}
          </strong>
        </section>

        <section className="absolute start-[13px] top-[264px] w-48 text-start">
          <h1 className="flex flex-col text-[30px] font-black leading-[1.12] tracking-[-1.35px] [text-shadow:0_3px_16px_rgb(0_7_22/0.55)]">
            {t("fantasy.atlas.headline.field")}
            <span className="text-[#1e75f8]">{t("fantasy.atlas.headline.choices")}</span>
            {t("fantasy.atlas.headline.team")}
          </h1>
          <p className="mt-2.5 w-[164px] text-[12.5px] leading-[1.42] text-white/95 [text-shadow:0_2px_10px_rgb(0_8_24/0.7)]">
            {t("fantasy.atlas.description")}
          </p>
          <div className="mt-2.5 flex h-12 w-[102px] items-center gap-2 rounded-[11px] border border-[#146ff1]/70 bg-[#011738]/80 px-2 py-1.5 shadow-[0_10px_22px_rgb(0_7_24/0.28)] backdrop-blur-md">
            <Coins className="h-6 w-6 shrink-0 text-[#2c80f8]" aria-hidden />
            <span className="flex flex-col">
              <span className="text-[10px] text-white/75">{t("fantasy.atlas.budget")}</span>
              <strong className="text-sm leading-none">
                {rules.data ? `${rules.data.budget} M` : "—"}
              </strong>
            </span>
          </div>
        </section>

        <section aria-labelledby="atlas-how-title" className="absolute inset-x-3 top-[510px]">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <span className="h-px bg-white/20" aria-hidden />
            <h2 id="atlas-how-title" className="text-xs font-semibold">
              {t("fantasy.atlas.how")}
            </h2>
            <span className="h-px bg-white/20" aria-hidden />
          </div>
          <div className="relative mt-3 grid grid-cols-3 gap-2.5">
            <span
              aria-hidden
              className="absolute start-[17%] end-[17%] top-[22px] border-t border-dashed border-[#4085ef]/55"
            />
            {steps.map((step, index) => {
              const Icon = step.icon;
              return (
                <article key={step.titleKey} className="relative min-w-0 text-center">
                  <div className="relative mx-auto grid h-[45px] w-[76px] place-items-center">
                    <span className="absolute start-0 top-0 grid h-5 w-5 place-items-center rounded-full bg-[#2c80f8] text-[10px] font-black shadow-[0_4px_10px_rgb(12_78_185/0.35)]">
                      {index + 1}
                    </span>
                    <span className="grid h-11 w-11 place-items-center rounded-full border border-[#2d7ff4]/35 bg-[#08234c]/70 text-[#2e83ff] backdrop-blur-sm">
                      <Icon className="h-6 w-6" aria-hidden />
                    </span>
                  </div>
                  <h3 className="mx-auto mt-1 min-h-[34px] max-w-[94px] text-xs font-extrabold leading-tight">
                    {t(step.titleKey)}
                  </h3>
                  <p className="mx-auto mt-1 max-w-[104px] text-[10.5px] leading-[1.35] text-[#dbe5f7]/70">
                    {t(step.descriptionKey)}
                  </p>
                </article>
              );
            })}
          </div>
        </section>

        <div className="absolute inset-x-[13px] top-[680px] grid justify-items-center">
          {authStatus === "authenticated" ? (
            <Link
              to="/fantasy/create"
              className="flex min-h-[43px] w-full items-center justify-center gap-2.5 rounded-full border border-[#63b0ff]/90 bg-[linear-gradient(100deg,#216ee3,#2688ff)] px-4 text-[13px] font-extrabold shadow-[0_12px_25px_rgb(0_48_138/0.35),inset_0_1px_0_rgb(255_255_255/0.22)] transition-[filter,transform] hover:brightness-110 active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              {t("fantasy.atlas.create")}
              <ChevronRight className="h-4 w-4 rtl:rotate-180" aria-hidden />
            </Link>
          ) : (
            <Link
              to="/auth/login"
              search={{ next: "/fantasy/create" }}
              className="flex min-h-[43px] w-full items-center justify-center gap-2.5 rounded-full border border-[#63b0ff]/90 bg-[linear-gradient(100deg,#216ee3,#2688ff)] px-4 text-[13px] font-extrabold shadow-[0_12px_25px_rgb(0_48_138/0.35),inset_0_1px_0_rgb(255_255_255/0.22)] transition-[filter,transform] hover:brightness-110 active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              {t("fantasy.atlas.create")}
              <ChevronRight className="h-4 w-4 rtl:rotate-180" aria-hidden />
            </Link>
          )}
          <Link
            to="/fantasy/rules"
            className="mt-2.5 text-xs font-semibold text-[#2481f7] transition-colors hover:text-[#62a5ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            {t("fantasy.atlas.rules")}
          </Link>
        </div>

        <nav
          aria-label={t("nav.primary")}
          className="absolute inset-x-[13px] bottom-[22px] grid min-h-[60px] grid-cols-5 items-stretch rounded-[23px] bg-[#f7f8fb] px-2 py-1.5 shadow-[0_15px_34px_rgb(0_3_15/0.38)]"
        >
          {primaryNavItems.map((item) => {
            const Icon = item.icon;
            const active = item.to === "/fantasy";
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-label={t(item.labelKey)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-[20px] px-1 py-1 text-[9px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1676ed]",
                  active ? "bg-[#dceafb] text-[#1676ed]" : "text-[#68758b] hover:text-[#32445f]",
                )}
              >
                <Icon className="h-5 w-5" aria-hidden />
                <span className="max-w-full truncate leading-none">{t(item.labelKey)}</span>
              </Link>
            );
          })}
        </nav>
      </main>
    </div>
  );
}
