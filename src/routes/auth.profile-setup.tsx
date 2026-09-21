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
import {
  AuthShell,
  AuthPrimaryButton,
  AuthSecondaryButton,
  authFieldClass,
} from "@/components/auth/AuthShell";
import { ui } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
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
        {/* `ui.text.label` letter-spaces Latin only (BG-0069). */}
        <div className={cn("flex items-center justify-between", ui.text.label, ui.tone.muted)}>
          <span>
            {t("auth.setup.step")} {step} {t("auth.setup.of")} {STEPS}
          </span>
          <button
            type="button"
            onClick={finish}
            className={cn(
              "inline-flex items-center px-2 -me-2",
              ui.space.tap,
              ui.radius.control,
              ui.focus,
              "hover:text-[color:var(--ui-on-surface)]",
            )}
          >
            {t("auth.setup.skip")}
          </button>
        </div>
        <div className="mt-2 flex gap-1">
          {Array.from({ length: STEPS }).map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-1.5 flex-1",
                ui.radius.full,
                i < step ? "bg-[color:var(--ui-ink)]" : "bg-[color:var(--ui-rule)]",
              )}
            />
          ))}
        </div>
      </div>

      {step === 1 && (
        <div className="grid gap-4">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div
                className={cn(
                  "grid h-20 w-20 place-items-center overflow-hidden",
                  ui.radius.control,
                  ui.surface.sunken,
                  ui.rule.all,
                )}
              >
                {avatar ? (
                  <img src={avatar} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Camera className={cn("h-7 w-7", ui.tone.muted)} aria-hidden />
                )}
              </div>
              {avatar && (
                <button
                  type="button"
                  onClick={() => setAvatar(undefined)}
                  aria-label={t("auth.setup.remove")}
                  className={cn(
                    "absolute -end-1 -top-1 grid h-6 w-6 place-items-center",
                    ui.radius.full,
                    "bg-[color:var(--ui-negative)] text-[color:var(--ui-on-ink-plain)]",
                    ui.focus,
                  )}
                >
                  <X className="h-3 w-3" aria-hidden />
                </button>
              )}
            </div>
            <div className="flex-1">
              <div className={cn(ui.text.label, ui.tone.muted)}>{t("auth.setup.avatar")}</div>
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className={cn(
                  "mt-2 inline-flex items-center px-3",
                  ui.space.tap,
                  ui.radius.control,
                  ui.rule.all,
                  ui.text.meta,
                  "[font-weight:var(--ui-weight-heavy)]",
                  ui.focus,
                  "hover:bg-[color:var(--ui-surface-sunken)]",
                )}
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
            <label htmlFor="displayName" className={cn("mb-1 block", ui.text.label, ui.tone.muted)}>
              {t("auth.setup.display_name")}
            </label>
            <input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className={authFieldClass}
            />
          </div>

          <div>
            <label
              htmlFor="setupUsername"
              className={cn("mb-1 block", ui.text.label, ui.tone.muted)}
            >
              {t("auth.register.username")}
            </label>
            <input
              id="setupUsername"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className={authFieldClass}
            />
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="grid gap-3">
          <div className={cn("flex items-center gap-2", ui.text.bodyStrong, ui.tone.default)}>
            <Trophy className={cn("h-4 w-4", ui.tone.muted)} aria-hidden />{" "}
            {t("auth.setup.fav_club")}
          </div>
          <p className={cn("-mt-1", ui.text.meta, ui.tone.muted)}>
            {t("auth.setup.fav_club_hint")}
          </p>
          <div className="grid max-h-72 gap-2 overflow-y-auto pe-1">
            {clubsQ.data?.map((c) => {
              const active = favoriteClubId === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setFavoriteClubId(c.id)}
                  aria-pressed={active}
                  className={cn(
                    "flex items-center gap-3 border px-3 py-2 text-start transition-colors",
                    "min-h-[var(--ui-row-min)]",
                    ui.radius.control,
                    ui.focus,
                    active
                      ? "border-[color:var(--ui-ink)] bg-[color:color-mix(in_oklab,var(--ui-ink)_8%,transparent)]"
                      : "border-[color:var(--ui-rule)] hover:bg-[color:var(--ui-surface-sunken)]",
                  )}
                >
                  <ClubCrest club={c} />
                  <div className="min-w-0 flex-1">
                    <div className={cn("truncate", ui.text.bodyStrong)}>{tr(c.name)}</div>
                    <div className={cn("truncate", ui.text.micro, ui.tone.muted)}>{tr(c.city)}</div>
                  </div>
                  {active && (
                    <CheckCircle2 className={cn("h-5 w-5", ui.tone.positive)} aria-hidden />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="grid gap-4">
          <div className={cn("flex items-center gap-2", ui.text.bodyStrong, ui.tone.default)}>
            <Bell className={cn("h-4 w-4", ui.tone.muted)} aria-hidden />{" "}
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
              className={cn(
                "flex items-start gap-3 px-3 py-3",
                "min-h-[var(--ui-row-min)]",
                ui.radius.control,
                ui.rule.all,
              )}
            >
              <input
                type="checkbox"
                checked={prefs[key]}
                onChange={(e) => setPrefs((p) => ({ ...p, [key]: e.target.checked }))}
                className={cn(
                  "mt-1 h-4 w-4 border-[color:var(--ui-rule)]",
                  ui.radius.control,
                  ui.focus,
                )}
              />
              <div className="flex-1">
                <div className={ui.text.bodyStrong}>{t(label)}</div>
                <div className={cn(ui.text.meta, ui.tone.muted)}>{t(desc)}</div>
              </div>
            </label>
          ))}

          <div>
            <div className={cn("mb-1", ui.text.label, ui.tone.muted)}>
              {t("auth.setup.language_confirm")}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(["fr", "ar"] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setChosenLang(l)}
                  aria-pressed={chosenLang === l}
                  className={cn(
                    "inline-flex items-center justify-center border px-3",
                    ui.space.tap,
                    ui.radius.control,
                    ui.text.bodyStrong,
                    ui.focus,
                    chosenLang === l
                      ? "border-[color:var(--ui-ink)] bg-[color:color-mix(in_oklab,var(--ui-ink)_8%,transparent)]"
                      : "border-[color:var(--ui-rule)]",
                  )}
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
          className={cn(
            "inline-flex items-center gap-1 px-3",
            ui.space.tap,
            ui.radius.control,
            ui.text.bodyStrong,
            ui.tone.muted,
            ui.focus,
            "disabled:opacity-40",
          )}
        >
          <Back className="h-4 w-4" aria-hidden /> {t("auth.setup.previous")}
        </button>
        {step < STEPS ? (
          <AuthPrimaryButton
            type="button"
            onClick={() => setStep((s) => s + 1)}
            disabled={!canNext}
            className="max-w-[200px]"
          >
            {t("auth.setup.next")} <Arrow className="h-4 w-4" aria-hidden />
          </AuthPrimaryButton>
        ) : (
          <AuthPrimaryButton
            type="button"
            onClick={finish}
            disabled={submitting}
            className="max-w-[200px]"
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
