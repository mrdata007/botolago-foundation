import { Section } from "@/components/common/Section";
import { SectionGroupHeader } from "@/components/common/SectionHeader";
import { PlayerRowSkeleton, SkeletonList } from "@/components/common/Skeletons";
import { EmptyState, ErrorState } from "@/components/common/States";
import { ui, UiBadge, UiCard } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { clubStyle } from "@/lib/club-palette";
import { squadByPosition, type SquadPlayer } from "@/lib/club-season";
import { cn } from "@/lib/utils";
import type { FootballPosition } from "@/backend/football/contracts";
import type { Club } from "@/types/domain";
import type { SectionData } from "./ClubOverview";

/**
 * A club's squad (A-Club, "Effectif"), as a team sheet reads: goalkeepers,
 * defenders, midfielders, forwards, each line with how many it holds. Each
 * row is the shirt number on a disc in the club's colour, then the name; a
 * player the provider gave no number keeps the row's rhythm with an empty
 * disc rather than an invented one. There is no football player page, so a
 * row opens nothing.
 */
export function ClubSquad({ club, squad }: { club: Club; squad: SectionData<SquadPlayer[]> }) {
  const { t } = useI18n();

  if (squad.isPending) {
    return (
      <Section>
        <SkeletonList count={6}>{() => <PlayerRowSkeleton />}</SkeletonList>
      </Section>
    );
  }
  if (squad.isError) {
    return (
      <Section>
        <ErrorState onRetry={() => void squad.refetch()} />
      </Section>
    );
  }
  const groups = squadByPosition(squad.data ?? []);
  if (groups.length === 0) {
    return (
      <Section>
        <EmptyState>{t("club.squad_empty")}</EmptyState>
      </Section>
    );
  }

  // One literal call per line, so the i18n gate can see every key.
  const lineTitle = (position: FootballPosition) =>
    position === "goalkeeper"
      ? t("fpl.group.GK")
      : position === "defender"
        ? t("fpl.group.DEF")
        : position === "midfielder"
          ? t("fpl.group.MID")
          : t("fpl.group.FWD");

  const colours = clubStyle(club);
  return (
    <div data-club={colours["data-club"]} style={colours.style}>
      {groups.map((group) => (
        <Section key={group.position}>
          <SectionGroupHeader
            as="h2"
            title={lineTitle(group.position)}
            meta={<bdi className={ui.text.tabular}>{group.players.length}</bdi>}
          />
          <UiCard padding="none" className="overflow-hidden">
            <ul>
              {group.players.map((player) => (
                <SquadRow key={player.id} player={player} />
              ))}
            </ul>
          </UiCard>
        </Section>
      ))}
    </div>
  );
}

function SquadRow({ player }: { player: SquadPlayer }) {
  const { t } = useI18n();
  return (
    <li
      className={cn(
        "flex min-h-[var(--ui-row-min)] items-center gap-3 px-3.5 py-2",
        ui.rule.blockStart,
        "first:border-t-0",
      )}
    >
      {player.shirtNumber !== null ? (
        <span
          className={cn(
            "grid h-8 w-8 shrink-0 place-items-center",
            ui.radius.full,
            ui.club.fill,
            ui.club.ring,
            ui.stat.sm,
            "[font-weight:var(--ui-weight-heavy)]",
          )}
        >
          <span aria-hidden>{player.shirtNumber}</span>
          <span className="sr-only">
            {t("club.squad.number").replace("{n}", String(player.shirtNumber))}
          </span>
        </span>
      ) : (
        <span aria-hidden className={cn("h-8 w-8 shrink-0", ui.radius.full, ui.surface.sunken)} />
      )}
      <span
        dir="auto"
        className={cn(
          "min-w-0 flex-1 truncate",
          ui.text.body,
          "[font-weight:var(--ui-weight-strong)]",
          ui.tone.default,
        )}
      >
        {player.name}
      </span>
      {player.role === "captain" ? (
        <UiBadge tone="outline">{t("club.squad.captain")}</UiBadge>
      ) : player.role === "vice_captain" ? (
        <UiBadge tone="outline">{t("club.squad.vice_captain")}</UiBadge>
      ) : null}
    </li>
  );
}
