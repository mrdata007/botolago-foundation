import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { ClubCrest } from "@/components/common/ClubCrest";
import { Trans } from "@/components/common/Trans";
import { useI18n } from "@/i18n/provider";
import { useAuth } from "@/auth/AuthProvider";
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
  component: ProfilePage,
});

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
        <span className="text-brand">{t("profile.title")}</span>
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
              className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-2xl bg-[color:var(--brand-primary)] px-4 text-sm font-bold text-white transition-opacity hover:opacity-95"
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

      {/* Preferences group */}
      <Group title={t("profile.notifications")}>
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
        </div>
      </Group>

      {/* Language */}
      <Group title={t("profile.language")}>
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
      </Group>

      {/* Account actions */}
      <Group title={t("profile.title")}>
        <button
          onClick={() => navigate({ to: "/auth/profile-setup" })}
          className="flex w-full items-center justify-between px-4 py-3 text-start transition-colors hover:bg-muted/50 focus-visible:bg-muted/60 focus-visible:outline-none"
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
          <ChevronRight className="h-4 w-4 text-muted-foreground rtl:rotate-180" aria-hidden />
        </button>
      </Group>

      <div className="mt-6">
        <button
          onClick={onSignOut}
          className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 text-sm font-bold text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40"
        >
          <LogOut className="h-4 w-4" aria-hidden /> {t("profile.sign_out")}
        </button>
      </div>
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
              className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-[color:var(--brand-primary)] px-4 text-sm font-bold text-white shadow-md shadow-blue-950/10 transition-opacity hover:opacity-95"
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
            className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-[color:var(--brand-primary)] px-4 text-sm font-bold text-white shadow-md shadow-blue-950/10 transition-opacity hover:opacity-95"
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
