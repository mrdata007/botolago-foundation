import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Bell,
  Bookmark,
  Check,
  ChevronRight,
  CircleHelp,
  FileText,
  Globe,
  KeyRound,
  Loader2,
  LockKeyhole,
  LogIn,
  LogOut,
  Palette,
  Pencil,
  ShieldCheck,
  Star,
  Trash2,
  Trophy,
  UserPlus,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { BrandedText } from "@/components/brand/BrandedText";
import { Logo } from "@/components/brand/Logo";
import { authOutlineClass } from "@/components/auth/auth-classes";
import { profileClubs, profileInitials } from "@/components/auth/account-model";
import { ClubCrest } from "@/components/common/ClubCrest";
import { STRETCHED_LINK } from "@/components/clubs/stretched-link";
import { Section } from "@/components/common/Section";
import { SectionHeader } from "@/components/common/SectionHeader";
import { Trans } from "@/components/common/Trans";
import { AppShell } from "@/components/shell/AppShell";
import { LanguageMenuChoices } from "@/components/shell/LanguageMenuChoices";
import { ThemeSwitcher } from "@/components/shell/ThemeSwitcher";
import {
  ui,
  UiBadge,
  UiButton,
  UiCard,
  UiCheckbox,
  UiIconLinkButton,
  UiLinkButton,
  UiMenu,
  UiModal,
  UiPageTitle,
} from "@/components/ui-kit";
import { useAuth } from "@/auth/AuthProvider";
import { useI18n } from "@/i18n/provider";
import { clubStyle } from "@/lib/club-palette";
import { findClub } from "@/components/fantasy/club-identity";
import { DARK_MODE_ENABLED, NEWS_ENABLED } from "@/lib/feature-flags";
import { useSavedArticles } from "@/lib/saved-articles";
import { cn } from "@/lib/utils";
import { authService } from "@/services/auth";
import { useFantasyDataSource } from "@/services/fantasy-data-source";
import { fantasyService } from "@/services/fantasy-runtime";
import { followedTeamIdsQuery } from "@/services/follows";
import { footballService } from "@/services/football";
import { useFantasyAvailability } from "@/services/use-fantasy-availability";
import type { Club, FantasySummary } from "@/types/domain";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Profile — BotolaGO" },
      {
        name: "description",
        content: "Gérez votre compte, vos clubs suivis et vos préférences BotolaGO.",
      },
      { property: "og:title", content: "Profile — BotolaGO" },
      {
        property: "og:description",
        content: "Gérez votre compte, vos clubs suivis et vos préférences BotolaGO.",
      },
    ],
  }),
  component: ProfileRootRoute,
});

/* -------------------------------------------------------------------------- */
/* Shared row idioms                                                          */
/*                                                                            */
/* Option A (A-Profile): Changa section headings over 14px cards of rows. A   */
/* row is a 36px ROUND icon disc, the label in heavy body type, an optional   */
/* muted value, and a chevron; rows are ruled on their block start. Logical   */
/* utilities only — `ChevronRight` is mirrored for Arabic by styles.css.      */
/* -------------------------------------------------------------------------- */

/** The row frame: at least the 48px row height, gutter-padded. */
const ROW = cn("flex w-full items-center gap-3 px-4 py-2 text-start", ui.space.row);

/** Rows after the first inside a card carry the divider on their block start. */
const ROW_RULE = ui.rule.blockStart;

const ROW_INTERACTIVE = cn(
  "transition-colors duration-[var(--duration-quick)] hover:bg-[color:var(--ui-surface-sunken)]",
  // The card clips its children (`overflow-hidden`), which would cut an outer
  // ring in half, so the focus ring is drawn inside the row — in the brand
  // foreground, which is what `ui.focus` draws everywhere else.
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--ui-ink-fg)]",
);

/** The 36px round glyph disc — decorative, so it may sit below the 44px floor. */
function RowDisc({
  children,
  tone = "sunken",
}: {
  children: ReactNode;
  tone?: "sunken" | "negative";
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid h-9 w-9 shrink-0 place-items-center [&_svg]:h-4.5 [&_svg]:w-4.5",
        ui.radius.full,
        tone === "sunken" && cn(ui.surface.sunken, ui.tone.ink),
        tone === "negative" &&
          cn("bg-[color:color-mix(in_oklab,var(--ui-negative)_14%,transparent)]", ui.tone.negative),
      )}
    >
      {children}
    </span>
  );
}

