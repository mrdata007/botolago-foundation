import { RefreshCw } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { adminRepositoryContext } from "@/backend/admin/functional-route-helpers";
import type { AdminRouteState } from "@/backend/admin/route-access";
import type { AnalyticsOverviewDto } from "@/backend/admin/users-contracts";
import { mapUserAdminError, SupabaseUsersAdminRepository } from "@/backend/admin/users-repository";
import { AdminDate, AdminNotice } from "@/components/admin/AdminSurfaces";
import { userAdminErrorMessage } from "@/components/admin/users/user-presentation";
import { ui, UiButton, UiCard, UiSkeleton } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import {
  analyticsLocale,
  axisTop,
  formatCount,
  formatDay,
  frCount,
  signupsLabel,
} from "./analytics-format";
import { cn } from "@/lib/utils";

type Authorized = Extract<AdminRouteState, { state: "authorized" }>;
type Lang = "fr" | "ar";

function StatTile({
  label,
  value,
  detail,
  testId,
}: {
  label: string;
  value: string;
  detail?: string;
  testId: string;
}) {
  return (
    <UiCard as="article" padding="md" className="min-w-0" testId={testId}>
      <h3 className={cn(ui.text.meta, ui.tone.muted)}>{label}</h3>
      <p className={cn("mt-1", ui.stat.lg, ui.tone.default)}>{value}</p>
      {detail && <p className={cn("mt-1", ui.text.meta, ui.tone.muted)}>{detail}</p>}
    </UiCard>
  );
}

/**
 * Sign-ups per day over thirty days: one series, so one colour (the brand
 * accent, validated on the white card) and no legend -- the title names it.
 *
 * Columns are capped at 24px with a 2px gap, a 4px rounded cap and a square
 * foot on the baseline; the grid is three solid hairlines. The busiest day
 * carries its value on its cap; every other value is in the tooltip (hover,
 * or keyboard focus on the column) and in the table under the chart, so the
 * tooltip never gates a number. The columns follow the page direction, so in
 * Arabic the oldest day is on the right.
 */
