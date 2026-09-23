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
import { ui, UiButton, UiCheckbox, UiInput } from "@/components/ui-kit";
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
  const { t, tr, lang, setLanguage } = useI18n();
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
  // styles.css mirrors lucide arrows under dir="rtl"; picking the other icon here as well flipped it twice.
  const Arrow = ArrowRight;
  const Back = ArrowLeft;

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
        <div className="flex items-center justify-between">
          {/* The label type stays on the counter, which is what it is for —
              it used to sit on the whole row, so `uppercase` inherited into
              Skip and made a control look like a column head. Skip is a
              control and is drawn as one now. `ui.text.label` letter-spaces
              Latin only (BG-0069). */}
          <span className={cn(ui.text.label, ui.tone.muted)}>
            {t("auth.setup.step")} {step} {t("auth.setup.of")} {STEPS}
          </span>
          <UiButton variant="ghost" size="sm" className="-me-2" onClick={finish}>
            {t("auth.setup.skip")}
          </UiButton>
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
                // Painted 24px and targeted 24px — 20px under the floor in
                // rule 5, on the control that undoes an upload. Growing the
                // ink is not the fix: a 44px badge covers half the 80px
                // thumbnail it annotates. `ui.hitArea` grows a transparent
                // 44px target behind a control drawn its designed size; it
                // comes FIRST here because it carries `relative`, and this
                // badge has to stay `absolute` on the thumbnail's corner.
                //
                // The foreground was `--ui-on-ink-plain` on a `--ui-negative`
                // fill — a foreground picked by hand for a status fill that
                // inverts across the themes. `ui.tone.onNegative` is the one
                // the fill carries: white in light, `--ui-ink-deep` in dark,
                // where white-on-negative measured 2.31:1.
                <button
                  type="button"
                  onClick={() => setAvatar(undefined)}
                  aria-label={t("auth.setup.remove")}
                  className={cn(
                    ui.hitArea,
                    "absolute -end-1 -top-1 z-10 grid h-6 w-6 place-items-center",
                    ui.radius.full,
                    "bg-[color:var(--ui-negative)]",
                    ui.tone.onNegative,
                    ui.focus,
                  )}
                >
                  <X className="h-3 w-3" aria-hidden />
                </button>
              )}
            </div>
            <div className="flex-1">
              <div className={cn(ui.text.label, ui.tone.muted)}>{t("auth.setup.avatar")}</div>
              {/* The outline recipe spelled out by hand — 44px, control
                  radius, a hairline, meta at the heavy weight, focus ring.
                  That is `UiButton variant="outline" size="sm"`; `w-auto` is
                  not needed because `sm` is already inline. */}
              <UiButton
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => fileInput.current?.click()}
              >
                {t("auth.setup.upload")}
              </UiButton>
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => onFile(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>

          {/* Both fields move to `UiInput` together — the step has exactly
              these two, and a form that converts half its fields ends up
              showing two different label treatments at once. Neither field
              validates on submit (the wizard gates Next on `canNext`
              instead), so neither reserves an error line: `reserveError`
              would be dead space on a form that has no message to put in it. */}
          <UiInput
            id="displayName"
            label={t("auth.setup.display_name")}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />

          <UiInput
            id="setupUsername"
            label={t("auth.register.username")}
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
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
          {/* KEPT as buttons. `UiChip` and `UiSegmented` are the kit's
              selection controls and neither fits: a chip is a filter that
              paints selection as an ink FILL, and a crest over a club name
              over a city is a row, not a pill; a segmented
              control announces `role="tab"` — this is a radio-like choice, not
              a tab set, and this lane does not change what a control
              announces. Every colour, radius, height and focus ring here is
              already a token, and `aria-pressed` stays as it was. */}
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
            // Three 16px boxes with a 16px target. The wrapping label already
            // rescued the click, but the box is what a reader aims at, so
            // `UiCheckbox` keeps the ink at 16px and grows a transparent 44px
            // target behind it, and paints the checked plate in `--ui-ink`
            // rather than the browser's own accent, which is not a colour this
            // product chose. The bordered row stays — it is what separates
            // three stacked toggles from each other.
            <UiCheckbox
              key={key}
              checked={prefs[key]}
              onChange={(e) => setPrefs((p) => ({ ...p, [key]: e.target.checked }))}
              label={t(label)}
              hint={t(desc)}
              className={cn("px-3 py-3", ui.space.row, ui.radius.control, ui.rule.all)}
            />
          ))}

          <div>
            <div className={cn("mb-1", ui.text.label, ui.tone.muted)}>
              {t("auth.setup.language_confirm")}
            </div>
            {/* KEPT for the same reason as the club list: `UiSegmented` would
                turn a two-way language choice into a `role="tablist"`, and the
                pair already sits on the tokens at the 44px floor. */}
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
        <UiButton
          variant="ghost"
          size="sm"
          className="gap-1"
          onClick={() => setStep((s) => Math.max(1, s - 1))}
          disabled={step === 1}
        >
          <Back className="h-4 w-4" aria-hidden /> {t("auth.setup.previous")}
        </UiButton>
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
