import type { PlayerResponse } from "@/backend/pepites/contracts";
import { useI18n } from "@/i18n/provider";

import { COMPONENTS, componentLabel, formatNumber, positionLabel } from "./pepites-format";
import { PepitesShareSheet } from "./PepitesShareSheet";
import { renderStoryImage, storyModel } from "./share-image";

type LoadedPlayer = Extract<PlayerResponse, { available: true }>;

/**
 * Share a ranked player: the story card (Figma 11:515, 1080×1920) with the
 * percentile wheel, and a link to the player's page. A player without a
 * score has no card.
 */
export function PepitesPlayerShareButton({ data }: { data: LoadedPlayer }) {
  const { t, tr, lang } = useI18n();
  const player = data.player;
  const score = data.score;
  if (!player || !score || score.score === null) return null;
  const meta = [
    player.team ? tr(player.team.name) : null,
    player.positionGroup ? positionLabel(player.positionGroup, t) : null,
    typeof player.age === "number"
      ? t("pepites.meta.age_long").replace("{n}", formatNumber(player.age, lang))
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const model = storyModel(player, score, lang, {
    brand: t("pepites.brand"),
    kicker: t("pepites.hero.kicker_short"),
    meta: lang === "ar" ? meta : meta.toLocaleUpperCase("fr"),
    legend: COMPONENTS.map((key) => componentLabel(key, t)),
    rankLine: t("pepites.hero.rank_line"),
    statsLine: t("pepites.share.story_stats"),
    footer: "botolago.com/pepites",
  });
  const slug = player.name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return (
    <PepitesShareSheet
      label={t("pepites.share.player_title")}
      render={() => renderStoryImage(model)}
      renderKey={JSON.stringify(model)}
      imageAlt={t("pepites.share.story_alt").replace("{name}", player.name)}
      aspect="story"
      fileName={`pepites-${slug || "joueur"}.png`}
      message={t("pepites.share.player_message").replace("{name}", `⁨${player.name}⁩`)}
      path={`/pepites/joueur/${player.id}`}
      onNight
      testId="pepites-player-share"
    />
  );
}
