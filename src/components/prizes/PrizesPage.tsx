import { Link } from "@tanstack/react-router";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { BookOpen, ChevronRight, Gift, Medal, Target, Trophy, Users } from "lucide-react";
import { useState, type ComponentType } from "react";

import type { PrizeTier, PrizeWinnerCursor, PublicPrizeDto } from "@/backend/prizes/contracts";
import { FailureAwareImage } from "@/components/common/FailureAwareImage";
import {
  ui,
  UiButton,
  UiCard,
  UiEmptyState,
  UiErrorState,
  UiStatePanel,
} from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { pointsLabel } from "@/components/matches/standings-copy";
import { cn } from "@/lib/utils";
import { ReportNameMenu } from "@/components/report/ReportNameMenu";
import { prizesService } from "@/services/prizes";
import { PRIZE_HERO_ART, PRIZE_HERO_PHOTO, PRIZE_TIER_ART } from "./prize-art";
import { fill, formatMad, howToWin, periodLabel, tierLabel } from "./prize-presentation";

const TIER_ICONS: Record<PrizeTier, ComponentType<{ className?: string }>> = {
  gameweek: Medal,
  monthly: Gift,
  season: Trophy,
  mini_league: Users,
};

/**
 * `/prizes`: the prizes that are switched on, how each is won, and the wall of
 * verified winners. Everything shown comes from the admin-edited catalog and
 * the winners table; nothing about a prize is written into this file.
 *
 * The wall carries what the public functions return and nothing else: team
 * name, masked username, points and the period. A tie that was decided by a
 * tie-break says so.
 */
