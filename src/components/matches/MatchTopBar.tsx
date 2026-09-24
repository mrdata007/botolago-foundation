import { Share2 } from "lucide-react";
import { ClubCrest } from "@/components/common/ClubCrest";
import { ui, UiBackButton, UiHeader, UiIconButton, UiLivePill } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { clubStyle, type ClubPalette } from "@/lib/club-palette";
import { cn } from "@/lib/utils";
import type { Club, Match } from "@/types/domain";

/**
 * The match page's own bar, in place of the global one (`AppShell topBar`).
 *
 * At the top of the page it is A-Match's white bar: the back pill, the
 * competition and round as a kicker, and share. Once the split header has
 * scrolled up under it (`compact`), the same slot shows the boards' compact
 * bar (A-Stats, A-Lineups, A-H2H): the two club colours, glass back and
 * share, the crests either side of a small score box and the live pill. The
 * two cross-fade; the hidden one is `inert`, so it can be neither focused nor
 * read.
 *
 * Both are exactly the global bar's height (`--topbar-h`: the safe area, the
 * 44px row, 8px and a 1px rule — hence `pb-2` on the header, one step under
 * its default), so the sticky tabs below use the shell's own offset and do
 * not jump when the bars swap.
 */
export function MatchTopBar({
  kicker,
  onBack,
  onShare,
  compact,
  fixture,
}: {
  kicker?: string;
  onBack: () => void;
  /** Absent while the match is loading or missing: no share button then. */
  onShare?: () => void;
  compact: boolean;
  /** What the compact bar shows; without it the bar never goes compact. */
  fixture?: {
    match: Match;
    home: Club;
    away: Club;
    palettes: { home: ClubPalette; away: ClubPalette };
    /** Minutes played, for the elapsed-time bar along the compact bar's foot. */
    elapsed: number;
  };
}) {
  const { t } = useI18n();
  const showCompact = compact && !!fixture;
  const share = onShare ? (
    <UiIconButton aria-label={t("article.share")} onClick={onShare}>
      <Share2 />
    </UiIconButton>
  ) : undefined;

  return (
    <div data-match-bar="" className="sticky top-0 z-30">
      <div
        inert={showCompact}
        className={cn(
          "transition-opacity duration-[var(--duration-quick)] ease-[var(--ease-standard)]",
          showCompact && "opacity-0",
        )}
      >
        <UiHeader kicker={kicker} onBack={onBack} trailing={share} className="pb-2" />
      </div>
      {fixture ? (
        <CompactBar {...fixture} shown={showCompact} onBack={onBack} onShare={onShare} />
      ) : null}
    </div>
  );
}

function CompactBar({
  match,
  home,
  away,
  palettes,
  elapsed,
  shown,
  onBack,
  onShare,
}: {
  match: Match;
  home: Club;
  away: Club;
  palettes: { home: ClubPalette; away: ClubPalette };
  elapsed: number;
  shown: boolean;
  onBack: () => void;
  onShare?: () => void;
}) {
  const { t } = useI18n();
  const isLive = match.status === "live";
  const showScore = isLive || match.status === "finished";
  return (
    <div
      inert={!shown}
      className={cn(
        "absolute inset-0 overflow-hidden transition-opacity duration-[var(--duration-quick)] ease-[var(--ease-standard)]",
        !shown && "pointer-events-none opacity-0",
      )}
    >
      <div className="absolute inset-0 flex">
        <span {...clubStyle(palettes.home)} className={cn("flex-1", ui.club.fill)} />
        <span {...clubStyle(palettes.away)} className={cn("flex-1", ui.club.fill)} />
      </div>
      <div
        className={cn(
          // Over the page's content column on a wide screen, like the white
          // bar's controls; the colours behind stay full-bleed.
          "absolute inset-x-0 top-0 mx-auto flex h-full max-w-[var(--ui-content-max)] items-start justify-between px-3",
          ui.safe.top,
        )}
      >
        <div {...clubStyle(palettes.home)}>
          <UiBackButton tone="glass" iconOnly onClick={onBack} />
        </div>
        {/* The same match as the big header, hidden from assistive tech:
            the header's score is the page's one live region. */}
        <div aria-hidden className="flex h-[var(--ui-tap-min)] items-center gap-2">
          <ClubCrest club={home} palette={palettes.home} size="xs" tone="inverse" />
          <div className="flex flex-col items-center gap-0.5">
            {showScore ? (
              <span
                className={cn(
                  "flex items-center gap-1.5 px-2.5",
                  ui.surface.scorebox,
                  ui.radius.segment,
                  ui.shadow.lifted,
                  ui.score.sm,
                )}
              >
                <bdi>{match.homeScore ?? 0}</bdi>
                <span>–</span>
                <bdi>{match.awayScore ?? 0}</bdi>
              </span>
            ) : null}
            {isLive ? <UiLivePill minute={match.minute} /> : null}
          </div>
          <ClubCrest club={away} palette={palettes.away} size="xs" tone="inverse" />
        </div>
        <div {...clubStyle(palettes.away)}>
          {onShare ? (
            <UiIconButton variant="glass" aria-label={t("article.share")} onClick={onShare}>
              <Share2 />
            </UiIconButton>
          ) : (
            <span className="block w-[var(--ui-tap-min)]" />
          )}
        </div>
      </div>
      {isLive ? (
        // The big header's elapsed-time bar, carried along the foot of the
        // compact one (A-Stats). It fills from the inline start.
        <div aria-hidden className="absolute inset-x-0 bottom-0 flex h-1 bg-[color:var(--ui-rule)]">
          <span
            className="bg-[color:var(--ui-live)]"
            style={{ width: `${Math.min(100, (elapsed / 90) * 100)}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}
