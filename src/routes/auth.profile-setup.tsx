import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  AtSign,
  Bell,
  Camera,
  CheckCircle2,
  Loader2,
  Trophy,
  User,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { AuthShell, AuthPrimaryButton, AuthSecondaryButton } from "@/components/auth/AuthShell";
import { authFieldClass, authFieldIconClass } from "@/components/auth/auth-classes";
import { setupStepFromSearch } from "@/components/auth/account-model";
import { ui, UiButton, UiCheckbox, UiChip, UiInput } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import { clubStyle } from "@/lib/club-palette";
import { useI18n } from "@/i18n/provider";
import { useAuth } from "@/auth/AuthProvider";
import { showStepUpNotice } from "@/auth/step-up-notice";
import { isMfaStepUpError } from "@/backend/auth/step-up";
import { authService } from "@/services/auth";
import { footballService } from "@/services/football";
import { useMyNotificationPreferences } from "@/services/use-notification-preferences";
import type { Language } from "@/types/domain";
import type { NotificationPreferences } from "@/services/auth";
import { ClubCrest } from "@/components/common/ClubCrest";
import { authNextSearch } from "@/lib/auth-callback";

export const Route = createFileRoute("/auth/profile-setup")({
  head: () => ({ meta: [{ title: "Personnalisez votre profil — BotolaGO" }] }),
  validateSearch: (search: Record<string, unknown>) => {
    // `?step=3` is how Profile's Notifications row opens the wizard on the
    // step that edits them; there is no other notification settings screen.
    const step = setupStepFromSearch(search.step);
    return {
      ...authNextSearch(search.next),
      ...(step ? { step } : {}),
    };
  },
  component: ProfileSetupPage,
});

const STEPS = 3;

