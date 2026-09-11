import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { Check, ChevronRight, Loader2, Sparkles } from "lucide-react";
import { useState } from "react";

import { useAuth } from "@/auth/AuthProvider";
import { ClubCrest } from "@/components/common/ClubCrest";
import { AtlasTeamShirt } from "@/components/fantasy/AtlasTeamShirt";
import { AtlasCreateShell, AtlasStickyAction } from "@/components/fantasy/AtlasCreateShell";
import { useAtlasCreate } from "@/components/fantasy/AtlasCreateProvider";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import {
  setConsentAccepted,
  setFavoriteClub,
  setTeamName,
  TEAM_NAME_MAX_LENGTH,
  TEAM_NAME_MIN_LENGTH,
  validateTeamName,
} from "@/services/fantasy-create-service";
import { authService } from "@/services/auth";

export const Route = createFileRoute("/fantasy/create/")({
  component: AtlasIdentityPage,
});

function AtlasIdentityPage() {
  const { t, tr, dir } = useI18n();
  const nav = useNavigate();
  const { user, refresh } = useAuth();
  const { draft, clubs, commit, identityValid } = useAtlasCreate();
  const [submitted, setSubmitted] = useState(false);
  const [nameTouched, setNameTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profileError, setProfileError] = useState(false);
  const nameValidation = validateTeamName(draft.teamName);
  const selectedClub = clubs.find((club) => club.id === draft.favoriteClubId);

  const continueToSquad = async () => {
    setSubmitted(true);
    setProfileError(false);
    if (!identityValid || saving) return;
    if (draft.favoriteClubId && draft.favoriteClubId !== user?.favoriteClubId) {
      setSaving(true);
      const result = await authService.completeProfile({ favoriteClubId: draft.favoriteClubId });
      setSaving(false);
      if (!result.ok) {
        setProfileError(true);
        return;
      }
      refresh();
    }
    void nav({ to: "/fantasy/create/squad" });
  };

  const nameError = (submitted || nameTouched) && !nameValidation.ok;
  const consentError = submitted && !draft.consentAccepted;

  return (
    <AtlasCreateShell
      step={1}
      backTo="/fantasy"
      title={t("fantasy.atlas.create.identity.title")}
      description={t("fantasy.atlas.create.identity.description")}
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-6">
        <section className="relative overflow-hidden rounded-3xl bg-[#061b3c] p-5 text-white shadow-xl sm:p-7">
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(circle at 80% 15%, rgb(42 125 255 / 0.35), transparent 30%), linear-gradient(155deg, transparent 20%, rgb(25 94 205 / 0.2) 100%)",
            }}
          />
          <div className="relative">
            <div className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-blue-300">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              {t("fantasy.atlas.create.identity.preview")}
            </div>
            <div
              className="mt-5 grid place-items-center"
              aria-label={t("fantasy.atlas.create.identity.shirt_alt")}
            >
              <AtlasTeamShirt club={selectedClub} />
            </div>
            <div className="mt-3 rounded-2xl border border-white/10 bg-white/8 p-4 backdrop-blur-sm">
              <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/60">
                {t("fantasy.atlas.create.identity.team_card")}
              </div>
              <div className="mt-1 truncate text-xl font-black" dir="auto">
                {draft.teamName.trim() || t("fantasy.atlas.create.identity.unnamed")}
              </div>
              <div className="mt-1 text-xs text-white/65">
                {selectedClub ? tr(selectedClub.name) : t("fantasy.atlas.create.identity.no_club")}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-black/5 bg-white/85 p-4 shadow-sm sm:p-6">
          <div>
            <label htmlFor="atlas-team-name" className="text-sm font-black text-foreground">
              {t("fantasy.create.team_name_label")}
            </label>
            <input
              id="atlas-team-name"
              type="text"
              value={draft.teamName}
              onChange={(event) => commit((current) => setTeamName(current, event.target.value))}
              onBlur={() => setNameTouched(true)}
              maxLength={TEAM_NAME_MAX_LENGTH}
              dir="auto"
              aria-invalid={nameError}
              aria-describedby="atlas-team-name-help atlas-team-name-error"
              placeholder={t("fantasy.create.team_name_placeholder")}
              className={cn(
                "mt-2 min-h-12 w-full rounded-2xl border bg-white px-4 text-base font-bold outline-none transition-shadow focus-visible:ring-2",
                nameError
                  ? "border-red-400 focus-visible:ring-red-300"
                  : "border-slate-200 focus-visible:ring-blue-300",
              )}
            />
            <div
              id="atlas-team-name-help"
              className="mt-1.5 flex justify-between gap-3 text-[11px] text-muted-foreground"
            >
              <span>
                {t("fantasy.create.team_name_help")
                  .replace("{min}", String(TEAM_NAME_MIN_LENGTH))
                  .replace("{max}", String(TEAM_NAME_MAX_LENGTH))}
              </span>
              <span className="shrink-0 tabular-nums">
                {draft.teamName.length}/{TEAM_NAME_MAX_LENGTH}
              </span>
            </div>
            <p
              id="atlas-team-name-error"
              role={nameError ? "alert" : undefined}
              className="mt-1 min-h-4 text-xs font-bold text-red-700"
            >
              {nameError ? t("fantasy.atlas.create.identity.name_error") : ""}
            </p>
          </div>

          <fieldset className="mt-4">
            <legend className="text-sm font-black text-foreground">
              {t("fantasy.atlas.create.identity.favorite_club")}
            </legend>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("fantasy.atlas.create.identity.favorite_club_help")}
            </p>
            <div className="mt-3 grid max-h-64 grid-cols-2 gap-2 overflow-y-auto pe-1 sm:grid-cols-3">
              {clubs.map((club) => {
                const selected = draft.favoriteClubId === club.id;
                return (
                  <button
                    key={club.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => commit((current) => setFavoriteClub(current, club.id))}
                    className={cn(
                      "flex min-h-14 items-center gap-2 rounded-2xl border px-3 py-2 text-start text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400",
                      selected
                        ? "border-blue-500/40 bg-blue-50 text-blue-950"
                        : "border-slate-200 bg-white hover:bg-slate-50",
                    )}
                  >
                    <ClubCrest club={club} size="sm" />
                    <span className="min-w-0 flex-1 truncate">{tr(club.shortName)}</span>
                    {selected && <Check className="h-4 w-4 shrink-0 text-blue-700" aria-hidden />}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <label
            className={cn(
              "mt-5 flex cursor-pointer items-start gap-3 rounded-2xl border p-3 text-sm leading-relaxed",
              consentError ? "border-red-400 bg-red-50" : "border-slate-200 bg-slate-50/70",
            )}
          >
            <input
              type="checkbox"
              checked={draft.consentAccepted}
              onChange={(event) =>
                commit((current) => setConsentAccepted(current, event.target.checked))
              }
              aria-invalid={consentError}
              aria-describedby="atlas-consent-error"
              className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300 accent-blue-600"
            />
            <span>
              {t("fantasy.atlas.create.identity.consent")}{" "}
              <Link
                to="/fantasy/rules"
                className="font-black text-blue-700 underline underline-offset-2"
              >
                {t("fantasy.atlas.rules")}
              </Link>
            </span>
          </label>
          <p
            id="atlas-consent-error"
            role={consentError ? "alert" : undefined}
            className="mt-1 min-h-4 text-xs font-bold text-red-700"
          >
            {consentError ? t("fantasy.atlas.create.identity.consent_error") : ""}
          </p>
          {profileError && (
            <p
              role="alert"
              className="mt-2 rounded-xl bg-red-50 p-3 text-xs font-bold text-red-800"
            >
              {t("fantasy.atlas.create.identity.profile_error")}
            </p>
          )}
        </section>
      </div>

      <AtlasStickyAction
        summary={
          <div className="text-xs text-muted-foreground">
            <span className="font-black text-foreground">1 / 3</span> ·{" "}
            {t("fantasy.atlas.create.identity.sticky")}
          </div>
        }
        action={
          <button
            type="button"
            onClick={continueToSquad}
            disabled={saving}
            className="cta-brand inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-5 text-sm font-black disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
            ) : null}
            {t("fantasy.atlas.create.continue")}
            {!saving && (
              <ChevronRight className={cn("h-4 w-4", dir === "rtl" && "rotate-180")} aria-hidden />
            )}
          </button>
        }
      />
    </AtlasCreateShell>
  );
}
