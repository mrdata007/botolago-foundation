import createTeamArt from "@/assets/illustrations/create-team.webp";
import { BookOpen, CalendarClock, Coins, Plus, Star, Timer, Trophy, Users } from "lucide-react";
import { useId, type ComponentType } from "react";

import { formatDeadline, useDeadlineCountdown } from "@/components/fpl/deadline";
import { ui, UiLinkButton } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { SQUAD_RULES } from "@/types/fantasy";
import { joinDeadlineToShow } from "./fantasy-hub-layout";

/** Where a signed-out visitor lands once signed in: the builder, not the hub. */
export const GUEST_CREATE_NEXT = "/fantasy/create";

/**
 * The Fantasy hub's first-time proposition (audit 2026-09-25, A16), in the
 * team card's place for a visitor without a team: what the game is, how it
 * works in four points, when the next team must be in, and one call to
 * action. The rules are the one secondary link.
 *
 * The call to action is "Créer mon équipe" for both audiences. A signed-out
 * visitor is sent through sign-in first with the builder as `next`, and the
 * line under the button says so, so the login page is not a surprise; the
 * login page carries `next` on to registration and to Google / Apple.
 *
 * Registration closed is said in words where the button would be — the
 * builder would only refuse the team — and the rest of the explanation
 * stays, because it is still true.
 *
 * The order is for a phone: what the game is, then the button and the
 * deadline, then how it works. With the four points above it, the one call to
 * action came after the whole explanation — by the tokens' arithmetic about
 * a thousand pixels down at 360px, below any phone's fold; now it follows
 * the lede, and the points are there for whoever wants them first.
 *
 * Inline, never a dialog: it is the screen's content, and it must not
 * compete with the splash, the language chooser or the prize welcome for
 * the visitor's first look.
 */
