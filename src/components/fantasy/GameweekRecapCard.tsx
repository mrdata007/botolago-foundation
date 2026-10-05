import { useEffect, useState } from "react";

import { ShareImageSheet, type ShareSheetEvent } from "@/components/common/ShareImageSheet";
import { ui, UiCard, UiLinkButton } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { track, type AnalyticsEvent } from "@/lib/analytics";
import { pointsUnit } from "@/lib/points-unit";
import { cn } from "@/lib/utils";
import { fantasyNextAction, nextActionLabel } from "@/services/fantasy-next-action";
import type { GameweekRecap } from "@/services/gameweek-recap";
import type { Gameweek } from "@/types/domain";
import { publicRecapPath } from "@/lib/public-recap";
import { renderRecapImage } from "./recap-image";
import { RecapPublication } from "./RecapPublication";

/** Isolates a run (a name, a figure) so an Arabic line keeps its order. */
const iso = (value: string) => `⁨${value}⁩`;
/**
 * A left-to-right run: a sum ("8 × 2 = 16") or a signed figure ("−4"), whose
 * order and sign must not turn round inside an Arabic line.
 */
const ltr = (value: string) => `\u2066${value}\u2069`;

const SHARE_EVENTS: Record<ShareSheetEvent, AnalyticsEvent> = {
  preview: "fantasy_recap_share_preview",
  download: "fantasy_recap_share_download",
  native: "fantasy_recap_share_native",
  whatsapp: "fantasy_recap_share_whatsapp",
  copy: "fantasy_recap_share_copy",
};

/**
 * "Ma journée BotolaGO" — the top of the points screen for a finalized
 * gameweek (`buildGameweekRecap`): the team, the final total, the captain's
 * counted points, the transfer cost and one factual line, then the way to the
 * full breakdown below, the manager's next action, and an optional picture to
 * share.
 *
 * Private: it is shown to the team's own manager only. The shared link leads
 * to BotolaGO's Fantasy page, not to a public copy of this recap, and the
 * message says so. Sharing unlocks nothing in the game.
 */
