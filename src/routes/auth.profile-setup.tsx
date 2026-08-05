import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Camera,
  CheckCircle2,
  Loader2,
  Trophy,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { AuthShell, AuthPrimaryButton, AuthSecondaryButton } from "@/components/auth/AuthShell";
import { useI18n } from "@/i18n/provider";
import { useAuth } from "@/auth/AuthProvider";
import { authService } from "@/services/auth";
import { footballService } from "@/services/football";
import type { Language } from "@/types/domain";
import type { NotificationPreferences } from "@/services/auth";
import { ClubCrest } from "@/components/common/ClubCrest";
import { sanitizeAuthCallbackNext } from "@/lib/auth-callback";

export const Route = createFileRoute("/auth/profile-setup")({
  head: () => ({ meta: [{ title: "Personnalisez votre profil — BotolaGO" }] }),
  validateSearch: (search: Record<string, unknown>) => {
    const next =
      typeof search.next === "string" ? sanitizeAuthCallbackNext(search.next) : undefined;
    return next && next !== "/" ? { next } : {};
  },
  component: ProfileSetupPage,
});

const STEPS = 3;

function ProfileSetupPage() {
  const { t, tr, lang, setLanguage, dir } = useI18n();
  const { user, status, refresh } = useAuth();
  const navigate = useNavigate();
  const { next = "/" } = Route.useSearch();
  const [step, setStep] = useState(1);
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [avatar, setAvatar] = useState<string | undefined>();
  const [favoriteClubId, setFavoriteClubId] = useState<string | undefined>();
  const [prefs, setPrefs] = useState<NotificationPreferences>({
    matchAlerts: true,
    breakingNews: true,
    fantasyDeadlines: true,
  });
  const [chosenLang, setChosenLang] = useState<Language>(lang);
  const [submitting, setSubmitting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (status === "anonymous") navigate({ to: "/auth/login", search: { next } });
    if (status === "guest") navigate({ to: "/" });
  }, [status, navigate, next]);

  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName);
      setUsername(user.username);
      setAvatar(user.avatarDataUrl);
      setFavoriteClubId(user.favoriteClubId);
      setPrefs(user.notifications);
      setChosenLang(user.language);
    }
  }, [user]);

  const clubsQ = useQuery({
    queryKey: ["football", "clubs", lang],
    queryFn: () => footballService.getClubs(lang),
  });
  const Arrow = dir === "rtl" ? ArrowLeft : ArrowRight;
  const Back = dir === "rtl" ? ArrowRight : ArrowLeft;

  const onFile = (f: File | null) => {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setAvatar(String(reader.result));
    reader.readAsDataURL(f);
  };

  const finish = async () => {
    if (submitting) return;
    setSubmitting(true);
    if (chosenLang !== lang) setLanguage(chosenLang);
    const res = await authService.completeProfile({
      displayName,
      username,
      avatarDataUrl: avatar,
      favoriteClubId,
      notifications: prefs,
      language: chosenLang,
    });
    setSubmitting(false);
    if (!res.ok) {
      const key =
        res.errorCode === "username_taken"
          ? "auth.error.username_taken"
          : res.errorCode === "invalid_username" || res.errorCode === "reserved_username"
            ? "auth.error.username_invalid"
            : "auth.error.generic";
      toast.error(t(key));
      return;
    }
    refresh();
    toast.success(t("auth.setup.success"));
    navigate({ to: next });
  };

  const canNext = useMemo(() => {
    if (step === 1)
      return displayName.trim().length >= 2 && /^[a-z0-9][a-z0-9_-]{2,19}$/i.test(username);
    return true;
  }, [step, displayName, username]);

  return (
    <AuthShell title={t("auth.setup.title")} subtitle={t("auth.setup.subtitle")} showBack={false}>
      <div className="mb-4">
        <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          <span>
            {t("auth.setup.step")} {step} {t("auth.setup.of")} {STEPS}
          </span>
          <button onClick={finish} className="hover:text-foreground">
            {t("auth.setup.skip")}
          </button>
        </div>
        <div className="mt-2 flex gap-1">
          {Array.from({ length: STEPS }).map((_, i) => (
            <span
              key={i}
              className={`h-1.5 flex-1 rounded-full ${i < step ? "bg-[color:var(--brand-primary)]" : "bg-muted"}`}
            />
          ))}
        </div>
      </div>

      {step === 1 && (
        <div className="grid gap-4">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="grid h-20 w-20 place-items-center overflow-hidden rounded-2xl bg-muted ring-1 ring-border">
                {avatar ? (
                  <img src={avatar} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Camera className="h-7 w-7 text-muted-foreground" aria-hidden />
                )}
              </div>
              {avatar && (
                <button
                  type="button"
                  onClick={() => setAvatar(undefined)}
                  aria-label={t("auth.setup.remove")}
                  className="absolute -end-1 -top-1 grid h-6 w-6 place-items-center rounded-full bg-destructive text-white"
                >
                  <X className="h-3 w-3" aria-hidden />
                </button>
              )}
            </div>
            <div className="flex-1">
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {t("auth.setup.avatar")}
              </div>
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="mt-2 rounded-xl border border-input bg-background px-3 py-2 text-xs font-semibold hover:bg-muted"
              >
                {t("auth.setup.upload")}
              </button>
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => onFile(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="displayName"
              className="mb-1 block text-xs font-bold uppercase tracking-wider text-muted-foreground"
            >
              {t("auth.setup.display_name")}
            </label>
            <input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full rounded-xl border border-input bg-background px-3 py-3 text-sm focus:border-[color:var(--brand-primary)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)]/40 outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="setupUsername"
              className="mb-1 block text-xs font-bold uppercase tracking-wider text-muted-foreground"
            >
              {t("auth.register.username")}
            </label>
            <input
              id="setupUsername"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="w-full rounded-xl border border-input bg-background px-3 py-3 text-sm outline-none focus:border-[color:var(--brand-primary)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)]/40"
            />
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="grid gap-3">
          <div className="flex items-center gap-2 text-sm font-bold text-foreground">
            <Trophy className="h-4 w-4 text-[color:var(--brand-accent)]" aria-hidden />{" "}
            {t("auth.setup.fav_club")}
          </div>
          <p className="-mt-1 text-xs text-muted-foreground">{t("auth.setup.fav_club_hint")}</p>
          <div className="grid max-h-72 gap-2 overflow-y-auto pr-1">
            {clubsQ.data?.map((c) => {
              const active = favoriteClubId === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setFavoriteClubId(c.id)}
                  className={`flex items-center gap-3 rounded-2xl border px-3 py-2 text-start transition-colors ${active ? "border-[color:var(--brand-primary)] bg-[color:var(--brand-primary)]/5" : "border-input bg-background hover:bg-muted"}`}
                >
                  <ClubCrest club={c} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold">{tr(c.name)}</div>
                    <div className="truncate text-[11px] text-muted-foreground">{tr(c.city)}</div>
                  </div>
                  {active && (
                    <CheckCircle2
                      className="h-5 w-5 text-[color:var(--brand-primary)]"
                      aria-hidden
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="grid gap-4">
          <div className="flex items-center gap-2 text-sm font-bold text-foreground">
            <Bell className="h-4 w-4 text-[color:var(--brand-accent)]" aria-hidden />{" "}
            {t("auth.setup.notifications")}
          </div>
          {(
            [
              ["matchAlerts", "auth.setup.notif_match", "auth.setup.notif_match_desc"],
              ["breakingNews", "auth.setup.notif_news", "auth.setup.notif_news_desc"],
              ["fantasyDeadlines", "auth.setup.notif_deadline", "auth.setup.notif_deadline_desc"],
            ] as const
          ).map(([key, label, desc]) => (
            <label
              key={key}
              className="flex items-start gap-3 rounded-2xl border border-input bg-background px-3 py-3"
            >
              <input
                type="checkbox"
                checked={prefs[key]}
                onChange={(e) => setPrefs((p) => ({ ...p, [key]: e.target.checked }))}
                className="mt-1 h-4 w-4 rounded border-input"
              />
              <div className="flex-1">
                <div className="text-sm font-bold">{t(label)}</div>
                <div className="text-xs text-muted-foreground">{t(desc)}</div>
              </div>
            </label>
          ))}

          <div>
            <div className="mb-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {t("auth.setup.language_confirm")}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(["fr", "ar"] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setChosenLang(l)}
                  className={`rounded-xl border px-3 py-2 text-sm font-bold ${chosenLang === l ? "border-[color:var(--brand-primary)] bg-[color:var(--brand-primary)]/5" : "border-input bg-background"}`}
                >
                  {l === "fr" ? "Français" : "العربية"}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="mt-6 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setStep((s) => Math.max(1, s - 1))}
          disabled={step === 1}
          className="inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-semibold text-muted-foreground disabled:opacity-40"
        >
          <Back className="h-4 w-4" aria-hidden /> {t("auth.setup.previous")}
        </button>
        {step < STEPS ? (
          <AuthPrimaryButton
            type="button"
            onClick={() => setStep((s) => s + 1)}
            disabled={!canNext}
            style={{ maxWidth: 200 }}
          >
            {t("auth.setup.next")} <Arrow className="h-4 w-4" aria-hidden />
          </AuthPrimaryButton>
        ) : (
          <AuthPrimaryButton
            type="button"
            onClick={finish}
            disabled={submitting}
            style={{ maxWidth: 200 }}
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {t("auth.setup.finish")}
          </AuthPrimaryButton>
        )}
      </div>

      {step === 2 && (
        <div className="mt-2">
          <AuthSecondaryButton
            type="button"
            onClick={() => {
              setFavoriteClubId(undefined);
              setStep(3);
            }}
          >
            {t("auth.setup.skip")}
          </AuthSecondaryButton>
        </div>
      )}
    </AuthShell>
  );
}
