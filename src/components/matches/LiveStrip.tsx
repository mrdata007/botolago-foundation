import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { ClubCrest } from "@/components/common/ClubCrest";
import { ui } from "@/components/ui-kit";
import { useHideOnScroll } from "@/hooks/use-hide-on-scroll";
import { useI18n } from "@/i18n/provider";
import { clubMatchPalettes } from "@/lib/club-palette";
import { cn } from "@/lib/utils";
import { useLiveMatches } from "./use-live-matches";

/**
 * Live scores pinned under the top bar (after premierleague.com's live bar).
 *
 * Renders only while at least one match is live. It slides away behind the
 * top bar as the reader scrolls down and comes back as soon as they scroll
 * up. While it is shown it sets `data-live-strip="shown"` on the root, which
 * turns `--livestrip-h` into its height, so a sticky bar lower on the page
 * (the /matches status filters) can sit underneath it instead of under it.
 *
 * Option A (A-Home, A-Matches): each live match is a navy pill
 * (`ui.surface.inkPlain`) holding the two clubs' crest discs; the codes; the
 * score in the display face as three flex children; the breathing dot; the
 * minute.
 * The discs take their colours from `clubMatchPalettes`, so a clash (Wydad v
 * Tétouan) re-colours the away disc here exactly as it does in the match
 * header. The boards' 36px pill is under the tap floor; this one is 44px.
 * The boards also show the next kickoff as a light chip; that would keep the
 * strip (and `--livestrip-h`) up with nothing live, so it is not drawn here.
 */
export function LiveStrip() {
  const { t, tr, lang } = useI18n();
  const liveQ = useLiveMatches();
  const hidden = useHideOnScroll();

  const matches = liveQ.data?.matches ?? [];
  const present = matches.length > 0;
  const shown = present && !hidden;

  useEffect(() => {
    const root = document.documentElement;
    if (shown) root.dataset.liveStrip = "shown";
    else delete root.dataset.liveStrip;
    return () => {
      delete root.dataset.liveStrip;
    };
  }, [shown]);

  if (!present) return null;

  const clubById = (id: string) => liveQ.data?.clubs.find((club) => club.id === id);
  const scoreTemplate = t("matches.a11y.score");

  return (
    <section
      aria-label={t("matches.live_strip")}
      inert={hidden}
      className={cn(
        "sticky top-[var(--topbar-h)] z-[25] h-[var(--livestrip-h-open)]",
        ui.surface.bar,
        ui.rule.block,
        "transition-[transform,opacity] duration-[var(--duration-sheet)] ease-[var(--ease-standard)]",
        hidden && "pointer-events-none -translate-y-full opacity-0",
      )}
    >
      <ul
        className={cn(
          "mx-auto flex h-full items-center gap-2 overflow-x-auto md:max-w-[var(--ui-content-max)]",
          "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          ui.space.gutter,
        )}
      >
        {matches.map((match) => {
          const home = clubById(match.homeClubId);
          const away = clubById(match.awayClubId);
          if (!home || !away) return null;
          const hs = match.homeScore ?? 0;
          const as = match.awayScore ?? 0;
          const minute = match.minute ? `${match.minute}′` : "";
          const label = `${scoreTemplate
            .replace("{home}", tr(home.shortName))
            .replace("{hs}", String(hs))
            .replace("{away}", tr(away.shortName))
            .replace("{as}", String(as))}${minute ? ` — ${minute}` : ""}`;
          const colours = clubMatchPalettes(home, away);
          return (
            <li key={match.id} className="shrink-0">
              <Link
                to="/matches/$matchId"
                params={{ matchId: match.id }}
                aria-label={label}
                className={cn(
                  "inline-flex items-center gap-2 pe-3 ps-1",
                  "min-h-[var(--ui-tap-min)]",
                  ui.radius.full,
                  ui.surface.inkPlain,
                  ui.text.meta,
                  "[font-weight:var(--ui-weight-heavy)]",
                  ui.focus,
                  "transition-colors duration-[var(--duration-quick)] ease-[var(--ease-standard)]",
                  "hover:bg-[color:color-mix(in_oklab,var(--ui-on-ink-plain)_12%,var(--ui-ink))]",
                )}
              >
                {/* The pair of discs, side by side. The boards overlap them,
                    but they drew bare colour dots: a real disc carries the
                    monogram, or in production the club's badge, and an 8px
                    overlap hid a third of the home one (measured: "WAC" read
                    "WA" under the FAR disc). */}
                <span aria-hidden className="flex shrink-0 items-center gap-0.5">
                  <ClubCrest club={home} palette={colours.home} size="xs" />
                  <ClubCrest club={away} palette={colours.away} size="xs" />
                </span>
                <span>{home.crestPlaceholder}</span>
                {/* Three flex children in a container that follows the page
                    direction, so home is on the right in Arabic. */}
                <span className={cn("flex items-center gap-1", ui.score.row)}>
                  <bdi>{hs}</bdi>
                  <span aria-hidden>–</span>
                  <bdi>{as}</bdi>
                </span>
                <span>{away.crestPlaceholder}</span>
                <span
                  aria-hidden
                  className="live-breathe h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--ui-live)]"
                />
                {minute && <bdi className={ui.text.tabular}>{minute}</bdi>}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
