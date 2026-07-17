import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { ClubCrest } from "@/components/common/ClubCrest";
import { SectionHeader } from "@/components/common/SectionHeader";
import { useI18n } from "@/i18n/provider";
import { useAuth } from "@/auth/AuthProvider";
import { botolaService } from "@/services/mock";
import { Logo } from "@/components/brand/Logo";
import { UserCircle, LogIn, UserPlus, LogOut, Pencil, Bell, Check, X } from "lucide-react";
import { LanguageSwitcher } from "@/components/shell/LanguageSwitcher";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Profil — BotolaGO" },
      { name: "description", content: "Gérez votre compte, vos clubs suivis et vos préférences BotolaGO." },
      { property: "og:title", content: "Profil — BotolaGO" },
      { property: "og:description", content: "Gérez votre compte, vos clubs suivis et vos préférences BotolaGO." },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { t, tr } = useI18n();
  const { user, status, signOut } = useAuth();
  const navigate = useNavigate();
  const clubsQ = useQuery({ queryKey: ["clubs"], queryFn: () => botolaService.getClubs() });
  const [signOutOpen, setSignOutOpen] = useState(false);

  const favoriteClub = user?.favoriteClubId ? clubsQ.data?.find((c) => c.id === user.favoriteClubId) : undefined;

  const onSignOut = async (resetLocalData: boolean) => {
    await signOut({ resetLocalData });
    setSignOutOpen(false);
    toast.success(t("auth.success.signed_out"));
    navigate({ to: "/" });
  };

  return (
    <AppShell>
      <h1 className="pt-2 text-2xl font-black tracking-tight text-foreground">{t("profile.title")}</h1>

      {status === "authenticated" && user ? (
        <AuthenticatedProfile
          user={user}
          favoriteClubLabel={favoriteClub ? tr(favoriteClub.name) : undefined}
          onSignOut={() => setSignOutOpen(true)}
        />
      ) : status === "guest" ? (
        <GuestProfile />
      ) : (
        <AnonymousProfile />
      )}

      <SectionHeader title={t("profile.language")} />
      <div className="glass-surface glass-regular flex items-center justify-between rounded-2xl border border-[var(--glass-border)] px-4 py-3">
        <span className="text-sm font-semibold text-foreground">{t("language.switch")}</span>
        <LanguageSwitcher />
      </div>

      <Dialog open={signOutOpen} onOpenChange={setSignOutOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("profile.sign_out_title")}</DialogTitle>
            <DialogDescription>{t("profile.sign_out_body")}</DialogDescription>
          </DialogHeader>
          <div className="mt-2 grid gap-2">
            <button onClick={() => onSignOut(false)} className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-2xl bg-[color:var(--brand-primary)] px-4 text-sm font-bold text-white">
              <Check className="h-4 w-4" aria-hidden /> {t("profile.sign_out_keep")}
            </button>
            <button onClick={() => onSignOut(true)} className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-2xl border border-input bg-background px-4 text-sm font-semibold text-destructive hover:bg-muted">
              <X className="h-4 w-4" aria-hidden /> {t("profile.sign_out_reset")}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function AuthenticatedProfile({
  user, favoriteClubLabel, onSignOut,
}: { user: NonNullable<ReturnType<typeof useAuth>["user"]>; favoriteClubLabel?: string; onSignOut: () => void }) {
  const { t } = useI18n();
  const navigate = useNavigate();

  const notifItems: Array<[keyof typeof user.notifications, string]> = [
    ["matchAlerts", t("profile.notif.match")],
    ["breakingNews", t("profile.notif.news")],
    ["fantasyDeadlines", t("profile.notif.deadline")],
  ];

  return (
    <>
      <div className="mt-4 glass-surface glass-strong flex items-center gap-3 rounded-3xl border border-[var(--glass-border)] p-4">
        <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl bg-[var(--bg-brand-gradient)] text-white">
          {user.avatarDataUrl ? <img src={user.avatarDataUrl} alt="" className="h-full w-full object-cover" /> : <UserCircle className="h-10 w-10" aria-hidden />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-black text-foreground">{user.displayName}</div>
          <div className="truncate text-xs text-muted-foreground">@{user.username}</div>
          <div className="truncate text-xs text-muted-foreground">{user.email}</div>
        </div>
        <button
          onClick={() => navigate({ to: "/auth/profile-setup" })}
          className="inline-flex items-center gap-1 rounded-xl border border-input bg-background px-2.5 py-1.5 text-[11px] font-semibold hover:bg-muted"
          aria-label={t("profile.edit")}
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden /> {t("profile.edit")}
        </button>
      </div>

      <SectionHeader title={t("profile.fav_club")} />
      <div className="glass-surface glass-regular rounded-2xl border border-[var(--glass-border)] px-4 py-3 text-sm text-foreground">
        {favoriteClubLabel ?? "—"}
      </div>

      <SectionHeader title={t("profile.notifications")} />
      <div className="grid gap-2">
        {notifItems.map(([k, label]) => (
          <div key={k} className="glass-surface glass-regular flex items-center justify-between rounded-2xl border border-[var(--glass-border)] px-4 py-3 text-sm">
            <div className="flex items-center gap-2 text-foreground"><Bell className="h-4 w-4 text-[color:var(--brand-accent)]" aria-hidden />{label}</div>
            <span className={`text-xs font-bold ${user.notifications[k] ? "text-emerald-600" : "text-muted-foreground"}`}>
              {user.notifications[k] ? "ON" : "OFF"}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-6">
        <button onClick={onSignOut}
          className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 text-sm font-bold text-destructive hover:bg-destructive/10">
          <LogOut className="h-4 w-4" aria-hidden /> {t("profile.sign_out")}
        </button>
      </div>
    </>
  );
}

function GuestProfile() {
  const { t } = useI18n();
  const navigate = useNavigate();
  return (
    <div className="mt-4 grid gap-3">
      <div className="rounded-3xl border border-[var(--glass-border)] bg-white/60 p-5 backdrop-blur">
        <div className="mb-2 inline-flex rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-amber-700">
          {t("profile.guest_badge")}
        </div>
        <h2 className="text-lg font-black text-foreground">{t("profile.guest_title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("profile.guest_body")}</p>
        <div className="mt-4 grid gap-2">
          <button onClick={() => navigate({ to: "/auth/register" })} className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-2xl bg-[color:var(--brand-primary)] px-4 text-sm font-bold text-white">
            <UserPlus className="h-4 w-4" aria-hidden /> {t("auth.prompt.register")}
          </button>
          <button onClick={() => navigate({ to: "/auth/login" })} className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-2xl border border-input bg-background px-4 text-sm font-semibold hover:bg-muted">
            <LogIn className="h-4 w-4" aria-hidden /> {t("auth.prompt.login")}
          </button>
        </div>
      </div>
    </div>
  );
}

function AnonymousProfile() {
  const { t } = useI18n();
  const navigate = useNavigate();
  return (
    <div className="mt-4 rounded-3xl border border-[var(--glass-border)] bg-white/60 p-6 text-center backdrop-blur">
      <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-[var(--bg-brand-gradient)] p-2 text-white">
        <Logo variant="icon" className="!h-12 !w-12" />
      </div>
      <h2 className="mt-3 text-lg font-black text-foreground">{t("profile.anon_title")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("profile.anon_body")}</p>
      <div className="mt-4 grid gap-2">
        <button onClick={() => navigate({ to: "/auth/register" })} className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-2xl bg-[color:var(--brand-primary)] px-4 text-sm font-bold text-white">
          <UserPlus className="h-4 w-4" aria-hidden /> {t("auth.prompt.register")}
        </button>
        <button onClick={() => navigate({ to: "/auth/login" })} className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-2xl border border-input bg-background px-4 text-sm font-semibold hover:bg-muted">
          <LogIn className="h-4 w-4" aria-hidden /> {t("auth.prompt.login")}
        </button>
      </div>
    </div>
  );
}
