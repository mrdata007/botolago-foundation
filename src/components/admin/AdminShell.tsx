import { Link } from "@tanstack/react-router";
import {
  BadgeCheck,
  ClipboardCheck,
  Database,
  KeyRound,
  Link2,
  Newspaper,
  Images,
  ScrollText,
  Sparkles,
  Trophy,
  UserCheck,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import {
  groupAdminNavItems,
  type AdminNavIcon,
  type AdminNavItem,
} from "@/backend/admin/admin-console-contracts";
import { getAdminCopy, type AdminRouteState } from "@/backend/admin/route-access";
import type { RepositoryContext } from "@/backend/contracts/repository";
import type { PremiumAdminOverview, PremiumAdminRepository } from "@/backend/premium/admin";
import { AdminDatum, AdminSummaryCard } from "@/components/admin/AdminSurfaces";
import { MODE_LABELS, subscriberCount } from "@/components/admin/plus/plus-presentation";
import { Logo } from "@/components/brand/Logo";
import { PlusLogo } from "@/components/plus/PlusLogo";
import { ui, UiBadge, UiCard } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

/**
 * The Admin console's shell: top bar, grouped section chips, and (on the home page) the module
 * cards. `routes/admin.tsx` renders it around the router's `<Outlet />`; the development sample
 * (`/dev/admin-shell-sample`) renders the very same component around sample data, so what is
 * reviewed there is what ships.
 *
 * The chips and the cards are both drawn from `ADMIN_CONSOLE_NAV_ITEMS`, filtered on the caller's
 * permissions: an entry is a link, never an authority, and each target route checks again.
 */

export type AdminAuthorized = Extract<AdminRouteState, { state: "authorized" }>;

/** The ONE nav icon table; the contract holds keys so it stays free of React. */
const NAV_ICONS: Record<AdminNavIcon, LucideIcon> = {
  plus: BadgeCheck,
  staff: UserCog,
  approvals: ClipboardCheck,
  audit: ScrollText,
  security: KeyRound,
  stories: Images,
  news: Newspaper,
  pepites: Sparkles,
  prizes: Trophy,
  users: Users,
  data: Database,
  mapping: Link2,
  players: UserCheck,
};

/**
 * What marks an entry: its icon, or, for the memberships entry, the logo (staff-only labels may
 * pair the logo with the word « Abonnements »; the product name is never typed). Decorative: the
 * word beside it names the entry.
 */
function NavMark({ item, className }: { item: AdminNavItem; className?: string }) {
  if (item.icon === "plus") {
    return <PlusLogo label="" decorative height={12} className={cn("shrink-0", className)} />;
  }
  const Icon = NAV_ICONS[item.icon];
  return <Icon className={cn("h-4 w-4 shrink-0", className)} aria-hidden />;
}

const ADMIN_COLUMN = cn("mx-auto w-full max-w-4xl", ui.space.gutter);

const ACTIVE_CHIP =
  "bg-[color:var(--ui-selected)] text-[color:var(--ui-on-selected)] shadow-[var(--ui-shadow-card)]";

export interface AdminShellProps {
  access: AdminAuthorized;
  lang: "fr" | "ar";
  /** The page below the nav: the router's outlet. */
  children: ReactNode;
  /** The console's home page is open: draw the cards. */
  isHome: boolean;
  /** The language button, at the end of the top bar. */
  headerEnd?: ReactNode;
  /** The numbers dashboard, above the cards (staff holding analytics.read). */
  analytics?: ReactNode;
  /**
   * The memberships overview, for the figures on the Abonnements card. Optional: without it, or
   * when it fails, the card is a plain link.
   */
  premiumRepository?: PremiumAdminRepository;
  makeContext?: () => RepositoryContext;
  /**
   * The route to paint as current. The router paints it itself (`data-status`); a sample outside
   * the router passes it.
   */
  currentRoute?: string;
}

export function AdminShell({
  access,
  lang,
  children,
  isHome,
  headerEnd,
  analytics,
  premiumRepository,
  makeContext,
  currentRoute,
}: AdminShellProps) {
  const copy = getAdminCopy(lang);
  const rtl = copy.dir === "rtl";
  const groups = groupAdminNavItems(access.context.permissions);
  const roleNames = access.context.roles.map((role) => role.name);

  return (
    <div
      dir={copy.dir}
      className={cn("min-h-dvh", ui.surface.page)}
      data-admin-state="authorized"
      data-testid="admin-shell"
    >
      {/* The top bar is the app's own: an opaque bar with a hairline, the wordmark at the inline
          start and the round "FR" / "ع" button at the end. It does not stick: the article editor
          pins its own toolbar to the top, and two sticky bars would take a phone's screen. */}
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
          {headerEnd && <div className="ms-auto">{headerEnd}</div>}
        </div>
      </header>

      {/* The sections, grouped, as the round chips the app filters with: sunken at rest, white
          on navy for the current one. A small label heads each group. The row scrolls sideways
          on a phone rather than wrapping into a block of pills. */}
      <nav
        className={cn(ui.surface.bar, ui.rule.block)}
        aria-label={rtl ? "أقسام الإدارة" : "Sections administratives"}
        data-testid="admin-navigation"
      >
        <div
          className={cn(
            ADMIN_COLUMN,
            "flex gap-5 overflow-x-auto py-2 [scrollbar-width:none]",
            // Room on a wide screen: the groups wrap rather than scroll.
            "sm:flex-wrap sm:gap-y-3 sm:overflow-x-visible",
          )}
        >
          {groups.map(({ group, items }) => (
            <div
              key={group.id}
              className="flex shrink-0 flex-col gap-1"
              role="group"
              aria-label={group.labels[lang]}
              data-testid={`admin-nav-group-${group.id}`}
            >
              <p aria-hidden className={cn(ui.text.label, ui.tone.faint)}>
                {group.labels[lang]}
              </p>
              <div className="flex gap-2">
                {items.map((item) => (
                  <Link
                    key={item.route}
                    to={item.route}
                    // The current section is painted through `data-[status=active]:` rather than
                    // `activeProps`: `activeProps.className` is APPENDED to `className`, so both
                    // sets would land on the element. TanStack's Link sets
                    // `data-status="active"` and `aria-current="page"` itself.
                    className={cn(
                      "inline-flex shrink-0 items-center justify-center gap-2 px-4 transition-colors",
                      ui.space.tap,
                      ui.radius.full,
                      ui.text.meta,
                      "[font-weight:var(--ui-weight-strong)]",
                      ui.surface.sunken,
                      "data-[status=active]:bg-[color:var(--ui-selected)] data-[status=active]:text-[color:var(--ui-on-selected)]",
                      "data-[status=active]:shadow-[var(--ui-shadow-card)]",
                      currentRoute === item.route && ACTIVE_CHIP,
                      ui.focus,
                    )}
                    aria-current={currentRoute === item.route ? "page" : undefined}
                    data-testid={item.testId}
                  >
                    <NavMark item={item} />
                    {item.labels[lang]}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </nav>

      <main className={cn(ADMIN_COLUMN, "pb-16")}>
        {isHome && (
          <>
            {analytics}

            <section className="mt-8" aria-labelledby="admin-modules-heading">
              <h2 id="admin-modules-heading" className={ui.display.section}>
                {copy.labels.modulesHeading}
              </h2>
              <div className="mt-3 grid gap-6" data-testid="admin-modules">
                {groups.map(({ group, items }) => (
                  <div key={group.id} data-testid={`admin-modules-${group.id}`}>
                    <h3 className={cn(ui.text.label, ui.tone.muted)}>{group.labels[lang]}</h3>
                    <ul className="mt-2 grid gap-3 sm:grid-cols-2">
                      {items.map((item) => (
                        <li key={item.route}>
                          <ModuleCard
                            item={item}
                            lang={lang}
                            premiumRepository={premiumRepository}
                            makeContext={makeContext}
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>

            <section className="mt-8" aria-labelledby="admin-context-heading">
              {/* Section headings in the display face, like "À venir" and "Classement" on the
                  home screen. */}
              <h2 id="admin-context-heading" className={ui.display.section}>
                {copy.labels.contextHeading}
              </h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2" data-testid="admin-home">
                <AdminSummaryCard title={copy.labels.identity}>
                  {/* A masked address and a UUID are both LTR data: only the value is forced. */}
                  <AdminDatum>{access.identity.emailSummary ?? access.identity.userId}</AdminDatum>
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
                  <p className={ui.stat.lg}>{access.context.permissions.length}</p>
                </AdminSummaryCard>
                <AdminSummaryCard title={copy.labels.security}>
                  <p className="flex flex-wrap items-center gap-2">
                    {/* Not a `UiBadge`: the badge is uppercase label type, and this is a VALUE. */}
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
                      {`AAL2 · ${access.context.recentAuthWindowSeconds / 60} min`}
                    </AdminDatum>
                  </p>
                  <p className={cn("mt-2", ui.text.meta, ui.tone.muted)}>
                    {copy.labels.pendingRevocation}
                    {" : "}
                    <span className={cn(ui.stat.sm, ui.tone.default)}>
                      {access.context.pendingSessionRevocationCount}
                    </span>
                  </p>
                </AdminSummaryCard>
              </div>
            </section>
          </>
        )}
        {children}
      </main>
    </div>
  );
}

/** A home card: the whole card is the link. */
function ModuleCard({
  item,
  lang,
  premiumRepository,
  makeContext,
}: {
  item: AdminNavItem;
  lang: "fr" | "ar";
  premiumRepository?: PremiumAdminRepository;
  makeContext?: () => RepositoryContext;
}) {
  const isPlus = item.icon === "plus";
  const Icon = NAV_ICONS[item.icon];
  return (
    <Link
      to={item.route}
      className={cn("block", ui.radius.card, ui.focus)}
      data-testid={`admin-module-${item.testId.replace("admin-nav-", "")}`}
    >
      <UiCard padding="md" className="flex h-full items-center gap-3">
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
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "flex flex-wrap items-center gap-x-2",
              ui.text.bodyStrong,
              ui.tone.default,
            )}
          >
            {isPlus && <NavMark item={item} />}
            <span>{item.labels[lang]}</span>
          </span>
          <span className={cn("mt-0.5 block", ui.text.meta, ui.tone.muted)}>{item.hint[lang]}</span>
          {isPlus && premiumRepository && makeContext && (
            <PlusCardFigures repository={premiumRepository} makeContext={makeContext} lang={lang} />
          )}
        </span>
      </UiCard>
    </Link>
  );
}

/**
 * The mode and the subscriber count on the Abonnements card, read through the existing memberships
 * overview (counts only, no member). If the read fails the figures are simply absent: the card is
 * still the link.
 */
function PlusCardFigures({
  repository,
  makeContext,
  lang,
}: {
  repository: PremiumAdminRepository;
  makeContext: () => RepositoryContext;
  lang: "fr" | "ar";
}) {
  const [overview, setOverview] = useState<PremiumAdminOverview | null>(null);
  useEffect(() => {
    let cancelled = false;
    repository
      .overview(makeContext())
      .then((data) => !cancelled && setOverview(data))
      .catch(() => !cancelled && setOverview(null));
    return () => {
      cancelled = true;
    };
    // The repository is what matters; `makeContext` is a fresh closure per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repository]);
  if (!overview) return null;
  const rtl = lang === "ar";
  const mode = overview.settings.mode;
  return (
    <span
      className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1"
      data-testid="admin-module-plus-figures"
    >
      <UiBadge tone={mode === "off" ? "neutral" : mode === "preview" ? "caution" : "outline"}>
        {MODE_LABELS[mode][lang]}
      </UiBadge>
      <span className={cn(ui.text.meta, ui.tone.default)}>
        <span className={ui.stat.sm}>{subscriberCount(overview)}</span>{" "}
        {rtl ? "مشتركون" : "abonnés"}
      </span>
    </span>
  );
}