export function FantasyGuestIntro({
  audience,
  joinBy,
  registrationClosed,
  prizes,
}: {
  audience: "signed_out" | "no_team";
  /** The gameweek a team created now starts in, and its deadline (`joinTarget`). */
  joinBy: { number: number; deadline: string } | null;
  registrationClosed: boolean;
  /** At least one prize is open, so the line about them is true. */
  prizes: boolean;
}) {
  const { t, lang } = useI18n();
  const titleId = useId();
  const howId = useId();
  const signInNoteId = useId();
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR");
  const deadline = joinDeadlineToShow(joinBy, useDeadlineCountdown(joinBy?.deadline));

  // Literal keys, one call each: the i18n gate reads them statically.
  const points: Array<{
    icon: ComponentType<{ className?: string }>;
    title: string;
    body: string;
  }> = [
    {
      icon: Users,
      title: t("fantasy.intro.squad_title").replace("{size}", nf.format(SQUAD_RULES.totalSize)),
      body: t("fantasy.intro.squad_body"),
    },
    {
      icon: Coins,
      title: t("fantasy.intro.budget_title").replace("{budget}", nf.format(SQUAD_RULES.budget)),
      body: t("fantasy.intro.budget_body").replace("{max}", nf.format(SQUAD_RULES.maxPerClub)),
    },
    {
      icon: Star,
      title: t("fantasy.intro.captain_title"),
      body: t("fantasy.intro.captain_body"),
    },
    {
      icon: Timer,
      title: t("fantasy.intro.deadline_title"),
      body: t("fantasy.intro.deadline_body"),
    },
  ];

  return (
    <section
      aria-labelledby={titleId}
      className={cn("p-4", ui.surface.card)}
      data-testid="fantasy-guest-intro"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className={cn("text-balance", ui.display.section, ui.tone.default)}>
            {t("fantasy.intro.title")}
          </h2>
          {audience === "no_team" ? (
            // Where this account stands: signed in, no team saved yet. Under
            // the heading, so heading navigation does not skip it.
            <p
              className={cn(
                "mt-1",
                ui.text.meta,
                "[font-weight:var(--ui-weight-strong)]",
                ui.tone.ink,
              )}
            >
              {t("fpl.no_team_yet")}
            </p>
          ) : null}
        </div>
        <img
          src={createTeamArt}
          alt=""
          aria-hidden
          width={640}
          height={467}
          loading="lazy"
          decoding="async"
          className="h-16 w-auto shrink-0 object-contain"
        />
      </div>
      {/* Full width, not the column beside the art: at 360px that column is
          under 200px wide, which is eight lines for this lede. */}
      <p className={cn("mt-2", ui.text.secondary, ui.tone.muted)}>{t("fantasy.intro.lede")}</p>

      {registrationClosed ? (
        <div className={cn("mt-4 flex items-start gap-3 p-3", ui.radius.card, ui.surface.sunken)}>
          <CalendarClock className={cn("mt-0.5 h-5 w-5 shrink-0", ui.tone.ink)} aria-hidden />
          <div className="min-w-0">
            <p className={cn(ui.text.bodyStrong, ui.tone.default)}>
              {t("fantasy.availability.registration_closed.title")}
            </p>
            <p className={cn("mt-0.5", ui.text.secondary, ui.tone.muted)}>
              {t("fantasy.availability.registration_closed.body")}
            </p>
          </div>
        </div>
      ) : (
        <>
          {audience === "signed_out" ? (
            // Named "Créer mon équipe" and opening the sign-in page: the note
            // under it is its description, so a screen reader hears where it
            // goes before following it.
            <UiLinkButton
              to="/auth/login"
              search={{ next: GUEST_CREATE_NEXT }}
              variant="gradient"
              className="mt-4"
              aria-describedby={signInNoteId}
              data-testid="fantasy-intro-create"
            >
              <Plus className="h-5 w-5" aria-hidden />
              {t("fantasy.create.title")}
            </UiLinkButton>
          ) : (
            <UiLinkButton
              to="/fantasy/create"
              variant="gradient"
              className="mt-4"
              data-testid="fantasy-intro-create"
            >
              <Plus className="h-5 w-5" aria-hidden />
              {t("fantasy.create.title")}
            </UiLinkButton>
          )}
          {audience === "signed_out" ? (
            <p
              id={signInNoteId}
              className={cn("mt-2 text-center text-balance", ui.text.meta, ui.tone.muted)}
            >
              {t("fantasy.intro.sign_in_note")}
            </p>
          ) : null}
          {deadline ? (
            // Under the button, not above it: with Arabic's taller line
            // height, these two lines above it would put the button at a
            // 360×640 fold, by the tokens' arithmetic.
            <p className={cn("mt-3", ui.text.secondary, ui.tone.muted)}>
              {t("fantasy.intro.join_by").replace("{n}", nf.format(deadline.number))}{" "}
              <span
                className={cn(
                  "inline-flex items-center gap-1.5",
                  ui.text.bodyStrong,
                  ui.tone.default,
                )}
              >
                <Timer className={cn("h-4 w-4 shrink-0", ui.tone.ink)} aria-hidden />
                <bdi>{formatDeadline(deadline.deadline, lang, { weekday: "short" })}</bdi>
              </span>
            </p>
          ) : null}
        </>
      )}
      {/* After the button, not before it: a reason to play, not a step on
          the way to the team. */}
      {prizes ? (
        <p
          className={cn(
            "mt-3 flex items-center gap-2",
            ui.text.meta,
            "[font-weight:var(--ui-weight-strong)]",
            ui.tone.default,
          )}
        >
          <Trophy className={cn("h-4 w-4 shrink-0", ui.tone.ink)} aria-hidden />
          {t("fantasy.intro.prizes")}
        </p>
      ) : null}

      <h3 id={howId} className={cn("mt-5", ui.text.label, ui.tone.muted)}>
        {t("fantasy.intro.how_title")}
      </h3>
      <ul aria-labelledby={howId} className="mt-2 grid gap-3">
        {points.map((point) => (
          <li key={point.title} className="flex items-start gap-3">
            {/* The rules page's gradient disc, with the rules page's icon
                for the same rule. */}
            <span
              className={cn(
                "grid h-9 w-9 shrink-0 place-items-center",
                ui.radius.full,
                "text-[color:var(--ui-ink-deep)]",
              )}
              style={{ backgroundImage: "var(--ui-grad-action)" }}
              aria-hidden
            >
              <point.icon className="h-[18px] w-[18px]" />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className={cn(ui.text.bodyStrong, ui.tone.default)}>{point.title}</span>
              <span className={cn(ui.text.secondary, ui.tone.muted)}>{point.body}</span>
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex justify-center">
        <UiLinkButton to="/fantasy/rules" variant="ghost" size="sm">
          <BookOpen className="h-4 w-4" aria-hidden />
          {t("fpl.rules")}
        </UiLinkButton>
      </div>
    </section>
  );
}
