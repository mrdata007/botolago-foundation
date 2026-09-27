import type { PepitesEdition } from "@/backend/pepites/contracts";
import { useI18n } from "@/i18n/provider";

import { positionShort } from "./pepites-format";
import { PepitesShareSheet } from "./PepitesShareSheet";
import { renderShareImage, shareImageModel } from "./share-image";

/**
 * Share a published edition: the Top 10 post (Figma 29:386, 1080×1350,
 * drawn on the phone by `share-image.ts`) and a link to its week page.
 */
export function PepitesShareButton({
  edition,
  onNight = false,
}: {
  edition: Pick<PepitesEdition, "week" | "status" | "entries">;
  /** On the night band the trigger is the glass button. */
  onNight?: boolean;
}) {
  const { t, tr, lang } = useI18n();
  const model = shareImageModel(edition, lang, {
    brand: t("pepites.brand"),
    kicker: t("pepites.hero.kicker_short"),
    title: t("pepites.share.post_title"),
    subtitle: t("pepites.share.post_subtitle"),
    footer: "botolago.com/pepites",
    legend: t("pepites.share.legend"),
    club: (player) =>
      player.team
        ? lang === "ar"
          ? tr(player.team.name)
          : tr(player.team.name).toLocaleUpperCase("fr")
        : "",
    position: (group) => positionShort(group, t),
  });
  if (!model) return null;
  return (
    <PepitesShareSheet
      label={t("pepites.share.title")}
      render={() => renderShareImage(model)}
      renderKey={JSON.stringify(model)}
      imageAlt={t("pepites.share.image_alt").replace("{n}", String(edition.week))}
      aspect="post"
      fileName={`pepites-semaine-${edition.week}.png`}
      message={t("pepites.share.message").replace("{n}", `⁨${edition.week}⁩`)}
      path={`/pepites/semaine/${edition.week}`}
      onNight={onNight}
      testId="pepites-share"
    />
  );
}