export function GameweekRecapCard({
  recap,
  nameOf,
  currentGameweek,
  onShowDetail,
  allowPublish = true,
}: {
  recap: GameweekRecap;
  /**
   * A player's display name, or null when the active player list no longer
   * carries them (a player made inactive after the gameweek). A line that
   * would need an unknown name is left out, never shown with an id.
   */
  nameOf: (playerId: string) => string | null;
  /** The season's current gameweek, for the next action. */
  currentGameweek: Gameweek | null;
  onShowDetail: () => void;
  /** Offer the public link (R4). Off in tests that render without a server. */
  allowPublish?: boolean;
}) {
  const { t, lang } = useI18n();
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR");
  const withUnit = (n: number) => `${nf.format(n)} ${pointsUnit(n, t)}`;

  useEffect(() => {
    track("fantasy_recap_view");
  }, [recap.gameweek]);

  const heading = `${t("fantasy.recap.gameweek").replace("{n}", nf.format(recap.gameweek))} · ${
    recap.corrected ? t("fantasy.recap.corrected") : t("fantasy.recap.final")
  }`;

  const lines: string[] = [];
  const captainName = recap.captain ? nameOf(recap.captain.playerId) : null;
  if (recap.captain && captainName) {
    const template = recap.captain.viceTookOver
      ? t("fantasy.recap.captain_vice")
      : t("fantasy.recap.captain");
    const { points, multiplier, counted } = recap.captain;
    const formula = `${ltr(
      `${nf.format(points)} × ${nf.format(multiplier)} = ${nf.format(counted)}`,
    )} ${pointsUnit(counted, t)}`;
    lines.push(template.replace("{name}", iso(captainName)).replace("{formula}", formula));
  }
  if (recap.transferHit > 0) {
    lines.push(
      t("fantasy.recap.hit").replace(
        "{n}",
        `${ltr(`−${nf.format(recap.transferHit)}`)} ${pointsUnit(recap.transferHit, t)}`,
      ),
    );
  }
  const topName = recap.topContributor ? nameOf(recap.topContributor.playerId) : null;
  if (recap.topContributor && topName) {
    lines.push(
      t("fantasy.recap.top")
        .replace("{name}", iso(topName))
        .replace("{n}", iso(withUnit(recap.topContributor.counted))),
    );
  }

  const finalizedAt = recap.finalizedAt
    ? new Intl.DateTimeFormat(lang === "ar" ? "ar-MA" : "fr-FR", {
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(recap.finalizedAt))
    : null;

  const next = fantasyNextAction({
    availability: { kind: "ready", canCreate: false },
    hasTeam: true,
    gameweek: currentGameweek,
    now: Date.now(),
  });

  // Once the manager has made the recap public, sharing sends that page;
  // until then, the link is BotolaGO's Fantasy page and the message says so.
  const [publicId, setPublicId] = useState<string | null>(null);
  const message = (
    publicId ? t("fantasy.recap.public.share_message") : t("fantasy.recap.share_message")
  )
    .replace("{n}", iso(nf.format(recap.gameweek)))
    .replace("{points}", iso(withUnit(recap.total)));
  const sharePath = publicId
    ? `${publicRecapPath(publicId)}${lang === "ar" ? "?lang=ar" : ""}`
    : "/fantasy";

  return (
    <UiCard as="section" className="mx-[var(--ui-gutter)] mt-3" testId="gameweek-recap">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className={cn(ui.text.label, ui.tone.muted)}>{t("fantasy.recap.title")}</p>
          <h2 className={cn("mt-1", ui.text.bodyStrong, ui.tone.default)}>{heading}</h2>
          <p dir="auto" className={cn("truncate", ui.text.secondary, ui.tone.muted)}>
            {recap.teamName}
          </p>
        </div>
        <ShareImageSheet
          label={t("fantasy.recap.share")}
          campaign="fantasy_recap"
          testIdPrefix="recap"
          testId="gameweek-recap-share"
          aspect="post"
          fileName={`botolago-journee-${recap.gameweek}.png`}
          imageAlt={t("fantasy.recap.image_alt").replace("{n}", nf.format(recap.gameweek))}
          renderKey={`${recap.gameweek}:${recap.calculationVersion}:${lang}`}
          message={message}
          path={sharePath}
          onEvent={(event) => track(SHARE_EVENTS[event])}
          render={() =>
            renderRecapImage({
              lang,
              kicker: t("fantasy.recap.title"),
              heading,
              teamName: recap.teamName,
              total: nf.format(recap.total),
              unit: pointsUnit(recap.total, t),
              lines,
              footer: t("fantasy.recap.footer"),
            })
          }
        />
      </div>

      <p className="mt-3 flex items-baseline gap-1.5">
        <bdi className={cn(ui.score.lg, ui.tone.default)}>{nf.format(recap.total)}</bdi>
        <span className={cn(ui.text.label, ui.tone.muted)}>{pointsUnit(recap.total, t)}</span>
      </p>

      {lines.length > 0 ? (
        <ul className={cn("mt-3 grid gap-1.5", ui.text.secondary, ui.tone.default)}>
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
      {!recap.reconciled ? (
        <p className={cn("mt-3", ui.text.meta, ui.tone.muted)}>{t("fantasy.recap.unreconciled")}</p>
      ) : null}
      {recap.corrected ? (
        <p className={cn("mt-3", ui.text.meta, ui.tone.muted)}>
          {t("fantasy.recap.corrected_note")}
        </p>
      ) : null}
      {finalizedAt ? (
        <p className={cn("mt-2", ui.text.micro, ui.tone.muted)}>
          {t("fantasy.recap.finalized_at").replace("{date}", finalizedAt)}
        </p>
      ) : null}

      {allowPublish ? (
        <RecapPublication
          gameweek={recap.gameweek}
          defaultAlias={recap.teamName}
          onPublication={setPublicId}
        />
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onShowDetail}
          className={cn("underline underline-offset-4", ui.text.meta, ui.tone.default, ui.focus)}
        >
          {t("fantasy.recap.detail")}
        </button>
        {"to" in next && next.to !== "/fantasy/points" ? (
          <UiLinkButton to={next.to} size="sm" variant="gradient" className="ms-auto">
            {nextActionLabel(next.kind, t)}
          </UiLinkButton>
        ) : null}
      </div>
    </UiCard>
  );
}