export function PrizesPage() {
  const { t } = useI18n();
  const prizes = useQuery({
    queryKey: ["prizes", "catalog"],
    queryFn: () => prizesService.listPrizes(),
    staleTime: 5 * 60_000,
  });

  return (
    // Flex columns rather than grids all the way down: a grid's auto track grows
    // to the widest unbreakable line inside it (a truncated winner row is one),
    // which pushed the whole column past the screen at 390px. A column flex
    // item takes its width from the container instead.
    <div className={cn("flex min-w-0 flex-col gap-8 pb-8 pt-4 md:gap-10 md:pt-6", ui.space.gutter)}>
      <PrizesHero />

      {prizes.isPending ? (
        <UiStatePanel kind="loading" />
      ) : prizes.isError ? (
        <UiErrorState onRetry={() => void prizes.refetch()} />
      ) : prizes.data.length === 0 ? (
        <UiEmptyState
          title={t("prizes.empty.title")}
          body={t("prizes.empty.body")}
          testId="prizes-empty"
        />
      ) : (
        <section aria-labelledby="prizes-catalog-heading" className="flex min-w-0 flex-col gap-4">
          <h2 id="prizes-catalog-heading" className={cn(ui.display.section, ui.tone.default)}>
            {t("prizes.title")}
          </h2>
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2 md:gap-5">
            {prizes.data.map((prize) => (
              <li key={prize.id} className="min-w-0">
                <PrizeCard prize={prize} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <WinnersWall />

      <Link
        to="/prizes/terms"
        className={cn(
          "flex items-center gap-3 px-4 py-3",
          ui.surface.card,
          ui.space.row,
          ui.text.bodyStrong,
          ui.tone.default,
          "transition-colors hover:bg-[color:var(--ui-surface-sunken)] active:bg-[color:var(--ui-surface-sunken)]",
          ui.focus,
        )}
        data-testid="prizes-terms-link"
      >
        <span
          className={cn(
            "grid h-9 w-9 shrink-0 place-items-center",
            ui.radius.full,
            ui.surface.sunken,
            ui.tone.ink,
          )}
        >
          <BookOpen className="h-[18px] w-[18px]" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">{t("prizes.terms_link")}</span>
        <ChevronRight className={cn("h-5 w-5 shrink-0", ui.tone.muted)} aria-hidden />
      </Link>
    </div>
  );
}

/**
 * The page header: the floodlit stadium (the hub's gameweek band uses the same
 * `to bottom` scrim, so it reads the same way in Arabic), the cup, and the one
 * line that sells the page -- play free, win prizes.
 */
function PrizesHero() {
  const { t } = useI18n();
  return (
    <section
      className={cn("relative isolate overflow-hidden", ui.radius.sheet, ui.shadow.lifted)}
      data-testid="prizes-hero"
    >
      <img
        src={PRIZE_HERO_PHOTO}
        alt=""
        aria-hidden
        decoding="async"
        className="absolute inset-0 -z-10 h-full w-full object-cover object-[50%_35%]"
      />
      <span
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          backgroundImage:
            "linear-gradient(to bottom, color-mix(in oklab, var(--ui-ink-deep) 68%, transparent), color-mix(in oklab, var(--ui-ink-deep) 96%, transparent))",
        }}
      />
      <div
        className={cn(
          "relative grid items-center gap-5 px-5 py-6 sm:grid-cols-[minmax(0,1fr)_160px] sm:gap-8 sm:p-8 lg:grid-cols-[minmax(0,1fr)_208px]",
          ui.tone.onInkPlain,
        )}
      >
        <div className="flex min-w-0 flex-col items-start gap-4">
          <span
            className={cn(
              "inline-flex max-w-full items-center gap-2 px-3 py-1.5",
              ui.radius.full,
              ui.text.micro,
              "[font-weight:var(--ui-weight-heavy)] text-[color:var(--ui-ink-deep)]",
            )}
            style={{ backgroundImage: "var(--ui-grad-action)" }}
            data-testid="prizes-free-to-play"
          >
            <Gift className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>{t("prizes.free_to_play")}</span>
          </span>
          <h2 className={cn("max-w-xl text-balance", ui.display.title)}>
            {t("prizes.welcome.title")}
          </h2>
          <p className={cn("max-w-lg text-pretty", ui.text.body, ui.tone.onInkMuted)}>
            {t("prizes.intro")}
          </p>
        </div>
        <img
          src={PRIZE_HERO_ART}
          alt=""
          aria-hidden
          decoding="async"
          className="hidden h-44 w-full object-contain drop-shadow-[0_12px_20px_rgba(0,0,0,0.35)] sm:block lg:h-52"
        />
      </div>
    </section>
  );
}

/**
 * The prize's own photo when an admin set one; otherwise, or if that link does
 * not load, the tier's picture on a quiet studio-grey ground.
 */
function PrizeArt({ prize }: { prize: PublicPrizeDto }) {
  const [failed, setFailed] = useState(false);
  if (prize.imageUrl && !failed) {
    return (
      <FailureAwareImage
        src={prize.imageUrl}
        alt=""
        onFailed={() => setFailed(true)}
        className="h-44 w-full object-cover sm:h-48"
      />
    );
  }
  return (
    <div
      className={cn(
        "flex h-44 items-center justify-center overflow-hidden px-6 pb-2 pt-10 sm:h-48",
        ui.surface.sunken,
      )}
      style={{
        backgroundImage:
          "radial-gradient(ellipse at 50% 100%, color-mix(in oklab, var(--ui-ink-fg) 12%, transparent), transparent 75%)",
      }}
      aria-hidden
    >
      <img
        src={PRIZE_TIER_ART[prize.tier]}
        alt=""
        loading="lazy"
        decoding="async"
        className="h-full w-auto max-w-full object-contain drop-shadow-[0_8px_14px_rgba(0,0,0,0.18)]"
      />
    </div>
  );
}

function PrizeCard({ prize }: { prize: PublicPrizeDto }) {
  const { t, lang, tr } = useI18n();
  const Icon = TIER_ICONS[prize.tier];
  return (
    <UiCard padding="none" className="flex h-full flex-col overflow-hidden" testId="prize-card">
      <div className="relative">
        <PrizeArt prize={prize} />
        <div
          className={cn(
            "absolute start-4 top-4 inline-flex max-w-[calc(100%-2rem)] items-center gap-2 px-3 py-1.5",
            ui.surface.bar,
            ui.radius.full,
            ui.shadow.card,
          )}
        >
          <Icon className={cn("h-4 w-4 shrink-0", ui.tone.ink)} aria-hidden />
          <p className={cn(ui.text.meta, "[font-weight:var(--ui-weight-heavy)]", ui.tone.default)}>
            {tierLabel(t, prize.tier)}
          </p>
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-3 p-5">
        <h3 className={cn("text-balance", ui.display.section, ui.tone.default)}>
          {tr(prize.name)}
        </h3>
        {tr(prize.description) ? (
          <p className={cn(ui.text.secondary, ui.tone.muted)}>{tr(prize.description)}</p>
        ) : null}
        <p
          className={cn(
            "self-start px-3 py-2",
            ui.radius.control,
            ui.surface.sunken,
            ui.text.bodyStrong,
            ui.tone.default,
          )}
          data-testid={prize.estimatedValueMad === null ? "prize-merch" : "prize-value"}
        >
          {prize.estimatedValueMad === null
            ? t("prizes.merch_only")
            : formatMad(t, prize.estimatedValueMad, lang)}
        </p>
        <div
          className={cn("mt-auto flex items-start gap-3 p-3", ui.radius.control, ui.surface.sunken)}
        >
          <Target className={cn("mt-0.5 h-4 w-4 shrink-0", ui.tone.ink)} aria-hidden />
          <div className="min-w-0">
            <p className={cn(ui.text.label, ui.tone.muted)}>{t("prizes.how_to_win")}</p>
            <p className={cn("mt-1 text-pretty", ui.text.secondary, ui.tone.default)}>
              {howToWin(t, prize.tier)}
            </p>
          </div>
        </div>
        {prize.sponsorName ? (
          <div className="flex items-center gap-2 pt-1">
            {prize.sponsorLogoUrl ? (
              <FailureAwareImage
                src={prize.sponsorLogoUrl}
                alt={fill(t("prizes.sponsor_logo_alt"), { sponsor: prize.sponsorName })}
                className="h-7 w-auto max-w-28 object-contain"
              />
            ) : null}
            <span className={cn(ui.text.meta, ui.tone.muted)}>
              {fill(t("prizes.sponsored_by"), { sponsor: prize.sponsorName })}
            </span>
          </div>
        ) : null}
      </div>
    </UiCard>
  );
}

function WinnersWall() {
  const { t, lang, tr } = useI18n();
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR");
  const winners = useInfiniteQuery({
    queryKey: ["prizes", "winners"],
    queryFn: ({ pageParam }) => prizesService.listWinners(pageParam, 20),
    initialPageParam: null as PrizeWinnerCursor | null,
    getNextPageParam: (page) => page.nextCursor,
    staleTime: 5 * 60_000,
  });
  const items = winners.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <section aria-labelledby="prizes-winners-heading" className="flex min-w-0 flex-col gap-4">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "grid h-10 w-10 shrink-0 place-items-center",
            ui.radius.full,
            ui.surface.sunken,
            ui.tone.ink,
          )}
          aria-hidden
        >
          <Trophy className="h-5 w-5" />
        </span>
        <h2
          id="prizes-winners-heading"
          className={cn("text-balance", ui.display.section, ui.tone.default)}
        >
          {t("prizes.winners.title")}
        </h2>
      </div>
      {winners.isPending ? (
        <UiStatePanel kind="loading" />
      ) : winners.isError ? (
        <UiErrorState onRetry={() => void winners.refetch()} />
      ) : items.length === 0 ? (
        <UiCard padding="md">
          <p className={cn(ui.text.secondary, ui.tone.muted)} data-testid="prizes-winners-empty">
            {t("prizes.winners.empty")}
          </p>
        </UiCard>
      ) : (
        <UiCard padding="none">
          <ol data-testid="prizes-winners">
            {items.map((winner, index) => (
              <li
                key={winner.id}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5",
                  ui.space.row,
                  index < items.length - 1 && ui.rule.block,
                )}
                data-testid="prizes-winner"
              >
                <div className="min-w-0 flex-1">
                  <p className={cn(ui.text.label, ui.tone.muted)}>
                    {tierLabel(t, winner.tier)} · {periodLabel(t, winner)}
                  </p>
                  <p className={cn("truncate", ui.text.bodyStrong, ui.tone.default)}>
                    {winner.teamName}
                  </p>
                  <p className={cn("truncate", ui.text.meta, ui.tone.muted)}>
                    {winner.maskedUsername ? <bdi>{winner.maskedUsername}</bdi> : null}
                    {winner.maskedUsername ? " · " : null}
                    {tr(winner.prizeName)}
                  </p>
                  {winner.tieBreak !== "outright" ? (
                    <p className={cn(ui.text.micro, ui.tone.muted)}>
                      {t("prizes.winners.tie_break")}
                    </p>
                  ) : null}
                </div>
                <bdi
                  className={cn("shrink-0", ui.text.bodyStrong, ui.text.tabular, ui.tone.default)}
                >
                  {pointsLabel(winner.points, lang, t, nf.format)}
                </bdi>
                {/* The team name is the winner's own choice: anyone else may
                    report it. The database says which rows are the reader's
                    own (isMe), without exposing anyone's account. */}
                {!winner.isMe ? (
                  <ReportNameMenu
                    targets={[{ kind: "team", name: winner.teamName, id: `winner:${winner.id}` }]}
                  />
                ) : null}
              </li>
            ))}
          </ol>
        </UiCard>
      )}
      {winners.hasNextPage ? (
        <div>
          <UiButton
            size="sm"
            variant="outline"
            disabled={winners.isFetchingNextPage}
            onClick={() => void winners.fetchNextPage()}
          >
            {t("prizes.winners.more")}
          </UiButton>
        </div>
      ) : null}
    </section>
  );
}