interface RowContent {
  icon: ReactNode;
  label: ReactNode;
  /** A short muted value before the chevron: "Français", "2/3". */
  value?: ReactNode;
  tone?: "default" | "negative";
  /** Rows that go somewhere carry one; a row that acts in place does not. */
  chevron?: boolean;
}

function RowInner({ icon, label, value, tone = "default", chevron = true }: RowContent) {
  return (
    <>
      <RowDisc tone={tone === "negative" ? "negative" : "sunken"}>{icon}</RowDisc>
      {/* Wraps rather than truncates: "Authentification à deux facteurs" is
          wider than the label track at 390px. */}
      <span
        className={cn(
          "min-w-0 flex-1 text-pretty",
          ui.text.bodyStrong,
          tone === "negative" ? ui.tone.negative : ui.tone.default,
        )}
      >
        {label}
      </span>
      {value !== undefined ? (
        <span className={cn("shrink-0 whitespace-nowrap", ui.text.meta, ui.tone.muted)}>
          {value}
        </span>
      ) : null}
      {chevron ? (
        <ChevronRight className={cn("h-4.5 w-4.5 shrink-0", ui.tone.muted)} aria-hidden />
      ) : null}
    </>
  );
}

/** A row that goes to a page: a real link (href, middle-click, copy-link). */
function RowLink({
  to,
  search,
  ruled = false,
  ...content
}: RowContent & { to: string; search?: Record<string, unknown>; ruled?: boolean }) {
  return (
    <Link to={to} search={search} className={cn(ROW, ROW_INTERACTIVE, ruled && ROW_RULE)}>
      <RowInner {...content} />
    </Link>
  );
}

/** A row that acts in place (sign out opens its confirmation). */
function RowButton({
  onClick,
  ruled = false,
  ...content
}: RowContent & { onClick: () => void; ruled?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={cn(ROW, ROW_INTERACTIVE, ruled && ROW_RULE)}>
      <RowInner {...content} />
    </button>
  );
}

/**
 * A titled card of rows. The heading is the shared Option A section header —
 * Changa 22/800, sentence case — over one 14px card.
 */
function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Section>
      <SectionHeader title={title} />
      <div className={cn("overflow-hidden", ui.surface.card)}>{children}</div>
    </Section>
  );
}

// This route now has a child route (/profile/security). A parent route in a
// nested (dot-separated) file hierarchy must render <Outlet /> itself or the
// deeper match never appears -- the URL changes but the parent's own UI stays
// on screen. Same defect already fixed in admin.news.tsx and admin.staff.tsx.
function ProfileRootRoute() {
  const isChildRoute = useRouterState({
    select: (state) => state.matches.some((match) => match.routeId === "/profile/security"),
  });
  return isChildRoute ? <Outlet /> : <ProfilePage />;
}

function ProfilePage() {
  const { t, lang } = useI18n();
  const { user, status, signOut } = useAuth();
  const navigate = useNavigate();
  const clubsQ = useQuery({
    queryKey: ["football", "clubs", lang],
    queryFn: () => footballService.getClubs(lang),
  });
  const [signOutOpen, setSignOutOpen] = useState(false);

  // By id, then by slug: the mock club list mints synthetic ids and keys
  // clubs by slug ("war"), as the Fantasy screens found.
  const favoriteClub = findClub(clubsQ.data, user?.favoriteClubId);

  const onSignOut = async (resetLocalData: boolean) => {
    await signOut({ resetLocalData });
    setSignOutOpen(false);
    toast.success(t("auth.success.signed_out"));
    navigate({ to: "/" });
  };

  return (
    // The hub title band (A-Profile): white, full-bleed, Changa 34, under the
    // top bar and outside the content gutter.
    <AppShell pageHeader={<UiPageTitle title={t("profile.title")} />}>
      {status === "authenticated" && user ? (
        <AuthenticatedProfile
          user={user}
          clubs={clubsQ.data}
          favoriteClub={favoriteClub}
          onSignOut={() => setSignOutOpen(true)}
        />
      ) : status === "guest" ? (
        <GuestProfile />
      ) : (
        <AnonymousProfile />
      )}

      <UiModal
        open={signOutOpen}
        onOpenChange={setSignOutOpen}
        title={t("profile.sign_out_title")}
        description={t("profile.sign_out_body")}
        footer={
          <>
            <UiButton onClick={() => onSignOut(false)}>
              <Check className="h-4 w-4" aria-hidden /> {t("profile.sign_out_keep")}
            </UiButton>
            {/* "Sign out AND erase what is stored on this device" is the
                destructive branch, so it takes the variant rather than an
                outline wearing a red label. */}
            <UiButton variant="destructive" onClick={() => onSignOut(true)}>
              <X className="h-4 w-4" aria-hidden /> {t("profile.sign_out_reset")}
            </UiButton>
          </>
        }
      />
    </AppShell>
  );
}

