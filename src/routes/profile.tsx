import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { ClubCrest } from "@/components/common/ClubCrest";
import { Trans } from "@/components/common/Trans";
import { useI18n } from "@/i18n/provider";
import { useAuth } from "@/auth/AuthProvider";
import { authService } from "@/services/auth";
import { footballService } from "@/services/football";
import { Logo } from "@/components/brand/Logo";
import {
  UserCircle,
  LogIn,
  UserPlus,
  LogOut,
  Pencil,
  Bell,
  Check,
  X,
  Bookmark,
  Trophy,
  Languages,
  Palette,
  ChevronRight,
  KeyRound,
  ShieldCheck,
  Trash2,
  AlertTriangle,
  Loader2,
  Mail,
  AtSign,
  FileText,
} from "lucide-react";
import { LanguageSwitcher } from "@/components/shell/LanguageSwitcher";
import { ThemeSwitcher } from "@/components/shell/ThemeSwitcher";
import { DARK_MODE_ENABLED } from "@/lib/feature-flags";
import { toast } from "sonner";
import { NEWS_ENABLED } from "@/lib/feature-flags";
import { useSavedArticles } from "@/lib/saved-articles";
import { ui, UiBadge, UiButton, UiCard, UiCheckbox, UiModal } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Profil — BotolaGO" },
      {
        name: "description",
        content: "Gérez votre compte, vos clubs suivis et vos préférences BotolaGO.",
      },
      { property: "og:title", content: "Profil — BotolaGO" },
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
/* Profile is a list-of-rows screen, so the Fantasy language shows up here as */
/* one row shape reused everywhere: a `--ui-row-min` tall line on the surface */
/* token, 15px body copy, a hairline `--ui-rule` divider at the block end and */
/* a 6px-radius glyph tile. No glass, no V2 radii, no Tailwind type ramp.     */
/* -------------------------------------------------------------------------- */

/** The tappable / static row frame: ≥48px tall, gutter-padded, logical only. */
const ROW = cn("flex w-full items-center justify-between gap-3 px-4 py-3", ui.space.row);

/** Rows after the first inside a card carry the divider on their block start. */
const ROW_RULE = ui.rule.blockStart;

const ROW_INTERACTIVE = cn(
  "text-start transition-colors hover:bg-[color:var(--ui-surface-sunken)]",
  "focus-visible:bg-[color:var(--ui-surface-sunken)] focus-visible:outline-none",
);

