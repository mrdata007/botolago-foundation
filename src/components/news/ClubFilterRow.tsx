import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/auth/AuthProvider";
import { followService } from "@/services/follows";
import { ClubCrest } from "@/components/common/ClubCrest";
import { ui } from "@/components/ui-kit";
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
                "ms-1 px-1.5 py-0.5",
                ui.radius.control,
                ui.text.label,
                followedIds.has(club.id) ? ui.surface.ink : cn(ui.surface.sunken, ui.tone.muted),
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
        // The kit's chip vocabulary, hand-applied rather than via `UiChip`:
        // this chip contains a nested follow-toggle <button>, so it must not
        // itself be a <button>. Everything visual still comes from the kit.
        "inline-flex cursor-pointer select-none items-center gap-1 py-1 pe-3 transition-colors",
        ui.space.tap,
        ui.radius.full,
        ui.text.meta,
        "[font-weight:var(--ui-weight-strong)]",
        ui.focus,
        leading ? "ps-1" : "ps-3",
        active
          ? cn(ui.surface.ink, "shadow-[var(--ui-shadow-card)]")
          : cn(ui.surface.sunken, ui.tone.muted),
      )}
    >
      {leading}
      <span>{children}</span>
      {trailing}
    </span>
  );
}
