import { useState } from "react";

import { useCardCopy, useCurvaCopy, useMomentCopy } from "@/components/manager-card/copy";
import { fill } from "@/components/manager-card/interpolate";
import { cardClubFromClub, guestProfile } from "@/components/manager-card/to-profile";
import { ui, UiLinkButton, UiSkeleton } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import type { Club } from "@/types/domain";

import { CardStage } from "./CardStage";
import { useStageBeat } from "./use-stage-beat";
import { ClubTryOn } from "./ClubTryOn";
import { GuestPoints } from "./GuestPoints";
import { useSeasonLabel } from "./use-season-label";
import { useViewEvent } from "./use-view-event";

/**
 * The proposition to a signed-in account with no team yet (a visitor never gets here: Curva is
 * locked for them, `CurvaLockScreen`). Plan 4.1:
 * the base card, unnamed (a signed-in account's own name and favourite club on it), then what
 * the card is in a headline, a line and the way in, the try-on of a club's colours, and the four
 * points. Nothing here is a number, a promise of a rating's date, or a count of anyone.
 *
 * Registration closed says so where the create-team button would be. Continuing home is always
 * available, including when team creation is closed or still loading.
 */
export function GuestHero({
  clubs,
  closed,
  canCreate,
  loadingAction,
  profileName = "",
  favouriteClub = null,
  minRated,
}: {
  clubs: readonly Club[];
  closed: boolean;
  canCreate: boolean;
  /** The Fantasy screen has not said yet whether a team can be created. */
  loadingAction: boolean;
  /** A signed-in account's display name, drawn on the card. */
  profileName?: string;
  /** A signed-in account's favourite club, which dresses the card until another is tried. */
  favouriteClub?: Club | null;
  /** The rating's minimum, when the server has said it. */
  minRated: number | null;
}) {
  const { t } = useI18n();
  const copy = useCurvaCopy();
  const card = useCardCopy();
  const moments = useMomentCopy();
  const season = useSeasonLabel();
  const [tried, setTried] = useState<Club | null>(null);
  const worn = tried ?? favouriteClub;
  const profile = {
    ...guestProfile({ season, club: cardClubFromClub(worn) }),
    name: profileName.trim(),
  };
  const beat = useStageBeat({ kind: "none", counted: null });
  useViewEvent("curva_view_no_team");

  const headline = closed
    ? t("fantasy.availability.registration_closed.title")
    : copy.noteamHeadline;
  const body = closed
    ? t("fantasy.availability.registration_closed.body")
    : minRated === null
      ? copy.guestBody
      : fill(moments.m1.introBody, { final: card.finalRounds(minRated) });

  return (
    <div data-testid="curva-no-team">
      <CardStage profile={profile} beat={beat} />
      <div className="mt-1">
        <ClubTryOn
          clubs={clubs}
          selectedId={worn?.id ?? null}
          onPick={(club) => {
            setTried(club);
            track("curva_guest_club_try");
          }}
        />
      </div>
      <div className={cn("mx-auto mt-6 flex max-w-md flex-col gap-3", ui.space.gutter)}>
        <h2 className={cn("text-balance text-center", ui.display.section, ui.tone.default)}>
          {headline}
        </h2>
        <p className={cn("text-pretty text-center", ui.text.secondary, ui.tone.muted)}>{body}</p>
        <UiLinkButton to="/" variant="gradient" data-testid="curva-continue">
          {copy.guestContinueHome}
        </UiLinkButton>
        {closed ? null : loadingAction ? (
          <UiSkeleton className="h-12 rounded-full" testId="curva-guest-action-loading" />
        ) : canCreate ? (
          <UiLinkButton
            to="/fantasy/create"
            variant="soft"
            onClick={() => track("curva_guest_cta")}
            data-testid="curva-create"
          >
            {t("fantasy.next.create")}
          </UiLinkButton>
        ) : null}
      </div>
      <div className={cn("mx-auto mt-8 max-w-md", ui.space.gutter)}>
        <GuestPoints
          club={cardClubFromClub(worn ?? clubs[0] ?? null)}
          season={season}
          minRated={minRated}
        />
        <p
          className={cn(
            "mt-6 text-center",
            ui.text.meta,
            "[font-weight:var(--ui-weight-strong)]",
            ui.tone.default,
          )}
        >
          {copy.guestFree}
        </p>
      </div>
    </div>
  );
}