/** 32px glyph tile — decorative, so it may sit below the 44px tap minimum. */
function RowGlyph({
  children,
  tone = "sunken",
}: {
  children: React.ReactNode;
  tone?: "sunken" | "ink" | "negative";
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid h-8 w-8 shrink-0 place-items-center",
        ui.radius.control,
        tone === "sunken" && cn(ui.surface.sunken, ui.tone.muted),
        // BG-0083: the 12% mix is a FILL and is correct; the text beside it
        // was the same token, which is a dark navy in both themes. The brand
        // foreground is `--ui-ink-fg`.
        tone === "ink" &&
          cn("bg-[color:color-mix(in_oklab,var(--ui-ink)_12%,transparent)]", ui.tone.ink),
        tone === "negative" &&
          "bg-[color:color-mix(in_oklab,var(--ui-negative)_16%,transparent)] text-[color:var(--ui-negative)]",
      )}
    >
      {children}
    </span>
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
  const { t, tr, lang } = useI18n();
  const { user, status, signOut } = useAuth();
  const navigate = useNavigate();
  const clubsQ = useQuery({
    queryKey: ["football", "clubs", lang],
    queryFn: () => footballService.getClubs(lang),
  });
  const [signOutOpen, setSignOutOpen] = useState(false);

  const favoriteClub = user?.favoriteClubId
    ? clubsQ.data?.find((c) => c.id === user.favoriteClubId)
    : undefined;

  const onSignOut = async (resetLocalData: boolean) => {
    await signOut({ resetLocalData });
    setSignOutOpen(false);
    toast.success(t("auth.success.signed_out"));
    navigate({ to: "/" });
  };

  return (
    <AppShell>
      <h1 className={cn("pt-2", ui.text.hero, ui.tone.ink)}>
        <span className="whitespace-pre-wrap">{t("profile.title")}</span>
      </h1>

      {status === "authenticated" && user ? (
        <AuthenticatedProfile
          user={user}
          favoriteClubLabel={favoriteClub ? tr(favoriteClub.name) : undefined}
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

function AuthenticatedProfile({
  user,
  favoriteClubLabel,
  favoriteClub,
  onSignOut,
}: {
  user: NonNullable<ReturnType<typeof useAuth>["user"]>;
  favoriteClubLabel?: string;
  favoriteClub?: ReturnType<typeof useI18n> extends unknown
    ? Parameters<typeof ClubCrest>[0]["club"] | undefined
    : never;
  onSignOut: () => void;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const saved = useSavedArticles();

  const notifOnCount =
    (user.notifications.matchAlerts ? 1 : 0) +
    (user.notifications.breakingNews ? 1 : 0) +
    (user.notifications.fantasyDeadlines ? 1 : 0);

  const notifItems: Array<[keyof typeof user.notifications, string]> = [
    ["matchAlerts", t("profile.notif.match")],
    ["breakingNews", t("profile.notif.news")],
    ["fantasyDeadlines", t("profile.notif.deadline")],
  ];

  return (
    <>
      {/* Hero card */}
      <section className={cn("mt-4 p-5", ui.surface.card)} aria-labelledby="profile-hero-name">
        <div className="flex items-center gap-4">
          <div
            className={cn(
              "grid h-20 w-20 shrink-0 place-items-center overflow-hidden",
              ui.radius.control,
              "text-[color:var(--ui-ink-deep)] shadow-[var(--ui-shadow-card)]",
            )}
            style={{ backgroundImage: "var(--ui-grad-action)" }}
          >
            {user.avatarDataUrl ? (
              <img src={user.avatarDataUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <UserCircle className="h-11 w-11" aria-hidden />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div id="profile-hero-name" className={cn("truncate", ui.text.title, ui.tone.default)}>
              {user.displayName}
            </div>
            <div className={cn("mt-0.5 truncate", ui.text.meta, ui.tone.ink)}>@{user.username}</div>
            <div className={cn("mt-0.5 truncate", ui.text.meta, ui.tone.muted)}>{user.email}</div>
          </div>
          <UiButton
            size="sm"
            variant="outline"
            onClick={() => navigate({ to: "/auth/profile-setup" })}
            className="shrink-0 gap-1 px-2.5 text-[color:var(--ui-on-surface)]"
            aria-label={t("profile.edit")}
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden sm:inline">{t("profile.edit")}</span>
          </UiButton>
        </div>

        {/* Stats strip — three tiles with News, two without it, so the row
            stays balanced instead of leaving a gap where the saved-articles
            tile was (owner decision — see `@/lib/feature-flags`). */}
        <div className={cn("mt-5 grid gap-2", NEWS_ENABLED ? "grid-cols-3" : "grid-cols-2")}>
          <StatTile
            icon={<Trophy className="h-4 w-4" aria-hidden />}
            label={t("profile.fav_club")}
            value={favoriteClubLabel ?? "—"}
            valueSlot={
              favoriteClub ? (
                <div className="flex items-center gap-1.5">
                  <ClubCrest club={favoriteClub} />
                  <span
                    className={cn(
                      "truncate",
                      ui.text.meta,
                      "[font-weight:var(--ui-weight-heavy)]",
                      ui.text.tabular,
                      ui.tone.default,
                    )}
                  >
                    {favoriteClubLabel}
                  </span>
                </div>
              ) : undefined
            }
          />
          {/* Saved articles — hidden at launch (NEWS_ENABLED); there is no
              News surface to save from or navigate to. */}
          {NEWS_ENABLED && (
            <StatTile
              icon={<Bookmark className="h-4 w-4" aria-hidden />}
              label={t("news.bookmark")}
              value={String(saved.hydrated ? saved.ids.length : 0)}
              monoValue
            />
          )}
          <StatTile
            icon={<Bell className="h-4 w-4" aria-hidden />}
            label={t("profile.notifications")}
            value={`${notifOnCount}/3`}
            monoValue
          />
        </div>
      </section>

      {/* Personal details */}
      <Group title={t("profile.section.personal")}>
        <InfoRow icon={<Mail className="h-4 w-4" />} label={t("profile.email")}>
          {user.email}
        </InfoRow>
        <InfoRow icon={<AtSign className="h-4 w-4" />} label={t("profile.username")} ruled>
          @{user.username}
        </InfoRow>
        <InfoRow icon={<Trophy className="h-4 w-4" />} label={t("profile.fav_club")} ruled>
          {favoriteClub ? (
            <span className="flex items-center gap-1.5">
              <ClubCrest club={favoriteClub} />
              {favoriteClubLabel}
            </span>
          ) : (
            "—"
          )}
        </InfoRow>
        <NavRow
          icon={<Pencil className="h-4 w-4" />}
          label={t("profile.edit")}
          ruled
          onClick={() => navigate({ to: "/auth/profile-setup" })}
        />
      </Group>

      {/* Preferences group */}
      <Group title={t("profile.section.preferences")}>
        {notifItems.map(([k, label], i) => (
          <div key={k} className={cn(ROW, i > 0 && ROW_RULE)}>
            <div className={cn("flex items-center gap-3", ui.text.body, ui.tone.default)}>
              <RowGlyph tone="ink">
                <Bell className="h-4 w-4" />
              </RowGlyph>
              <span className="[font-weight:var(--ui-weight-heavy)]">{label}</span>
            </div>
            <UiBadge tone={user.notifications[k] ? "positive" : "neutral"}>
              {user.notifications[k] ? "ON" : "OFF"}
            </UiBadge>
          </div>
        ))}
        <LanguageRow ruled />
        <ThemeRow ruled />
      </Group>

      {/* Account security */}
      <Group title={t("profile.section.security")}>
        <NavRow
          icon={<KeyRound className="h-4 w-4" />}
          label={t("profile.change_password")}
          description={t("profile.change_password_desc")}
          onClick={() => navigate({ to: "/auth/update-password" })}
        />
        <NavRow
          icon={<ShieldCheck className="h-4 w-4" />}
          label={t("profile.mfa_setup")}
          description={t("profile.mfa_setup_desc")}
          ruled
          onClick={() => navigate({ to: "/profile/security" })}
        />
        <NavRow
          icon={<LogOut className="h-4 w-4" />}
          label={t("profile.sign_out")}
          ruled
          onClick={onSignOut}
        />
      </Group>

      {/* Legal — same Group chrome and row layout as the sections above, so it
          reads as one more section rather than a bolted-on footer. These are
          plain router links rather than buttons because they navigate. */}
      <Group title={t("profile.section.legal")}>
        <LegalRow
          to="/terms"
          label={t("profile.legal.terms")}
          description={t("profile.legal.terms_desc")}
        />
        <LegalRow
          to="/privacy"
          label={t("profile.legal.privacy")}
          description={t("profile.legal.privacy_desc")}
          divided
        />
      </Group>

      {/* Danger zone */}
      <DeleteAccountSection />
    </>
  );
}

/* -------------------------------- rows ------------------------------------ */

function InfoRow({
  icon,
  label,
  children,
  ruled = false,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
  ruled?: boolean;
}) {
  return (
    <div className={cn(ROW, ruled && ROW_RULE)}>
      <div className={cn("flex min-w-0 items-center gap-3", ui.text.body, ui.tone.default)}>
        <RowGlyph tone="ink">{icon}</RowGlyph>
        <span className="[font-weight:var(--ui-weight-heavy)]">{label}</span>
      </div>
      <span
        className={cn(
          "min-w-0 truncate text-end",
          ui.text.body,
          "[font-weight:var(--ui-weight-heavy)]",
          ui.tone.default,
        )}
      >
        {children}
      </span>
    </div>
  );
}

function NavRow({
  icon,
  label,
  description,
  onClick,
  ruled = false,
}: {
  icon: React.ReactNode;
  label: string;
  description?: string;
  onClick: () => void;
  ruled?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} className={cn(ROW, ROW_INTERACTIVE, ruled && ROW_RULE)}>
      <span className={cn("flex min-w-0 items-center gap-3", ui.text.body, ui.tone.default)}>
        <RowGlyph>{icon}</RowGlyph>
        <span className="min-w-0 text-start">
          <span className="block [font-weight:var(--ui-weight-heavy)]">{label}</span>
          {description ? (
            <span className={cn("block", ui.text.meta, ui.tone.muted)}>{description}</span>
          ) : null}
        </span>
      </span>
      <ChevronRight className={cn("h-4 w-4 shrink-0 rtl:rotate-180", ui.tone.muted)} aria-hidden />
    </button>
  );
}

/**
 * The two device preferences, as rows. They are device-scoped rather than
 * account-scoped — they live in this browser's `localStorage` — so they belong
 * to every visitor, signed in or not, and are rendered by all three profile
 * states rather than only the authenticated one. A preference nobody who is
 * signed out can reach is the defect BG-0081 was opened for.
 */
function LanguageRow({ ruled = false }: { ruled?: boolean }) {
  const { t } = useI18n();
  return (
    <div className={cn(ROW, ruled && ROW_RULE)}>
      <div className={cn("flex items-center gap-3", ui.text.body, ui.tone.default)}>
        <RowGlyph tone="ink">
          <Languages className="h-4 w-4" />
        </RowGlyph>
        <span className="[font-weight:var(--ui-weight-heavy)]">{t("language.switch")}</span>
      </div>
      <LanguageSwitcher />
    </div>
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
 * left with a dangling top rule: `DevicePreferences` still opens with an
 * unruled `LanguageRow`, and the signed-in group's own rows carry their rule
 * on the leading edge.
 */
function ThemeRow({ ruled = false }: { ruled?: boolean }) {
  const { t } = useI18n();
  if (!DARK_MODE_ENABLED) return null;
  return (
    <div className={cn("px-4 py-3", ui.space.row, ruled && ROW_RULE)}>
      <div className={cn("flex items-center gap-3", ui.text.body, ui.tone.default)}>
        <RowGlyph tone="ink">
          <Palette className="h-4 w-4" />
        </RowGlyph>
        <span className="[font-weight:var(--ui-weight-heavy)]">{t("theme.switch")}</span>
      </div>
      <ThemeSwitcher className="mt-3" />
    </div>
  );
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
      <section className="mt-6">
        <div className={cn("mb-2 px-1", ui.text.label, "text-[color:var(--ui-negative)]")}>
          {t("profile.section.danger")}
        </div>
        <div
          className={cn(
            "overflow-hidden border",
            ui.radius.control,
            "border-[color:color-mix(in_oklab,var(--ui-negative)_30%,transparent)]",
            "bg-[color:color-mix(in_oklab,var(--ui-negative)_7%,var(--ui-surface))]",
            "shadow-[var(--ui-shadow-card)]",
          )}
        >
          {pending ? (
            <div className="flex items-start gap-3 px-4 py-4">
              <RowGlyph tone="negative">
                <AlertTriangle className="h-4 w-4" />
              </RowGlyph>
              <div className="min-w-0 flex-1">
                <div
                  className={cn(
                    ui.text.body,
                    "[font-weight:var(--ui-weight-heavy)]",
                    ui.tone.default,
                  )}
                >
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
                  className="mt-3 text-[color:var(--ui-on-surface)]"
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
                "text-start transition-colors focus-visible:outline-none",
                "hover:bg-[color:color-mix(in_oklab,var(--ui-negative)_12%,transparent)]",
                "focus-visible:bg-[color:color-mix(in_oklab,var(--ui-negative)_12%,transparent)]",
              )}
            >
              <span className={cn("flex min-w-0 items-center gap-3", ui.text.body)}>
                <RowGlyph tone="negative">
                  <Trash2 className="h-4 w-4" />
                </RowGlyph>
                <span className="min-w-0 text-start">
                  <span className="block [font-weight:var(--ui-weight-heavy)] text-[color:var(--ui-negative)]">
                    {t("profile.delete_account")}
                  </span>
                  <span className={cn("block", ui.text.meta, ui.tone.muted)}>
                    {t("profile.delete_account_desc")}
                  </span>
                </span>
              </span>
              <ChevronRight
                className="h-4 w-4 shrink-0 text-[color:var(--ui-negative)] rtl:rotate-180"
                aria-hidden
              />
            </button>
          )}
        </div>
      </section>

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
            ui.radius.control,
            "border-[color:color-mix(in_oklab,var(--ui-negative)_30%,transparent)]",
            "bg-[color:color-mix(in_oklab,var(--ui-negative)_7%,transparent)]",
            ui.text.meta,
          )}
        />
      </UiModal>
    </>
  );
}

/* ------------------------------ subcomponents ----------------------------- */

function StatTile({
  icon,
  label,
  value,
  valueSlot,
  monoValue,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueSlot?: React.ReactNode;
  monoValue?: boolean;
}) {
  return (
    <div className={cn("min-w-0 p-3", ui.radius.control, ui.surface.sunken)}>
      {/* The label wraps rather than truncates: at 390px a three-up tile is
          ~100px wide and "Notifications" / "الإشعارات" does not fit on one
          line at any step of the scale. `ui.text.micro` keeps it on the
          language's 11px step, and its tracking is `ltr:`-only. */}
      <div className={cn("flex items-start gap-1.5", ui.tone.muted)}>
        <span className={cn("shrink-0", ui.tone.ink)}>{icon}</span>
        <span
          className={cn(
            ui.text.micro,
            "[font-weight:var(--ui-weight-heavy)] uppercase leading-tight ltr:tracking-wide",
          )}
        >
          {label}
        </span>
      </div>
      <div className="mt-1.5 min-w-0">
        {valueSlot ?? (
          <div
            className={cn(
              "truncate",
              ui.text.body,
              "[font-weight:var(--ui-weight-hero)]",
              ui.tone.default,
              monoValue && ui.text.tabular,
            )}
          >
            {value}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * One row of the legal Group. Same chrome as the account-security rows above
 * (icon chip, title over description, chevron), but a router `Link` rather
 * than a `button` — it goes to a page. `text-start` and the logical `gap`
 * keep it mirrored in Arabic; the chevron is `ChevronRight`, matching the
 * rest of the page, which already flips with the RTL layout.
 */
function LegalRow({
  to,
  label,
  description,
  divided,
}: {
  to: "/terms" | "/privacy";
  label: string;
  description: string;
  divided?: boolean;
}) {
  return (
    <Link
      to={to}
      // Was the one row in this file still on the V1 palette (`bg-muted/50`,
      // `bg-muted/60`) and the one not built from the shared row idioms.
      className={cn(ROW, ROW_INTERACTIVE, divided && ROW_RULE)}
    >
      <div className={cn("flex items-center gap-3", ui.text.secondary, ui.tone.default)}>
        <span
          className={cn(
            "grid h-8 w-8 place-items-center",
            ui.radius.control,
            ui.surface.sunken,
            ui.tone.muted,
          )}
          aria-hidden
        >
          <FileText className="h-4 w-4" />
        </span>
        <span className="text-start">
          <span className="block [font-weight:var(--ui-weight-heavy)]">{label}</span>
          <span className={cn("block", ui.text.meta, ui.tone.muted)}>{description}</span>
        </span>
      </div>
      <ChevronRight className={cn("h-4 w-4 shrink-0", ui.tone.muted)} aria-hidden />
    </Link>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className={cn("mb-2 px-1", ui.text.label, ui.tone.muted)}>{title}</h2>
      <div className={cn("overflow-hidden", ui.surface.card)}>{children}</div>
    </section>
  );
}

/* ---------------------------- guest / anonymous --------------------------- */

function GuestProfile() {
  const { t } = useI18n();
  const navigate = useNavigate();
  return (
    <>
      <div className="mt-4 grid gap-3">
        <UiCard padding="lg">
          <UiBadge tone="action" className="mb-2">
            {t("profile.guest_badge")}
          </UiBadge>
          <h2 className={cn(ui.text.section, ui.tone.default)}>
            <Trans text={t("profile.guest_title")} />
          </h2>
          <p className={cn("mt-1", ui.text.secondary, ui.tone.muted)}>{t("profile.guest_body")}</p>
          <div className="mt-4 grid gap-2">
            <UiButton onClick={() => navigate({ to: "/auth/register" })}>
              <UserPlus className="h-4 w-4" aria-hidden /> {t("auth.prompt.register")}
            </UiButton>
            <UiButton
              variant="outline"
              onClick={() => navigate({ to: "/auth/login" })}
              className="text-[color:var(--ui-on-surface)]"
            >
              <LogIn className="h-4 w-4" aria-hidden /> {t("auth.prompt.login")}
            </UiButton>
          </div>
        </UiCard>
      </div>
      <DevicePreferences />
    </>
  );
}

function AnonymousProfile() {
  const { t } = useI18n();
  const navigate = useNavigate();
  return (
    <>
      <UiCard padding="lg" className="mt-4 text-center">
        <Logo variant="icon" className="!h-14 !w-14" />
        <h2 className={cn("mt-3", ui.text.section, ui.tone.default)}>
          <Trans text={t("profile.anon_title")} />
        </h2>
        <p className={cn("mt-1", ui.text.secondary, ui.tone.muted)}>{t("profile.anon_body")}</p>
        <div className="mt-4 grid gap-2">
          <UiButton onClick={() => navigate({ to: "/auth/register" })}>
            <UserPlus className="h-4 w-4" aria-hidden /> {t("auth.prompt.register")}
          </UiButton>
          <UiButton
            variant="outline"
            onClick={() => navigate({ to: "/auth/login" })}
            className="text-[color:var(--ui-on-surface)]"
          >
            <LogIn className="h-4 w-4" aria-hidden /> {t("auth.prompt.login")}
          </UiButton>
        </div>
      </UiCard>
      <DevicePreferences />
    </>
  );
}
