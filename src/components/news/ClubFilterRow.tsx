import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/auth/AuthProvider";
import { FOLLOWED_TEAM_IDS_QUERY_KEY, followService } from "@/services/follows";
import { ClubCrest } from "@/components/common/ClubCrest";
import { UiButton, UiChip } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import type { Club } from "@/types/domain";

/**
 * Club discovery row (existing behaviour, preserved): filters the feed by
 * team and lets a signed-in viewer follow/unfollow the chosen club.
 *
 * Option A: one sideways-scrolling line of the kit's round chips, each with
 * the club's crest disc (`ClubCrest`, coloured by the club palette). The
 * follow toggle used to be a `<button>` nested inside each chip — itself a
 * `span role="button"` — at 21px tall: an interactive element inside an
 * interactive element, under the tap floor. It is now ONE 44px control, for
 * the club that is chosen, beside the row; every chip is a plain `UiChip`
 * toggle.
 */
export function ClubFilterRow({
  clubs,
  selected,
  onSelect,
  followedIds,
}: {
  clubs: readonly Club[];
  selected: string | null;
  onSelect: (clubId: string | null) => void;
  followedIds: ReadonlySet<string>;
}) {
  const { t, tr } = useI18n();
  const { requireAuth } = useAuth();
  const queryClient = useQueryClient();
  const followMutation = useMutation({
    mutationFn: ({ teamId, follow }: { teamId: string; follow: boolean }) =>
      follow ? followService.followTeam(teamId) : followService.unfollowTeam(teamId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: FOLLOWED_TEAM_IDS_QUERY_KEY });
      await queryClient.invalidateQueries({ queryKey: ["identity", "followed-teams"] });
    },
  });

  const chosen = clubs.find((club) => club.id === selected) ?? null;
  const following = chosen ? followedIds.has(chosen.id) : false;

  return (
    <div className="flex min-w-0 items-center gap-2">
      <div
        role="group"
        aria-label={t("news.filter_clubs")}
        className={cn(
          // Bleeds to the screen edge at the start, and at the end too unless
          // the follow control is standing there. `py-1` keeps the focus ring
          // inside the scroller.
          "-ms-[var(--ui-gutter)] flex min-w-0 flex-1 gap-2 overflow-x-auto py-1 ps-[var(--ui-gutter)]",
          "scroll-ps-[var(--ui-gutter)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          !chosen && "-me-[var(--ui-gutter)] pe-[var(--ui-gutter)]",
          // On a wide screen the clubs wrap inside the column: a mouse has no
          // easy way to scroll sideways past a hidden scrollbar.
          "md:mx-0 md:flex-wrap md:overflow-visible md:px-0",
        )}
      >
        <UiChip
          selected={selected === null}
          onClick={() => onSelect(null)}
          className="whitespace-nowrap [font-weight:var(--ui-weight-heavy)]"
        >
          {t("news.filter_all")}
        </UiChip>
        {clubs.map((club) => (
          <UiChip
            key={club.id}
            selected={selected === club.id}
            onClick={() => onSelect(selected === club.id ? null : club.id)}
            // The crest disc sits in the chip's start padding, as the boards
            // draw a crest in a pill; the kit's gap spaces it from the name.
            className="whitespace-nowrap ps-2 [font-weight:var(--ui-weight-heavy)]"
          >
            <ClubCrest club={club} size="xs" />
            {tr(club.shortName)}
          </UiChip>
        ))}
      </div>
      {chosen && (
        <UiButton
          variant={following ? "ink" : "soft"}
          size="sm"
          aria-pressed={following}
          disabled={followMutation.isPending}
          onClick={() =>
            requireAuth(() => followMutation.mutate({ teamId: chosen.id, follow: !following }))
          }
        >
          {following ? t("news.following") : t("news.follow")}
          {/* "Suivre" alone does not say what is followed; the space keeps
              the name from running into the verb ("SuivreWydad AC"). */}
          <span className="sr-only">{` ${tr(chosen.name)}`}</span>
        </UiButton>
      )}
    </div>
  );
}