function ProfileSetupPage() {
  const { t, tr, lang, setLanguage } = useI18n();
  const { user, status, refresh } = useAuth();
  const navigate = useNavigate();
  const { next = "/", step: initialStep } = Route.useSearch();
  const [step, setStep] = useState<number>(initialStep ?? 1);
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [avatar, setAvatar] = useState<string | undefined>();
  const [favoriteClubId, setFavoriteClubId] = useState<string | undefined>();
  const [prefs, setPrefs] = useState<NotificationPreferences>({
    matchAlerts: true,
    breakingNews: true,
    fantasyDeadlines: true,
  });
  // E-mail is a channel, not one of the profile's three categories, so it is
  // read from and saved to the notification preferences directly. `null`
  // until the reader touches it: an untouched box is never written back.
  const { preferences: notificationPrefs, setEmailEnabled } = useMyNotificationPreferences();
  const [emailChoice, setEmailChoice] = useState<boolean | null>(null);
  const savedEmail = notificationPrefs?.channels.email;
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
    }
  }, [user]);

  // The language step starts from — and follows — the language the app is
  // showing, not the one last saved on the account. Profile's language row
  // changes the app only, so seeding from the account made "Terminer" or
  // "Passer" (both save) flip an Arabic reader back to French.
  useEffect(() => {
    setChosenLang(lang);
  }, [lang]);

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
    if (!res.ok) {
      setSubmitting(false);
      // Refused until the one-time code is in: say that, once (the auth layer
      // is saying it too, under the same toast), not "an error occurred".
      if (res.errorCode === "mfa_required") {
        showStepUpNotice(t);
        return;
      }
      const key =
        res.errorCode === "username_taken"
          ? "auth.error.username_taken"
          : res.errorCode === "invalid_username" || res.errorCode === "reserved_username"
            ? "auth.error.username_invalid"
            : "auth.error.generic";
      toast.error(t(key));
      return;
    }
    if (emailChoice !== null && savedEmail !== undefined && emailChoice !== savedEmail) {
      try {
        await setEmailEnabled(emailChoice);
      } catch (error) {
        // The profile is saved; only the e-mail choice is not. Stay on the
        // step so "Terminer" can be pressed again.
        setSubmitting(false);
        refresh();
        if (isMfaStepUpError(error)) showStepUpNotice(t);
        else toast.error(t("auth.error.generic"));
        return;
      }
    }
    setSubmitting(false);
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
    <AuthShell
      compact
      title={t("auth.setup.title")}
      subtitle={t("auth.setup.subtitle")}
      showBack={false}
    >
      <div className="mb-5">
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
        {/* Done steps fill with the action gradient, the one "you are
            moving forward" colour in Option A; the rest are hairline grey. */}
        <div className="mt-2 flex gap-1">
          {Array.from({ length: STEPS }).map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-1.5 flex-1",
                ui.radius.full,
                i < step ? undefined : "bg-[color:var(--ui-rule)]",
              )}
              style={i < step ? { backgroundImage: "var(--ui-grad-action)" } : undefined}
            />
          ))}
        </div>
      </div>

      {step === 1 && (
        <div className="grid gap-4">
          <div className="flex items-center gap-4">
            <div className="relative">
              {/* A round disc, like the avatar on Profile's identity card. */}
              <div
                className={cn(
                  "grid h-20 w-20 place-items-center overflow-hidden",
                  ui.radius.full,
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
                    // On the disc's own corner of its box, which is where a
                    // circle's edge runs — not floating off it.
                    "absolute end-0 top-0 z-10 grid h-6 w-6 place-items-center",
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
            fieldClassName={authFieldClass()}
            leading={<User className={authFieldIconClass} aria-hidden />}
          />

          <UiInput
            id="setupUsername"
            label={t("auth.register.username")}
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            fieldClassName={authFieldClass()}
            leading={<AtSign className={authFieldIconClass} aria-hidden />}
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
              announces. `aria-pressed` stays as it was.

              Option A: each row carries its club — the crest disc, and a 4px
              edge in the club's colour on the inline start (`ui.edge.start`,
              a logical border, never the boards' `inset 4px 0 0` shadow). The
              chosen row takes the club's tint and its edge colour all round. */}
          <div className="grid max-h-72 gap-2 overflow-y-auto pe-1">
            {clubsQ.data?.map((c) => {
              const active = favoriteClubId === c.id;
              const club = clubStyle(c);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setFavoriteClubId(c.id)}
                  aria-pressed={active}
                  data-club={club["data-club"]}
                  style={club.style}
                  className={cn(
                    "flex items-center gap-3 border px-3 py-2 text-start transition-colors",
                    "min-h-[var(--ui-row-min)]",
                    ui.radius.card,
                    ui.focus,
                    active
                      ? cn("border-[color:var(--ui-club-edge)]", ui.club.tint)
                      : "border-[color:var(--ui-rule)] hover:bg-[color:var(--ui-surface-sunken)]",
                    // Last, so the 4px start edge is laid over the 1px border.
                    ui.edge.start,
                  )}
                >
                  <ClubCrest club={c} size="sm" />
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
              className={cn("px-3 py-3", ui.space.row, ui.radius.card, ui.rule.all)}
            />
          ))}

          {/* The channel, after the three categories it carries. Disabled
              until the stored value has loaded, so it never shows a guess. */}
          <UiCheckbox
            checked={emailChoice ?? savedEmail ?? false}
            disabled={savedEmail === undefined || submitting}
            onChange={(e) => setEmailChoice(e.target.checked)}
            label={t("auth.setup.notif_email")}
            hint={t("auth.setup.notif_email_desc")}
            className={cn("px-3 py-3", ui.space.row, ui.radius.card, ui.rule.all)}
          />

          <div>
            <div id="setupLanguage" className={cn("mb-1.5", ui.text.label, ui.tone.muted)}>
              {t("auth.setup.language_confirm")}
            </div>
            {/* Two `UiChip`s: a pair of pressed/unpressed toggles, which is
                what this was already (`aria-pressed`), now drawn as the kit's
                pill — sunken, or navy when chosen. Not `UiSegmented`, which
                would announce a two-way choice as a `role="tablist"`. The
                pair is a group named by the label above, so the two toggles
                are heard as the answer to it, each name in its own language. */}
            <div role="group" aria-labelledby="setupLanguage" className="grid grid-cols-2 gap-2">
              {(["fr", "ar"] as const).map((l) => (
                <UiChip
                  key={l}
                  lang={l}
                  selected={chosenLang === l}
                  onClick={() => setChosenLang(l)}
                  className={cn("w-full justify-center", ui.text.bodyStrong)}
                >
                  {l === "fr" ? "Français" : "العربية"}
                </UiChip>
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
