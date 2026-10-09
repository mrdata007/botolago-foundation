import { Link } from "@tanstack/react-router";

import newsImage from "@/assets/photos/news-header.webp";
import fantasyImage from "@/assets/photos/fantasy-hero.webp";
import matchesImage from "@/assets/photos/matches-header.webp";
import standingsImage from "@/assets/photos/ranking-card.webp";
import predictionsImage from "@/assets/news/topics/topic-goal.webp";
import pepitesImage from "@/assets/news/topics/topic-training.webp";
import { ui } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { NEWS_ENABLED, PEPITES_PROMOTED, PRONOSTICS_PROMOTED } from "@/lib/feature-flags";
import { cn } from "@/lib/utils";

/** Section highlights in the reference's stories style. Native links keep
 * every destination reachable with touch, a keyboard or an open-in-new-tab.
 * The accent ring is decorative: it does not claim unread or live content.
 */
export function HomeStories() {
  const { t } = useI18n();
  const highlights = [
    { to: "/news", label: t("nav.news"), image: newsImage, enabled: NEWS_ENABLED },
    { to: "/fantasy", label: t("nav.fantasy"), image: fantasyImage, enabled: true },
    { to: "/matches", label: t("nav.matches"), image: matchesImage, enabled: true },
    {
      to: "/matches/standings",
      label: t("matches.table_preview"),
      image: standingsImage,
      enabled: true,
    },
    {
      to: "/pronostics",
      label: t("home.discover.predictions"),
      image: predictionsImage,
      enabled: PRONOSTICS_PROMOTED,
    },
    { to: "/pepites", label: t("nav.pepites"), image: pepitesImage, enabled: PEPITES_PROMOTED },
  ] as const;

  return (
    <nav aria-label={t("home.highlights")} data-testid="home-stories" className="min-w-0 py-4">
      <ul
        className={cn(
          "flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain p-1 sm:gap-5",
          "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        )}
      >
        {highlights
          .filter((item) => item.enabled)
          .map(({ to, label, image }) => (
            <li key={to} className="w-24 shrink-0 snap-start">
              <Link
                to={to}
                onFocus={(event) =>
                  event.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" })
                }
                className={cn(
                  "group flex min-h-[var(--ui-tap-min)] flex-col items-center gap-2 rounded-[var(--ui-radius-card)]",
                  ui.focus,
                  ui.tone.default,
                )}
              >
                <span
                  className={cn(
                    "block size-[calc(var(--ui-tap-min)*2)] shrink-0 rounded-full p-1",
                    "bg-[image:var(--ui-grad-action)] motion-safe:transition-transform motion-safe:group-hover:scale-105",
                  )}
                >
                  <span className="block size-full rounded-full bg-[color:var(--ui-page)] p-1">
                    <img
                      src={image}
                      alt=""
                      width={80}
                      height={80}
                      draggable={false}
                      className="size-full rounded-full object-cover"
                    />
                  </span>
                </span>
                <span
                  className={cn(
                    "w-full break-words text-center [font-weight:var(--ui-weight-heavy)] group-hover:underline",
                    ui.text.secondary,
                  )}
                >
                  {label}
                </span>
              </Link>
            </li>
          ))}
      </ul>
    </nav>
  );
}
