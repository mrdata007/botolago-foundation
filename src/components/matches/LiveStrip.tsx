import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ui } from "@/components/ui-kit";
import { useHideOnScroll } from "@/hooks/use-hide-on-scroll";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { footballService } from "@/services/football";

/**
 * Live scores pinned under the top bar (after premierleague.com's live bar).
 *
 * Renders only while at least one match is live. It slides away behind the
 * top bar as the reader scrolls down and comes back as soon as they scroll
 * up. While it is shown it sets `data-live-strip="shown"` on the root, which
 * turns `--livestrip-h` into its height, so a sticky bar lower on the page
 * (the /matches status filters) can sit underneath it instead of under it.
 */
export function LiveStrip() {
  const { t, tr, lang } = useI18n();
  const liveQ = useQuery({
    queryKey: ["football", "live-matches", lang],
    queryFn: () => footballService.getLiveMatches(lang),
    // Scores and minutes move while a match is on; nothing to poll otherwise.
    refetchInterval: (query) => ((query.state.data?.matches.length ?? 0) > 0 ? 30_000 : false),
    refetchIntervalInBackground: false,
  });
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
          return (
            <li key={match.id} className="shrink-0">
              <Link
                to="/matches/$matchId"
                params={{ matchId: match.id }}
                search={{ tab: "summary" }}
                aria-label={label}
                className={cn(
                  "inline-flex items-center gap-2 px-3",
                  "min-h-[var(--ui-tap-min)]",
                  ui.radius.full,
                  ui.surface.sunken,
                  ui.text.meta,
                  "[font-weight:var(--ui-weight-heavy)]",
                  ui.focus,
                  "transition-colors duration-[var(--duration-quick)] ease-[var(--ease-standard)]",
                  "hover:bg-[color:color-mix(in_oklab,var(--ui-ink-fg)_10%,var(--ui-surface-sunken))]",
                )}
              >
                <span
                  aria-hidden
                  className="live-breathe h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--ui-live)]"
                />
                <span>{home.crestPlaceholder}</span>
                <span className={cn("flex items-center gap-1", ui.text.tabular)}>
                  <span>{hs}</span>
                  <span className={ui.tone.muted}>–</span>
                  <span>{as}</span>
                </span>
                <span>{away.crestPlaceholder}</span>
                {minute && <span className={cn(ui.tone.live, ui.text.tabular)}>{minute}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
