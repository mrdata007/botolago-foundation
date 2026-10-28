import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import type { CSSProperties } from "react";

import type { MyLeaguesDto } from "@/backend/predictions/contracts";
import type { PredictionsError } from "@/backend/predictions/errors";
import { useAuth } from "@/auth/AuthProvider";
import { ui, UiButton, UiEmptyState, UiErrorState, UiStatePanel } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { predictionsService } from "@/services/predictions";
import { formatNumber } from "../predictions-copy";
import { CreateLeagueForm } from "./CreateLeagueForm";
import { JoinLeagueForm } from "./JoinLeagueForm";
import { membersLabel } from "./leagues-copy";

/**
 * The brand gradients a league box is painted on. A Pronostics league sits on
 * the header gradient (drawn at 135% of the box so `--ui-on-grad-header`
 * keeps 4.5:1 to its bottom edge), a Fantasy league on the navy ink with a
 * sky glow from the top centre (white on its lightest point: 6.6:1 light,
 * 7.5:1 dark). Both `to bottom` or centred, so nothing mirrors wrong in Arabic.
 */
const HEADER_BOX: CSSProperties = {
  backgroundImage:
    "radial-gradient(120% 100% at 50% 0%, color-mix(in oklab, var(--ui-accent-spring) var(--glow), transparent) 0%, transparent 60%), var(--ui-grad-header)",
  backgroundSize: "100% 100%, 100% 135%",
  backgroundRepeat: "no-repeat",
};
const INK_BOX: CSSProperties = {
  backgroundImage:
    "radial-gradient(120% 100% at 50% 0%, color-mix(in oklab, var(--ui-accent-sky) 28%, transparent) 0%, transparent 65%), linear-gradient(to bottom, var(--ui-ink) 0%, var(--ui-ink-deep) 100%)",
};
/** The header box's text, and the strength of its spring glow per theme. */
const HEADER_TONE = cn(ui.tone.onGradHeader, "[--glow:45%] dark:[--glow:16%]");
const INK_TONE = cn(
  ui.tone.onInkPlain,
  "ring-1 ring-inset ring-[color:color-mix(in_oklab,var(--ui-on-ink-plain)_14%,transparent)]",
);

/**
 * The "Ligues" tab: the reader's leagues through either game, joining with a
 * code, creating one. A visitor is asked to sign in: guests cannot be members.
 */
export function LeaguesPanel() {
  const { t, lang } = useI18n();
  const { status, user, requireAuth } = useAuth();
  const signedIn = status === "authenticated" && Boolean(user);

  const leagues = useQuery<MyLeaguesDto, PredictionsError>({
    queryKey: ["predictions", "leagues", user?.id ?? ""],
    queryFn: ({ signal }) => predictionsService.myLeagues(signal),
    enabled: signedIn,
    staleTime: 60_000,
  });

  if (!signedIn) {
    return (
      <div
        className={cn("flex flex-col gap-3 p-4", ui.radius.card, ui.shadow.lifted, HEADER_TONE)}
        style={HEADER_BOX}
        data-testid="predictions-leagues-signed-out"
      >
        <p className={ui.text.bodyStrong}>{t("predictions.leagues.signed_out")}</p>
        <UiButton
          variant="ink"
          onClick={() => {
            track("pronostics_signup_click");
            requireAuth(() => {}, { reason: t("predictions.leagues.signed_out") });
          }}
        >
          {t("predictions.guest.cta_button")}
        </UiButton>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2" aria-labelledby="predictions-leagues-title">
        <h2
          id="predictions-leagues-title"
          className={cn("flex items-center gap-2", ui.text.label, ui.tone.ink)}
        >
          <span
            aria-hidden
            className="h-3.5 w-1 shrink-0 rounded-full"
            style={{ backgroundImage: "var(--ui-grad-action)" }}
          />
          {t("predictions.leagues.title")}
        </h2>
        {leagues.isPending ? (
          <UiStatePanel kind="loading" />
        ) : leagues.isError ? (
          <UiErrorState onRetry={() => void leagues.refetch()} />
        ) : leagues.data.items.length === 0 ? (
          <UiEmptyState title={t("predictions.leagues.empty")} />
        ) : (
          <ul className="flex flex-col gap-3" data-testid="predictions-my-leagues">
            {leagues.data.items.map((league) => {
              const fantasy = league.via === "fantasy";
              return (
                <li key={league.leagueId}>
                  <Link
                    to="/pronostics/ligues/$leagueId"
                    params={{ leagueId: league.leagueId }}
                    className={cn(
                      "flex items-stretch gap-3 p-3",
                      ui.radius.card,
                      ui.shadow.lifted,
                      fantasy ? INK_TONE : HEADER_TONE,
                      ui.focus,
                      "press-tile",
                    )}
                    style={fantasy ? INK_BOX : HEADER_BOX}
                  >
                    <span
                      aria-hidden
                      className={ui.edge.bar}
                      style={{ backgroundImage: "var(--ui-grad-action)" }}
                    />
                    <span className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
                      <span className={cn("truncate", ui.text.subtitle)} dir="auto">
                        {league.name}
                      </span>
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className={ui.text.meta}>
                          {membersLabel(league.members, lang, t)}
                        </span>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5",
                            ui.text.micro,
                            "[font-weight:var(--ui-weight-heavy)]",
                            fantasy
                              ? "bg-[color:color-mix(in_oklab,var(--ui-on-ink-plain)_16%,transparent)]"
                              : "bg-[color:color-mix(in_oklab,var(--ui-on-grad-header)_14%,transparent)]",
                          )}
                        >
                          {fantasy
                            ? t("predictions.leagues.via_fantasy")
                            : t("predictions.leagues.via_predictions")}
                        </span>
                      </span>
                    </span>
                    {/* The reader's own standing in the league: their season
                        points, on the action gradient (ink-deep on it). */}
                    <span
                      className={cn(
                        "flex min-w-14 shrink-0 flex-col items-center justify-center self-center rounded-xl px-2.5 py-1.5 text-[color:var(--ui-ink-deep)]",
                        ui.shadow.card,
                      )}
                      style={{ backgroundImage: "var(--ui-grad-action)" }}
                      data-testid="predictions-league-points"
                    >
                      <bdi className={ui.score.sm}>{formatNumber(league.seasonPoints, lang)}</bdi>
                      <span className={cn(ui.text.micro, "[font-weight:var(--ui-weight-heavy)]")}>
                        {t("predictions.board.col_points")}
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 self-center" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <JoinLeagueForm />
      <CreateLeagueForm />
    </div>
  );
}
