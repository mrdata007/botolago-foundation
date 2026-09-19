import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/auth/AuthProvider";
import { followService } from "@/services/follows";
import { ClubCrest } from "@/components/common/ClubCrest";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import type { Club } from "@/types/domain";

/**
 * Club discovery row (existing behavior, preserved): filters the feed by
 * team and lets a signed-in viewer follow/unfollow directly from the chip.
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
      await queryClient.invalidateQueries({ queryKey: ["identity", "followed-team-ids"] });
      await queryClient.invalidateQueries({ queryKey: ["identity", "followed-teams"] });
    },
  });

  return (
    <div className="flex flex-wrap gap-2">
      <ClubChip active={selected === null} onClick={() => onSelect(null)}>
        {t("news.filter_all")}
      </ClubChip>
      {clubs.map((club) => (
        <ClubChip
          key={club.id}
          active={selected === club.id}
          onClick={() => onSelect(selected === club.id ? null : club.id)}
          leading={<ClubCrest club={club} size="sm" className="h-8 w-8 rounded-full" />}
          trailing={
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                requireAuth(() =>
                  followMutation.mutate({
                    teamId: club.id,
                    follow: !followedIds.has(club.id),
                  }),
                );
              }}
              aria-pressed={followedIds.has(club.id)}
              disabled={followMutation.isPending}
              className={cn(
                "ms-1 rounded-md px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide",
                followedIds.has(club.id)
                  ? "bg-[color:var(--brand-accent)] text-white"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {followedIds.has(club.id) ? t("news.following") : t("news.follow")}
            </button>
          }
        >
          {tr(club.shortName)}
        </ClubChip>
      ))}
    </div>
  );
}

function ClubChip({
  active,
  onClick,
  children,
  leading,
  trailing,
}: {
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  // Rendered as role="button" so a nested follow-toggle <button> stays valid HTML.
  return (
    <span
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick?.();
        }
      }}
      aria-pressed={active}
      className={cn(
        "inline-flex min-h-11 cursor-pointer select-none items-center gap-1 rounded-full border py-1 pe-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-accent)]",
        leading ? "ps-1" : "ps-3",
        active
          ? "border-[color:var(--brand-accent)] bg-[color:var(--brand-accent)] text-white"
          : "border-[var(--glass-border)] bg-white/50 text-foreground hover:bg-white/70",
      )}
    >
      {leading}
      <span>{children}</span>
      {trailing}
    </span>
  );
}
