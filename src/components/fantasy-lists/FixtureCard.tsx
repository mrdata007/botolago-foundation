import { ClubCrest } from "@/components/common/ClubCrest";
import { clubLabel } from "@/components/fantasy/club-identity";
import { ui, UiBadge, UiDifficultyCell } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import type { Club } from "@/types/domain";
import type { FixtureDifficulty } from "@/types/fantasy";

/**
 * One upcoming fixture on the player page (A-Player "Prochains matchs"): the
 * gameweek and venue, the opponent's crest disc and name, and the difficulty
 * as a band along the card's foot.
 *
 * The band is `UiDifficultyCell` — the saturated `--ui-fdr-N` fill with its
 * own `--ui-on-fdr-N` foreground, the scale the difficulty grid uses — laid
 * flat as a strip. It is not a control, so it drops the cell's tap height.
 * The boards' pale tints have no token; the same five steps read the same
 * everywhere instead. A double or blank gameweek keeps its badge.
 */
export function FixtureCard({
  fixture,
  opponent,
}: {
  fixture: FixtureDifficulty;
  opponent?: Club;
}) {
  const { t, tr, lang } = useI18n();
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR");
  return (
    <li
      className={cn(
        ui.surface.card,
        "flex min-w-0 flex-col items-center overflow-hidden text-center",
      )}
    >
      {/* The labels take the card's spare height, so a name on two lines in
          one card leaves every difficulty band on the same foot line. */}
      <div className="flex w-full flex-1 flex-col items-center pb-2.5">
        {/* Wraps rather than truncating: a third of a 320px screen cut
            "Extérieur" to "Extéri…", and the venue is half of what it says. */}
        <p
          className={cn(
            "mt-2.5 max-w-full text-balance px-1.5",
            ui.text.micro,
            "[font-weight:var(--ui-weight-heavy)]",
            ui.tone.muted,
          )}
        >
          <bdi>{`${t("fantasy.leagues.gw")}${nf.format(fixture.gameweek)}`}</bdi>
          {" · "}
          {fixture.isHome ? t("common.home") : t("common.away")}
        </p>
        {opponent ? (
          <ClubCrest club={opponent} size="xs" className="mt-2" />
        ) : (
          <span aria-hidden className={cn("mt-2 h-7 w-7", ui.radius.full, ui.surface.sunken)} />
        )}
        {/* The short name is the full name for most clubs, so it may take two
            lines: one line cut "Maghreb Tétouan" at 390px. */}
        <p
          dir="auto"
          className={cn(
            "mt-1 line-clamp-2 max-w-full text-balance break-words px-2",
            ui.text.meta,
            "[font-weight:var(--ui-weight-heavy)]",
            ui.tone.default,
          )}
        >
          {opponent ? clubLabel(opponent, tr) : t("fantasy.stat.none")}
        </p>
        {fixture.isDouble || fixture.isBlank ? (
          <span className="mt-1 flex flex-wrap justify-center gap-1 px-1">
            {fixture.isDouble ? (
              <UiBadge tone="positive">{t("fantasy.fixtures.double")}</UiBadge>
            ) : null}
            {fixture.isBlank ? <UiBadge>{t("fantasy.fixtures.blank")}</UiBadge> : null}
          </span>
        ) : null}
      </div>
      <UiDifficultyCell
        difficulty={fixture.difficulty}
        className="min-h-0 w-full rounded-none py-1"
      >
        {t("fantasy.fixtures.difficulty")} {nf.format(fixture.difficulty)}
      </UiDifficultyCell>
    </li>
  );
}