function SignupChart({ days, lang }: { days: AnalyticsOverviewDto["signupsByDay"]; lang: Lang }) {
  const rtl = lang === "ar";
  const titleId = useId();
  const [active, setActive] = useState<number | null>(null);
  const [focusIndex, setFocusIndex] = useState(days.length - 1);
  const bars = useRef<(HTMLButtonElement | null)[]>([]);

  const max = days.reduce((highest, day) => Math.max(highest, day.count), 0);
  const top = axisTop(max);
  const total = days.reduce((sum, day) => sum + day.count, 0);
  // The last busiest day, so a tie labels the most recent one.
  const peak = max > 0 ? days.map((day) => day.count).lastIndexOf(max) : -1;
  const label = (count: number) => signupsLabel(count, lang);

  // Roving focus: one tab stop for the chart, arrows move along the days in
  // the direction they are drawn.
  const move = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const forward = rtl ? "ArrowLeft" : "ArrowRight";
    const backward = rtl ? "ArrowRight" : "ArrowLeft";
    let next = index;
    if (event.key === forward) next = Math.min(index + 1, days.length - 1);
    else if (event.key === backward) next = Math.max(index - 1, 0);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = days.length - 1;
    else return;
    event.preventDefault();
    setFocusIndex(next);
    bars.current[next]?.focus();
  };

  const shown = active === null ? null : days[active];
  const offset = active === null ? 0 : ((active + 0.5) / days.length) * 100;

  return (
    <figure className="m-0" aria-labelledby={titleId} data-testid="admin-dashboard-signups">
      <figcaption>
        <h3 id={titleId} className={cn(ui.display.header, ui.tone.default)}>
          {rtl ? "التسجيلات اليومية" : "Inscriptions par jour"}
        </h3>
        <p className={cn("mt-0.5", ui.text.meta, ui.tone.muted)}>
          {rtl
            ? `آخر 30 يوماً · ${formatCount(total, lang)} إجمالاً`
            : `30 derniers jours · ${formatCount(total, lang)} au total`}
        </p>
      </figcaption>

      <div className="mt-6 flex gap-2">
        {/* Value axis: three clean ticks, muted text, aligned to the grid. */}
        <div
          className={cn(
            "relative h-40 w-8 shrink-0 text-end",
            ui.text.micro,
            ui.text.tabular,
            ui.tone.faint,
          )}
          aria-hidden
        >
          {[top, top / 2, 0].map((tick, index) => (
            <span
              key={tick}
              className="absolute inset-x-0 -translate-y-1/2"
              style={{ top: `${index * 50}%` }}
            >
              {formatCount(tick, lang)}
            </span>
          ))}
        </div>

        <div className="relative h-40 min-w-0 flex-1">
          {[0, 50, 100].map((position) => (
            <span
              key={position}
              className="absolute inset-x-0 h-px bg-[color:var(--ui-rule)]"
              style={{ top: `${position}%` }}
              aria-hidden
            />
          ))}

          <div
            role="group"
            aria-labelledby={titleId}
            className="absolute inset-0 flex items-end gap-[2px]"
            onPointerLeave={() => setActive(null)}
          >
            {days.map((day, index) => {
              const height = (day.count / top) * 100;
              const highlighted = active === index;
              return (
                <button
                  key={day.date}
                  ref={(element) => {
                    bars.current[index] = element;
                  }}
                  type="button"
                  tabIndex={index === focusIndex ? 0 : -1}
                  // The hit target is the whole column, not the painted bar.
                  className={cn(
                    "relative flex h-full min-w-0 flex-1 items-end justify-center outline-none",
                    "focus-visible:bg-[color:color-mix(in_oklab,var(--brand-accent)_10%,transparent)]",
                  )}
                  aria-label={`${formatDay(day.date, lang, true)} : ${label(day.count)}`}
                  onPointerEnter={() => setActive(index)}
                  onFocus={() => {
                    setActive(index);
                    setFocusIndex(index);
                  }}
                  onBlur={() => setActive(null)}
                  onKeyDown={(event) => move(event, index)}
                  data-testid="admin-dashboard-signup-bar"
                >
                  {day.count > 0 && (
                    <span
                      className={cn(
                        "block w-full max-w-6 rounded-t-[4px] transition-colors",
                        highlighted
                          ? "bg-[color:var(--brand-primary)]"
                          : "bg-[color:var(--brand-accent)]",
                      )}
                      style={{ height: `${height}%` }}
                      aria-hidden
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* The busiest day's value on its cap: the one direct label. A
              zero-width anchor at the column's centre, so the number centres
              on it in either direction and can be wider than the column. */}
          {peak >= 0 && (
            <span
              className="pointer-events-none absolute flex w-0 justify-center pb-1"
              style={{
                insetInlineStart: `${((peak + 0.5) / days.length) * 100}%`,
                bottom: `${(max / top) * 100}%`,
              }}
              aria-hidden
              data-testid="admin-dashboard-signup-peak"
            >
              <span
                className={cn("whitespace-nowrap", ui.text.micro, ui.text.tabular, ui.tone.muted)}
              >
                {formatCount(max, lang)}
              </span>
            </span>
          )}

          {shown && (
            <div
              className={cn(
                "pointer-events-none absolute -top-2 z-10 w-36 -translate-y-full px-3 py-2 text-center",
                ui.radius.control,
                "bg-[color:var(--ui-surface)] shadow-[var(--ui-shadow-raised)]",
              )}
              style={{
                insetInlineStart: `clamp(0px, calc(${offset}% - 4.5rem), calc(100% - 9rem))`,
              }}
              aria-hidden
              data-testid="admin-dashboard-signup-tooltip"
            >
              <p className={cn(ui.text.bodyStrong, ui.tone.default)}>{label(shown.count)}</p>
              <p className={cn(ui.text.meta, ui.tone.muted)}>{formatDay(shown.date, lang, true)}</p>
            </div>
          )}
        </div>
      </div>

      {/* Date axis: the first and the last day only; the rest are a hover or
          a table row away. */}
      <div
        className={cn("mt-2 flex justify-between ps-10", ui.text.micro, ui.tone.faint)}
        aria-hidden
      >
        <span>{days.length > 0 ? formatDay(days[0].date, lang) : ""}</span>
        <span>{days.length > 0 ? formatDay(days[days.length - 1].date, lang) : ""}</span>
      </div>

      <details className="mt-4" data-testid="admin-dashboard-signups-table">
        <summary
          className={cn(
            "inline-flex min-h-[var(--ui-tap-min)] cursor-pointer items-center",
            ui.text.meta,
            "[font-weight:var(--ui-weight-strong)]",
            ui.tone.ink,
            ui.focus,
          )}
        >
          {rtl ? "عرض الأرقام يوماً بيوم" : "Voir les chiffres jour par jour"}
        </summary>
        <table className={cn("mt-2 w-full", ui.text.meta)}>
          <thead>
            <tr className={ui.tone.muted}>
              <th scope="col" className="py-1 text-start font-normal">
                {rtl ? "اليوم" : "Jour"}
              </th>
              <th scope="col" className="py-1 text-end font-normal">
                {rtl ? "التسجيلات" : "Inscriptions"}
              </th>
            </tr>
          </thead>
          <tbody>
            {[...days].reverse().map((day) => (
              <tr key={day.date} className="border-t border-[color:var(--ui-rule)]">
                <td className="py-1">{formatDay(day.date, lang, true)}</td>
                <td className={cn("py-1 text-end", ui.text.tabular)}>
                  {formatCount(day.count, lang)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

/**
 * The admin home's dashboard: aggregate counts from the database, never a
 * row, a name or an email. Rendered only for staff holding `analytics.read`;
 * the database re-checks it on every call.
 */
export function AdminAnalyticsDashboard({ access }: { access: Authorized }) {
  const { lang } = useI18n();
  const rtl = lang === "ar";
  const repository = useMemo(() => new SupabaseUsersAdminRepository(), []);
  const [data, setData] = useState<AnalyticsOverviewDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      setData(await repository.getAnalyticsOverview(adminRepositoryContext(access)));
      setError(null);
    } catch (failure) {
      setError(mapUserAdminError(failure).code);
    } finally {
      setRefreshing(false);
    }
  }, [access, repository]);

  useEffect(() => {
    void load();
  }, [load]);

  const count = (value: number) => formatCount(value, lang);

  return (
    <section
      className="mt-8"
      aria-labelledby="admin-dashboard-heading"
      data-testid="admin-dashboard"
    >
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <h2 id="admin-dashboard-heading" className={ui.display.section}>
          {rtl ? "لوحة المتابعة" : "Tableau de bord"}
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          {data && (
            <p className={cn(ui.text.meta, ui.tone.muted)}>
              {rtl ? "آخر تحديث " : "Mis à jour à "}
              <AdminDate>
                {new Date(data.generatedAt).toLocaleTimeString(analyticsLocale(lang), {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </AdminDate>
            </p>
          )}
          <UiButton
            variant="soft"
            size="sm"
            onClick={() => void load()}
            disabled={refreshing}
            aria-busy={refreshing}
            data-testid="admin-dashboard-refresh"
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            {rtl ? "تحديث" : "Actualiser"}
          </UiButton>
        </div>
      </div>

      {error && (
        <div className="mt-3" data-testid="admin-dashboard-error">
          <AdminNotice tone="alert" role="alert">
            {userAdminErrorMessage(error, lang)}
          </AdminNotice>
        </div>
      )}

      {!data && !error && (
        <div
          className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4"
          aria-hidden
          data-testid="admin-dashboard-loading"
        >
          {Array.from({ length: 4 }, (_, index) => (
            <UiSkeleton key={index} className="h-24" />
          ))}
        </div>
      )}

      {data && (
        // A refresh keeps the last numbers on screen, dimmed, rather than
        // flashing placeholders over them.
        <div
          className={cn("mt-3 grid gap-3 transition-opacity", refreshing && "opacity-60")}
          aria-busy={refreshing}
        >
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile
              testId="admin-dashboard-users-total"
              label={rtl ? "الحسابات" : "Comptes"}
              value={count(data.users.total)}
              detail={
                rtl
                  ? `البريد المؤكد: ${count(data.users.emailVerified)}`
                  : frCount(data.users.emailVerified, "e-mail confirmé", "e-mails confirmés")
              }
            />
            <StatTile
              testId="admin-dashboard-users-new"
              label={rtl ? "جدد خلال 7 أيام" : "Nouveaux sur 7 jours"}
              value={count(data.users.new7Days)}
              detail={
                rtl
                  ? `اليوم: ${count(data.users.newToday)} · خلال 30 يوماً: ${count(data.users.new30Days)}`
                  : `${count(data.users.newToday)} aujourd’hui · ${count(data.users.new30Days)} sur 30 jours`
              }
            />
            <StatTile
              testId="admin-dashboard-users-active"
              label={rtl ? "نشطون خلال 7 أيام" : "Actifs sur 7 jours"}
              value={count(data.users.active7Days)}
              detail={
                rtl
                  ? `خلال 30 يوماً: ${count(data.users.active30Days)}`
                  : `${count(data.users.active30Days)} sur 30 jours`
              }
            />
            <StatTile
              testId="admin-dashboard-users-banned"
              label={rtl ? "حسابات محظورة" : "Comptes bannis"}
              value={count(data.users.banned)}
              detail={
                rtl
                  ? `طلبات الحذف: ${count(data.users.deletionRequested)}`
                  : frCount(
                      data.users.deletionRequested,
                      "suppression demandée",
                      "suppressions demandées",
                    )
              }
            />
          </div>

          <UiCard padding="md" className="min-w-0">
            <SignupChart days={data.signupsByDay} lang={lang} />
          </UiCard>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile
              testId="admin-dashboard-fantasy-teams"
              label={rtl ? "فرق الفانتازي" : "Équipes Fantasy"}
              value={count(data.fantasy.teams)}
              detail={
                rtl
                  ? `خلال 7 أيام: +${count(data.fantasy.teamsNew7Days)} · الدوريات: ${count(data.fantasy.leagues)}`
                  : `+${count(data.fantasy.teamsNew7Days)} sur 7 jours · ${frCount(data.fantasy.leagues, "ligue", "ligues")}`
              }
            />
            <StatTile
              testId="admin-dashboard-fantasy-transfers"
              label={rtl ? "انتقالات خلال 7 أيام" : "Transferts sur 7 jours"}
              value={count(data.fantasy.transfers7Days)}
            />
            <StatTile
              testId="admin-dashboard-news-published"
              label={rtl ? "مقالات منشورة" : "Articles publiés"}
              value={count(data.news.published)}
              detail={
                rtl
                  ? `خلال 7 أيام: +${count(data.news.published7Days)} · مبرمجة: ${count(data.news.scheduled)} · قيد المراجعة: ${count(data.news.inReview)}`
                  : `+${count(data.news.published7Days)} sur 7 jours · ${frCount(data.news.scheduled, "programmé", "programmés")} · ${count(data.news.inReview)} en relecture`
              }
            />
            <StatTile
              testId="admin-dashboard-devices"
              label={rtl ? "أجهزة مفعّلة للإشعارات" : "Appareils avec notifications"}
              value={count(data.notifications.devices)}
            />
          </div>
        </div>
      )}
    </section>
  );
}
