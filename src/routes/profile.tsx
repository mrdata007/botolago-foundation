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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useSavedArticles } from "@/lib/saved-articles";

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
      <h1 className="pt-2 text-2xl font-black tracking-tight text-foreground">
        <span className="text-brand whitespace-pre-wrap">{t("profile.title")}</span>
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

      <Dialog open={signOutOpen} onOpenChange={setSignOutOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("profile.sign_out_title")}</DialogTitle>
            <DialogDescription>{t("profile.sign_out_body")}</DialogDescription>
          </DialogHeader>
          <div className="mt-2 grid gap-2">
            <button
              onClick={() => onSignOut(false)}
              className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-2xl cta-brand px-4 text-sm font-bold transition-opacity hover:opacity-95"
            >
              <Check className="h-4 w-4" aria-hidden /> {t("profile.sign_out_keep")}
            </button>
            <button
              onClick={() => onSignOut(true)}
              className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 text-sm font-semibold text-destructive transition-colors hover:bg-destructive/10"
            >
              <X className="h-4 w-4" aria-hidden /> {t("profile.sign_out_reset")}
            </button>
          </div>
        </DialogContent>
      </Dialog>
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
      <section
        className="relative mt-4 overflow-hidden rounded-[var(--radius-card-lg,1.25rem)] border border-[var(--glass-border)] bg-[color:var(--surface)] p-5 shadow-[var(--shadow-elevated,0_10px_30px_-12px_rgba(0,0,0,0.15))]"
        aria-labelledby="profile-hero-name"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-16 h-40 opacity-70"
          style={{
            background:
              "radial-gradient(60% 60% at 50% 100%, color-mix(in oklab, var(--brand-primary) 22%, transparent), transparent 70%)",
          }}
        />
        <div className="relative flex items-center gap-4">
          <div
            className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-2xl text-white ring-2 ring-white/70"
            style={{
              background: "var(--bg-brand-gradient)",
              boxShadow:
                "0 12px 30px -12px color-mix(in oklab, var(--brand-primary) 55%, transparent)",
            }}
          >
            {user.avatarDataUrl ? (
              <img src={user.avatarDataUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <UserCircle className="h-11 w-11" aria-hidden />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div
              id="profile-hero-name"
              className="truncate text-lg font-black tracking-tight text-foreground"
            >
              {user.displayName}
            </div>
            <div className="mt-0.5 truncate text-xs font-semibold text-[color:var(--brand-accent)]">
              @{user.username}
            </div>
            <div className="mt-0.5 truncate text-xs text-muted-foreground">{user.email}</div>
          </div>
          <button
            onClick={() => navigate({ to: "/auth/profile-setup" })}
            className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-xl border border-input bg-background px-2.5 text-[11px] font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)]/40"
            aria-label={t("profile.edit")}
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden xs:inline sm:inline">{t("profile.edit")}</span>
          </button>
        </div>

        {/* Stats strip */}
        <div className="relative mt-5 grid grid-cols-3 gap-2">
          <StatTile
            icon={<Trophy className="h-4 w-4" aria-hidden />}
            label={t("profile.fav_club")}
            value={favoriteClubLabel ?? "—"}
            valueSlot={
              favoriteClub ? (
                <div className="flex items-center gap-1.5">
                  <ClubCrest club={favoriteClub} />
                  <span className="truncate text-[13px] font-black tabular-nums text-foreground">
                    {favoriteClubLabel}
                  </span>
                </div>
              ) : undefined
            }
          />
          <StatTile
            icon={<Bookmark className="h-4 w-4" aria-hidden />}
            label={t("news.bookmark")}
            value={String(saved.hydrated ? saved.ids.length : 0)}
            monoValue
          />
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
        <div className="divide-y divide-[var(--border-subtle,rgba(0,0,0,0.06))]">
          <InfoRow icon={<Mail className="h-4 w-4" />} label={t("profile.email")}>
            {user.email}
          </InfoRow>
          <InfoRow icon={<AtSign className="h-4 w-4" />} label={t("profile.username")}>
            @{user.username}
          </InfoRow>
          <InfoRow icon={<Trophy className="h-4 w-4" />} label={t("profile.fav_club")}>
            {favoriteClub ? (
              <span className="flex items-center gap-1.5">
                <ClubCrest club={favoriteClub} />
                {favoriteClubLabel}
              </span>
            ) : (
              "—"
            )}
          </InfoRow>
        </div>
        <button
          onClick={() => navigate({ to: "/auth/profile-setup" })}
          className="flex w-full items-center justify-between border-t border-[var(--border-subtle,rgba(0,0,0,0.06))] px-4 py-3 text-start transition-colors hover:bg-muted/50 focus-visible:bg-muted/60 focus-visible:outline-none"
        >
          <div className="flex items-center gap-3 text-sm text-foreground">
            <span
              className="grid h-8 w-8 place-items-center rounded-xl bg-muted text-foreground/80"
              aria-hidden
            >
              <Pencil className="h-4 w-4" />
            </span>
            <span className="font-semibold">{t("profile.edit")}</span>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
        </button>
      </Group>

      {/* Preferences group */}
      <Group title={t("profile.section.preferences")}>
        <div className="divide-y divide-[var(--border-subtle,rgba(0,0,0,0.06))]">
          {notifItems.map(([k, label]) => (
            <div key={k} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3 text-sm text-foreground">
                <span
                  className="grid h-8 w-8 place-items-center rounded-xl"
                  style={{
                    background: "color-mix(in oklab, var(--brand-accent) 12%, transparent)",
                    color: "var(--brand-accent)",
                  }}
                  aria-hidden
                >
                  <Bell className="h-4 w-4" />
                </span>
                <span className="font-semibold">{label}</span>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                  user.notifications[k]
                    ? "bg-emerald-500/15 text-emerald-700"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {user.notifications[k] ? "ON" : "OFF"}
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3 text-sm text-foreground">
              <span
                className="grid h-8 w-8 place-items-center rounded-xl"
                style={{
                  background: "color-mix(in oklab, var(--brand-primary) 12%, transparent)",
                  color: "var(--brand-primary)",
                }}
                aria-hidden
              >
                <Languages className="h-4 w-4" />
              </span>
              <span className="font-semibold">{t("language.switch")}</span>
            </div>
            <LanguageSwitcher />
          </div>
        </div>
      </Group>

      {/* Account security */}
      <Group title={t("profile.section.security")}>
        <button
          onClick={() => navigate({ to: "/auth/update-password" })}
          className="flex w-full items-center justify-between px-4 py-3 text-start transition-colors hover:bg-muted/50 focus-visible:bg-muted/60 focus-visible:outline-none"
        >
          <div className="flex items-center gap-3 text-sm text-foreground">
            <span
              className="grid h-8 w-8 place-items-center rounded-xl bg-muted text-foreground/80"
              aria-hidden
            >
              <KeyRound className="h-4 w-4" />
            </span>
            <span className="text-start">
              <span className="block font-semibold">{t("profile.change_password")}</span>
              <span className="block text-xs font-normal text-muted-foreground">
                {t("profile.change_password_desc")}
              </span>
            </span>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        </button>
        <button
          onClick={() => navigate({ to: "/profile/security" })}
          className="flex w-full items-center justify-between border-t border-[var(--border-subtle,rgba(0,0,0,0.06))] px-4 py-3 text-start transition-colors hover:bg-muted/50 focus-visible:bg-muted/60 focus-visible:outline-none"
        >
          <div className="flex items-center gap-3 text-sm text-foreground">
            <span
              className="grid h-8 w-8 place-items-center rounded-xl bg-muted text-foreground/80"
              aria-hidden
            >
              <ShieldCheck className="h-4 w-4" />
            </span>
            <span className="text-start">
              <span className="block font-semibold">{t("profile.mfa_setup")}</span>
              <span className="block text-xs font-normal text-muted-foreground">
                {t("profile.mfa_setup_desc")}
              </span>
            </span>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        </button>
        <button
          onClick={onSignOut}
          className="flex w-full items-center justify-between border-t border-[var(--border-subtle,rgba(0,0,0,0.06))] px-4 py-3 text-start transition-colors hover:bg-muted/50 focus-visible:bg-muted/60 focus-visible:outline-none"
        >
          <div className="flex items-center gap-3 text-sm text-foreground">
            <span
              className="grid h-8 w-8 place-items-center rounded-xl bg-muted text-foreground/80"
              aria-hidden
            >
              <LogOut className="h-4 w-4" />
            </span>
            <span className="font-semibold">{t("profile.sign_out")}</span>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
        </button>
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

/* -------------------------------- info row -------------------------------- */

function InfoRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="flex min-w-0 items-center gap-3 text-sm text-foreground">
        <span
          className="grid h-8 w-8 shrink-0 place-items-center rounded-xl"
          style={{
            background: "color-mix(in oklab, var(--brand-accent) 12%, transparent)",
            color: "var(--brand-accent)",
          }}
          aria-hidden
        >
          {icon}
        </span>
        <span className="font-semibold">{label}</span>
      </div>
      <span className="min-w-0 truncate text-end text-sm font-bold text-foreground">
        {children}
      </span>
    </div>
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
        <div className="mb-2 px-1 text-[11px] font-bold uppercase tracking-widest text-destructive/80">
          {t("profile.section.danger")}
        </div>
        <div className="overflow-hidden rounded-2xl border border-destructive/25 bg-destructive/5">
          {pending ? (
            <div className="flex items-start gap-3 px-4 py-4">
              <span
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-destructive/15 text-destructive"
                aria-hidden
              >
                <AlertTriangle className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-foreground">
                  {t("profile.delete_pending_title")}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t("profile.delete_pending_body")}
                </p>
                <button
                  onClick={cancelDeletion}
                  disabled={submitting}
                  className="mt-3 inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-input bg-background px-3 text-xs font-bold text-foreground transition-colors hover:bg-muted disabled:opacity-60"
                >
                  {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
                  {t("profile.delete_cancel_request_cta")}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setDialogOpen(true)}
              className="flex w-full items-center justify-between px-4 py-3 text-start transition-colors hover:bg-destructive/10 focus-visible:outline-none"
            >
              <div className="flex items-center gap-3 text-sm">
                <span
                  className="grid h-8 w-8 place-items-center rounded-xl bg-destructive/15 text-destructive"
                  aria-hidden
                >
                  <Trash2 className="h-4 w-4" />
                </span>
                <span>
                  <span className="block font-bold text-destructive">
                    {t("profile.delete_account")}
                  </span>
                  <span className="block text-xs font-normal text-muted-foreground">
                    {t("profile.delete_account_desc")}
                  </span>
                </span>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-destructive/70" aria-hidden />
            </button>
          )}
        </div>
      </section>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => (open ? setDialogOpen(true) : closeDialog())}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("profile.delete_confirm_title")}</DialogTitle>
            <DialogDescription>{t("profile.delete_confirm_body")}</DialogDescription>
          </DialogHeader>
          <label className="mt-2 flex items-start gap-2 rounded-xl border border-destructive/25 bg-destructive/5 p-3 text-xs font-semibold text-foreground">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-input"
            />
            <span>{t("profile.delete_confirm_checkbox")}</span>
          </label>
          <div className="mt-3 grid gap-2">
            <button
              onClick={confirmDelete}
              disabled={!acknowledged || submitting}
              className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-2xl bg-destructive px-4 text-sm font-bold text-destructive-foreground transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {t("profile.delete_confirm_cta")}
            </button>
            <button
              onClick={closeDialog}
              className="inline-flex min-h-[44px] items-center justify-center rounded-2xl border border-input bg-background px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
            >
              {t("profile.delete_cancel_cta")}
            </button>
          </div>
        </DialogContent>
      </Dialog>
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
    <div className="min-w-0 rounded-2xl border border-[var(--border-subtle,rgba(0,0,0,0.06))] bg-[color:var(--surface,#fff)]/70 p-3 backdrop-blur-sm">
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        <span className="text-[color:var(--brand-accent)]">{icon}</span>
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-1.5 min-w-0">
        {valueSlot ?? (
          <div
            className={`truncate text-[15px] font-black text-foreground ${
              monoValue ? "tabular-nums" : ""
            }`}
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
      className={`flex w-full items-center justify-between px-4 py-3 text-start transition-colors hover:bg-muted/50 focus-visible:bg-muted/60 focus-visible:outline-none${
        divided ? " border-t border-[var(--border-subtle,rgba(0,0,0,0.06))]" : ""
      }`}
    >
      <div className="flex items-center gap-3 text-sm text-foreground">
        <span
          className="grid h-8 w-8 place-items-center rounded-xl bg-muted text-foreground/80"
          aria-hidden
        >
          <FileText className="h-4 w-4" />
        </span>
        <span className="text-start">
          <span className="block font-semibold">{label}</span>
          <span className="block text-xs font-normal text-muted-foreground">{description}</span>
        </span>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <div className="mb-2 px-1 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
        {title}
      </div>
      <div className="overflow-hidden rounded-2xl border border-[var(--glass-border)] bg-[color:var(--surface,#fff)]/85 shadow-sm">
        {children}
      </div>
    </section>
  );
}

/* ---------------------------- guest / anonymous --------------------------- */

function GuestProfile() {
  const { t } = useI18n();
  const navigate = useNavigate();
  return (
    <div className="mt-4 grid gap-3">
      <div className="relative overflow-hidden rounded-3xl border border-[var(--glass-border)] bg-[color:var(--surface,#fff)]/85 p-5 shadow-sm">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-16 h-32"
          style={{
            background:
              "radial-gradient(60% 60% at 50% 100%, rgba(245, 158, 11, 0.16), transparent 70%)",
          }}
        />
        <div className="relative">
          <div className="mb-2 inline-flex rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-amber-700">
            {t("profile.guest_badge")}
          </div>
          <h2 className="text-lg font-black text-foreground">
            <Trans text={t("profile.guest_title")} />
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("profile.guest_body")}</p>
          <div className="mt-4 grid gap-2">
            <button
              onClick={() => navigate({ to: "/auth/register" })}
              className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl cta-brand px-4 text-sm font-bold shadow-md shadow-blue-950/10 transition-opacity hover:opacity-95"
            >
              <UserPlus className="h-4 w-4" aria-hidden /> {t("auth.prompt.register")}
            </button>
            <button
              onClick={() => navigate({ to: "/auth/login" })}
              className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl border border-input bg-background px-4 text-sm font-semibold hover:bg-muted"
            >
              <LogIn className="h-4 w-4" aria-hidden /> {t("auth.prompt.login")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AnonymousProfile() {
  const { t } = useI18n();
  const navigate = useNavigate();
  return (
    <div className="relative mt-4 overflow-hidden rounded-3xl border border-[var(--glass-border)] bg-[color:var(--surface,#fff)]/85 p-6 text-center shadow-sm">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-20 h-40"
        style={{
          background:
            "radial-gradient(60% 60% at 50% 100%, color-mix(in oklab, var(--brand-primary) 20%, transparent), transparent 70%)",
        }}
      />
      <div className="relative">
        <div
          className="mx-auto grid h-16 w-16 place-items-center rounded-2xl p-2 text-white"
          style={{ background: "var(--bg-brand-gradient)" }}
        >
          <Logo variant="icon" className="!h-12 !w-12" />
        </div>
        <h2 className="mt-3 text-lg font-black text-foreground">
          <Trans text={t("profile.anon_title")} />
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("profile.anon_body")}</p>
        <div className="mt-4 grid gap-2">
          <button
            onClick={() => navigate({ to: "/auth/register" })}
            className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl cta-brand px-4 text-sm font-bold shadow-md shadow-blue-950/10 transition-opacity hover:opacity-95"
          >
            <UserPlus className="h-4 w-4" aria-hidden /> {t("auth.prompt.register")}
          </button>
          <button
            onClick={() => navigate({ to: "/auth/login" })}
            className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl border border-input bg-background px-4 text-sm font-semibold hover:bg-muted"
          >
            <LogIn className="h-4 w-4" aria-hidden /> {t("auth.prompt.login")}
          </button>
        </div>
      </div>
    </div>
  );
}