type ProfileUser = NonNullable<ReturnType<typeof useAuth>["user"]>;

function AuthenticatedProfile({
  user,
  clubs,
  favoriteClub,
  onSignOut,
}: {
  user: ProfileUser;
  clubs: readonly Club[] | undefined;
  favoriteClub: Club | undefined;
  onSignOut: () => void;
}) {
  const { t, tr, lang } = useI18n();

  // The Fantasy strip on the identity card reads the queries Home already
  // runs, under the same keys, so it shares Home's cache and its gating: no
  // summary for a guest source, none while the game is not open.
  const { source, key } = useFantasyDataSource();
  const availability = useFantasyAvailability();
  const fantasyReady = !availability.isError && availability.data?.status === "ready";
  const summaryQ = useQuery({
    queryKey: key("summary"),
    queryFn: () => fantasyService.getSummary(),
    enabled: fantasyReady && source !== "guest",
  });

  // "Mes clubs" — the clubs this reader follows. Same query as News, which
  // invalidates it after a follow or an unfollow, keyed by this account so the
  // next one signed in on the phone never sees these clubs. Mock mode has no
  // Supabase behind it (the follow repository would throw), so it is not
  // asked there and the section simply does not appear.
  const followedQ = useQuery(followedTeamIdsQuery(user.id));
  const tiles = useMemo(() => {
    const byId = new Map((clubs ?? []).map((club) => [club.id, club] as const));
    const followed = (followedQ.data ?? []).flatMap((id) => byId.get(id) ?? []);
    return profileClubs(favoriteClub, followed);
  }, [clubs, followedQ.data, favoriteClub]);

  const notificationsOn = [
    user.notifications.matchAlerts,
    user.notifications.breakingNews,
    user.notifications.fantasyDeadlines,
  ].filter(Boolean).length;

  return (
    <>
      <IdentityCard user={user} club={favoriteClub} summary={summaryQ.data ?? undefined} />

      {tiles.length > 0 ? (
        <Section>
          <SectionHeader title={t("profile.clubs.title")} />
          <ul className="grid grid-cols-3 gap-2">
            {tiles.map(({ club, favorite }) => {
              const colours = clubStyle(club);
              return (
                // A tile per club: its crest disc, its name, and a 4px base
                // in its edge colour (`ui.edge.blockEnd`, a logical border —
                // the board drew an inset shadow). The name opens the club's
                // page, and its ::after makes the whole tile the target.
                <li
                  key={club.id}
                  data-club={colours["data-club"]}
                  style={colours.style}
                  className={cn(
                    "relative flex min-h-28 min-w-0 flex-col items-center justify-end gap-2 px-2 pb-3 pt-8 text-center",
                    ui.surface.card,
                    ui.edge.blockEnd,
                    "transition-transform duration-[var(--duration-tap)] ease-[var(--ease-standard)] active:translate-y-px",
                  )}
                >
                  {favorite ? (
                    // Centred with logical insets, never `left: 50%`.
                    <UiBadge
                      tone="action"
                      className="absolute inset-x-0 top-2 mx-auto w-fit gap-1 px-2 py-0.5"
                    >
                      <Star className="h-3 w-3 fill-current" aria-hidden />
                      {t("profile.clubs.favorite")}
                    </UiBadge>
                  ) : null}
                  <ClubCrest club={club} />
                  <Link
                    to="/clubs/$clubId"
                    params={{ clubId: club.id }}
                    className={cn(
                      "w-full truncate",
                      ui.text.meta,
                      "[font-weight:var(--ui-weight-heavy)]",
                      ui.tone.default,
                      STRETCHED_LINK,
                      "after:rounded-[var(--ui-radius-card)]",
                    )}
                  >
                    {tr(club.name)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </Section>
      ) : null}

      <Group title={t("profile.section.preferences")}>
        <LanguageRow />
        {/* One row for the three switches, with how many are on. They are
            edited on the wizard's notifications step — there is no other
            settings screen — and the wizard comes back here when done. */}
        <RowLink
          to="/auth/profile-setup"
          search={{ next: "/profile", step: 3 }}
          ruled
          icon={<Bell />}
          label={t("profile.notifications")}
          value={
            <bdi dir="ltr" className={ui.stat.sm}>
              {notificationsOn}/3
            </bdi>
          }
        />
        <ThemeRow ruled />
      </Group>

      <Group title={t("profile.section.account")}>
        {/* Saved articles — hidden at launch (NEWS_ENABLED); there is no
            News surface to save from. */}
        {NEWS_ENABLED && (
          <div className={ROW}>
            <RowInner
              icon={<Bookmark />}
              label={t("profile.saved_articles")}
              chevron={false}
              value={<SavedArticlesCount />}
            />
          </div>
        )}
        <RowLink
          to="/auth/update-password"
          ruled={NEWS_ENABLED}
          icon={<KeyRound />}
          label={t("profile.change_password")}
        />
        <RowLink
          to="/profile/security"
          ruled
          icon={<ShieldCheck />}
          label={t("profile.mfa_setup")}
        />
        <RowLink to="/fantasy/help" ruled icon={<CircleHelp />} label={t("fpl.help_rules")} />
        <RowButton
          onClick={onSignOut}
          ruled
          tone="negative"
          chevron={false}
          icon={<LogOut />}
          label={t("profile.sign_out")}
        />
      </Group>

      {/* Legal — its own group, with both documents: a reader has to be able
          to reach what they agreed to. Plain router links, since they go to
          a page. */}
      <Group title={t("profile.section.legal")}>
        <RowLink to="/terms" icon={<FileText />} label={t("profile.legal.terms")} />
        <RowLink to="/privacy" ruled icon={<LockKeyhole />} label={t("profile.legal.privacy")} />
      </Group>

      <DeleteAccountSection />
    </>
  );
}

/* ------------------------------ identity card ----------------------------- */

/**
 * The club-colour identity card (A-Profile). The favourite club's colours come
 * from the club palette — a real colour from data, else the kit table, else
 * the ink — so a reader with no favourite gets the navy card, with the same
 * stripes. The text on it is the palette's measured foreground.
 *
 * Each part renders only from data the account has: the photo or the
 * initials, the name, the username and e-mail (isolated left-to-right, so
 * "@" stays at the front in Arabic), the supporter chip when there is a
 * favourite, and the Fantasy strip when there is a team summary.
 */
function IdentityCard({
  user,
  club,
  summary,
}: {
  user: ProfileUser;
  club: Club | undefined;
  summary: FantasySummary | undefined;
}) {
  const { t, tr, lang } = useI18n();
  const initials = profileInitials(user.displayName, user.username);
  const nf = useMemo(() => new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR"), [lang]);

  return (
    <section
      {...clubStyle(club ?? null)}
      aria-labelledby="profile-hero-name"
      className={cn(
        "overflow-hidden",
        ui.radius.sheet,
        ui.shadow.lifted,
        ui.club.fill,
        ui.club.stripes,
      )}
    >
      <div className="flex items-center gap-3.5 p-4">
        {/* The avatar: a surface disc lifted off the club block. */}
        <span
          className={cn(
            "grid h-16 w-16 shrink-0 place-items-center overflow-hidden",
            ui.radius.full,
            ui.club.inverse,
            ui.shadow.lifted,
          )}
        >
          {user.avatarDataUrl ? (
            <img src={user.avatarDataUrl} alt="" className="h-full w-full object-cover" />
          ) : initials ? (
            <span aria-hidden className={ui.display.section}>
              {initials}
            </span>
          ) : (
            <UserRound className="h-8 w-8" aria-hidden />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <h2 id="profile-hero-name" className={cn("truncate", ui.display.section)}>
            {user.displayName || `@${user.username}`}
          </h2>
          {user.username ? (
            <p className={cn("truncate", ui.text.meta)}>
              <bdi dir="ltr">@{user.username}</bdi>
            </p>
          ) : null}
          {user.email ? (
            <p className={cn("truncate", ui.text.meta)}>
              <bdi dir="ltr">{user.email}</bdi>
            </p>
          ) : null}
          {club ? (
            // The supporter chip: a white pill with the club's own crest
            // disc. The board's "Supporter du …" cannot be written for every
            // club ("du Wydad", but "de l'AS FAR", "de la Renaissance"), so
            // the chip carries the name and says what it is to assistive tech.
            // A `div`: the crest disc is one, and a `p` may not hold it.
            <div
              className={cn(
                "mt-2 inline-flex max-w-full items-center gap-1.5 py-0.5 pe-3 ps-0.5",
                ui.radius.full,
                ui.surface.bar,
              )}
            >
              <ClubCrest club={club} size="xs" className="h-6 w-6" />
              <span
                className={cn("truncate", ui.text.meta, "[font-weight:var(--ui-weight-heavy)]")}
              >
                <span className="sr-only">{t("profile.fav_club")} </span>
                {tr(club.name)}
              </span>
            </div>
          ) : null}
        </div>

        <UiIconLinkButton
          variant="glass"
          to="/auth/profile-setup"
          search={{ next: "/profile" }}
          aria-label={t("profile.edit")}
          className="-me-1.5 self-start"
        >
          <Pencil aria-hidden />
        </UiIconLinkButton>
      </div>

      {summary ? (
        // The Fantasy strip: the team and its points on the action gradient,
        // ink-deep text as the gradient requires, into the team page.
        <Link
          to="/fantasy/team"
          className={cn(
            "flex min-h-[var(--ui-tap-min)] items-center gap-2.5 px-4 py-2.5",
            "text-[color:var(--ui-ink-deep)]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--ui-ink-deep)]",
          )}
          style={{ backgroundImage: "var(--ui-grad-action)" }}
        >
          <Trophy className="h-4.5 w-4.5 shrink-0" aria-hidden />
          <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
            <span className={cn("min-w-0 truncate", ui.text.bodyStrong)}>{summary.teamName}</span>
            <span aria-hidden className={ui.text.bodyStrong}>
              ·
            </span>
            <bdi className={cn("shrink-0", ui.stat.md)}>{nf.format(summary.totalPoints)}</bdi>
            <span
              aria-hidden
              className={cn("shrink-0", ui.text.meta, "[font-weight:var(--ui-weight-heavy)]")}
            >
              {t("fantasy.points.abbr")}
            </span>
            <span className="sr-only">{t("fpl.points")}</span>
          </span>
          <ChevronRight className="h-4.5 w-4.5 shrink-0" aria-hidden />
        </Link>
      ) : null}
    </section>
  );
}

/* -------------------------------- rows ------------------------------------ */

/**
 * The language, as a row whose value is the current language and which opens
 * the choice as a menu. Device-scoped (it lives in this browser's storage), so
 * every visitor has it, signed in or not — BG-0081.
 */
function LanguageRow({ ruled = false }: { ruled?: boolean }) {
  const { t, lang } = useI18n();
  return (
    <UiMenu
      label={t("language.switch")}
      trigger={
        <button type="button" className={cn(ROW, ROW_INTERACTIVE, ruled && ROW_RULE)}>
          <RowInner
            icon={<Globe />}
            label={t("language.switch")}
            value={lang === "fr" ? t("language.french") : t("language.arabic")}
          />
        </button>
      }
    >
      <LanguageMenuChoices />
    </UiMenu>
  );
}

/**
 * Appearance sits on its own stacked row rather than inline like the language
 * row: three labelled segments ("Système" / "النظام" being the longest) do not
 * fit beside a label at 390px in either language.
 *
 * BG-0111 — the WHOLE row is gated on `DARK_MODE_ENABLED`, not just the
 * control. Gating the switcher alone left the glyph and the "Apparence" label
 * rendering above nothing, so Preferences read as a heading with an empty row
 * under it. Returning `null` gates both call sites at once, and neither is
 * left with a dangling top rule: the rows above carry their rule on their own
 * leading edge. (The board's "Apparence — Clair" row is this row; it stays off
 * while the flag is.)
 */
function ThemeRow({ ruled = false }: { ruled?: boolean }) {
  const { t } = useI18n();
  if (!DARK_MODE_ENABLED) return null;
  return (
    <div className={cn("px-4 py-2", ui.space.row, ruled && ROW_RULE)}>
      <div className="flex items-center gap-3">
        <RowDisc>
          <Palette />
        </RowDisc>
        <span className={cn(ui.text.bodyStrong, ui.tone.default)}>{t("theme.switch")}</span>
      </div>
      <ThemeSwitcher className="mb-1 mt-2" />
    </div>
  );
}

/**
 * The saved-articles count, while News is on. Its own component so the hook
 * runs only where the row is drawn. A figure, so tabular.
 */
function SavedArticlesCount() {
  const saved = useSavedArticles();
  return <span className={ui.stat.sm}>{saved.hydrated ? saved.ids.length : 0}</span>;
}

/** The preferences a signed-out visitor still has: language and appearance. */
function DevicePreferences() {
  const { t } = useI18n();
  return (
    <Group title={t("profile.section.preferences")}>
      <LanguageRow />
      <ThemeRow ruled />
    </Group>
  );
}

/* ---------------------------- danger zone / delete ------------------------ */

function DeleteAccountSection() {
  const { t } = useI18n();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void authService.getAccountDeletionStatus().then((res) => {
      if (!cancelled && res.ok && res.data) setPending(res.data.pending);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const closeDialog = () => {
    setDialogOpen(false);
    setAcknowledged(false);
  };

  const confirmDelete = async () => {
    if (!acknowledged || submitting) return;
    setSubmitting(true);
    const res = await authService.requestAccountDeletion();
    setSubmitting(false);
    if (!res.ok) {
      toast.error(t("profile.delete_error_toast"));
      return;
    }
    setPending(true);
    closeDialog();
    toast.success(t("profile.delete_success_toast"));
  };

  const cancelDeletion = async () => {
    if (submitting) return;
    setSubmitting(true);
    const res = await authService.cancelAccountDeletion();
    setSubmitting(false);
    if (!res.ok) {
      toast.error(t("profile.delete_error_toast"));
      return;
    }
    setPending(false);
    toast.success(t("profile.delete_cancelled_toast"));
  };

  return (
    <>
      {/* Not on the board, and kept: deleting the account is a right the
          product owes the reader. Same heading as the groups above, over a
          card washed in the negative tint. */}
      <Section>
        <SectionHeader title={t("profile.section.danger")} />
        <div
          className={cn(
            "overflow-hidden border",
            ui.radius.card,
            "border-[color:color-mix(in_oklab,var(--ui-negative)_30%,transparent)]",
            "bg-[color:color-mix(in_oklab,var(--ui-negative)_6%,var(--ui-surface))]",
            ui.shadow.card,
          )}
        >
          {pending ? (
            <div className="flex items-start gap-3 px-4 py-4">
              <RowDisc tone="negative">
                <AlertTriangle />
              </RowDisc>
              <div className="min-w-0 flex-1">
                <div className={cn(ui.text.bodyStrong, ui.tone.default)}>
                  {t("profile.delete_pending_title")}
                </div>
                <p className={cn("mt-0.5", ui.text.meta, ui.tone.muted)}>
                  {t("profile.delete_pending_body")}
                </p>
                <UiButton
                  size="sm"
                  variant="outline"
                  onClick={cancelDeletion}
                  disabled={submitting}
                  className={cn("mt-3", authOutlineClass)}
                >
                  {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
                  {t("profile.delete_cancel_request_cta")}
                </UiButton>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setDialogOpen(true)}
              className={cn(
                ROW,
                "py-3 transition-colors",
                "hover:bg-[color:color-mix(in_oklab,var(--ui-negative)_10%,transparent)]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--ui-negative)]",
              )}
            >
              <RowDisc tone="negative">
                <Trash2 />
              </RowDisc>
              <span className="min-w-0 flex-1 text-start">
                <span className={cn("block", ui.text.bodyStrong, ui.tone.negative)}>
                  {t("profile.delete_account")}
                </span>
                <span className={cn("block", ui.text.meta, ui.tone.muted)}>
                  {t("profile.delete_account_desc")}
                </span>
              </span>
              <ChevronRight className={cn("h-4.5 w-4.5 shrink-0", ui.tone.negative)} aria-hidden />
            </button>
          )}
        </div>
      </Section>

      <UiModal
        open={dialogOpen}
        onOpenChange={(open) => (open ? setDialogOpen(true) : closeDialog())}
        title={t("profile.delete_confirm_title")}
        description={t("profile.delete_confirm_body")}
        footer={
          <>
            <UiButton
              variant="destructive"
              onClick={confirmDelete}
              disabled={!acknowledged || submitting}
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {t("profile.delete_confirm_cta")}
            </UiButton>
            <UiButton variant="ghost" onClick={closeDialog}>
              {t("profile.delete_cancel_cta")}
            </UiButton>
          </>
        }
      >
        {/* The acknowledgement keeps its warning plate — it is the thing the
            reader has to read, not a field. What it gains is a focus ring and
            a real tap target: it had neither, on the control that unlocks
            deleting an account. */}
        <UiCheckbox
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
          label={t("profile.delete_confirm_checkbox")}
          className={cn(
            "border p-3",
            ui.radius.card,
            "border-[color:color-mix(in_oklab,var(--ui-negative)_30%,transparent)]",
            "bg-[color:color-mix(in_oklab,var(--ui-negative)_7%,transparent)]",
            ui.text.meta,
          )}
        />
      </UiModal>
    </>
  );
}

/* ---------------------------- guest / anonymous --------------------------- */

/**
 * The two signed-out states, as before: what the visitor is, what an account
 * would give them, and the two ways in — now as links (they go to a page),
 * the gradient pill for creating an account and the sheet's white pill for
 * signing in. Then the device preferences every visitor has.
 */
function GuestProfile() {
  const { t } = useI18n();
  return (
    <>
      <UiCard padding="lg">
        <UiBadge tone="action" className="mb-3">
          {t("profile.guest_badge")}
        </UiBadge>
        <h2 className={cn(ui.display.section, ui.tone.default)}>
          <Trans text={t("profile.guest_title")} accentClassName={ui.tone.ink} />
        </h2>
        <p className={cn("mt-1", ui.text.secondary, ui.tone.muted)}>{t("profile.guest_body")}</p>
        <SignInLinks />
      </UiCard>
      <DevicePreferences />
    </>
  );
}

function AnonymousProfile() {
  const { t } = useI18n();
  return (
    <>
      <UiCard padding="lg" className="text-center">
        <Logo variant="icon" className="!h-14 !w-14" />
        <h2 className={cn("mt-3", ui.display.section, ui.tone.default)}>
          <BrandedText text={t("profile.anon_title")} />
        </h2>
        <p className={cn("mt-1", ui.text.secondary, ui.tone.muted)}>{t("profile.anon_body")}</p>
        <SignInLinks />
      </UiCard>
      <DevicePreferences />
    </>
  );
}

function SignInLinks() {
  const { t } = useI18n();
  return (
    <div className="mt-5 grid gap-2.5">
      <UiLinkButton to="/auth/register">
        <UserPlus className="h-4 w-4" aria-hidden /> {t("auth.prompt.register")}
      </UiLinkButton>
      <UiLinkButton to="/auth/login" variant="outline" className={authOutlineClass}>
        <LogIn className="h-4 w-4" aria-hidden /> {t("auth.prompt.login")}
      </UiLinkButton>
    </div>
  );
}
