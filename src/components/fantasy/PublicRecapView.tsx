import { useEffect } from "react";

import { useAuth } from "@/auth/AuthProvider";
import type { FantasyPublicRecapDto } from "@/backend/fantasy/contracts";
import { ui, UiButton, UiCard, UiLinkButton } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { track } from "@/lib/analytics";
import { pointsUnit } from "@/lib/points-unit";
import { cn } from "@/lib/utils";
import { fantasyNextAction, nextActionLabel } from "@/services/fantasy-next-action";
import { useFantasyAvailability } from "@/services/use-fantasy-availability";

const iso = (value: string) => `⁨${value}⁩`;
const ltr = (value: string) => `⁦${value}⁩`;

/**
 * Fantasy R4 — the page a public recap link opens, readable before any login.
 *
 * It shows only what the server's public projection carries (the alias the
 * manager chose, the gameweek, the total, the captain line, the transfer cost
 * and the revision), then one way in: "Créer mon équipe" while a team can be
 * created, the player list otherwise, or the Fantasy home for someone already
 * signed in. An unknown, revoked or switched-off link shows one neutral
 * message that says nothing about why.
 */
export function PublicRecapView({
  recap,
  failed,
  onRetry,
}: {
  /** The projection; `null` when the link leads nowhere. */
  recap: FantasyPublicRecapDto | null;
  /** The read itself failed (not "no such recap"). */
  failed: boolean;
  onRetry: () => void;
}) {
  const { t, lang } = useI18n();
  const { status } = useAuth();
  const availability = useFantasyAvailability();
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR");

  useEffect(() => {
    if (recap) track("fantasy_recap_public_view");
  }, [recap]);

  // A visitor is offered the way in that is open right now; someone signed in
  // goes to their Fantasy home, which knows whether they have a team.
  const next =
    status === "authenticated"
      ? null
      : fantasyNextAction({ availability: availability.view, hasTeam: false, now: Date.now() });
  const cta =
    status === "authenticated" ? (
      <UiLinkButton to="/fantasy" variant="gradient" className="mt-3">
        {t("nav.fantasy")}
      </UiLinkButton>
    ) : next && "to" in next ? (
      <UiLinkButton
        to={next.to}
        variant="gradient"
        className="mt-3"
        onClick={() => track("fantasy_recap_public_cta")}
      >
        {nextActionLabel(next.kind, t)}
      </UiLinkButton>
    ) : null;

  return (
    <div className={cn("mx-auto grid w-full max-w-md gap-4 py-6", ui.space.gutter)}>
      {failed ? (
        <UiCard testId="public-recap-error">
          <p className={cn(ui.text.bodyStrong, ui.tone.default)}>{t("state.error")}</p>
          <UiButton variant="soft" size="sm" className="mt-3" onClick={onRetry}>
            {t("fantasy.next.retry")}
          </UiButton>
        </UiCard>
      ) : !recap ? (
        <UiCard testId="public-recap-unavailable">
          <h1 className={cn(ui.display.section, ui.tone.default)}>
            {t("fantasy.recap.page.unavailable_title")}
          </h1>
          <p className={cn("mt-2", ui.text.secondary, ui.tone.muted)}>
            {t("fantasy.recap.page.unavailable_body")}
          </p>
        </UiCard>
      ) : (
        <UiCard as="article" testId="public-recap">
          <p className={cn(ui.text.label, ui.tone.muted)}>
            {[t("fantasy.title"), recap.seasonName].filter(Boolean).join(" · ")}
          </p>
          <h1 className={cn("mt-1", ui.display.section, ui.tone.default)}>
            {t("fantasy.recap.gameweek").replace("{n}", nf.format(recap.gameweek))}
            {" · "}
            {recap.corrected ? t("fantasy.recap.corrected") : t("fantasy.recap.final")}
          </h1>
          <p dir="auto" className={cn("mt-1", ui.text.secondary, ui.tone.muted)}>
            {t("fantasy.recap.page.by").replace("{alias}", iso(recap.alias))}
          </p>
          <p className="mt-4 flex items-baseline gap-1.5">
            <bdi className={cn(ui.score.lg, ui.tone.default)}>{nf.format(recap.total)}</bdi>
            <span className={cn(ui.text.label, ui.tone.muted)}>{pointsUnit(recap.total, t)}</span>
          </p>
          {recap.reconciled && (recap.captain || recap.transferHit > 0) ? (
            <ul className={cn("mt-3 grid gap-1.5", ui.text.secondary, ui.tone.default)}>
              {recap.captain?.name ? (
                <li>
                  {t("fantasy.recap.captain")
                    .replace("{name}", iso(recap.captain.name))
                    .replace(
                      "{formula}",
                      `${ltr(
                        `${nf.format(recap.captain.points)} × ${nf.format(recap.captain.multiplier)} = ${nf.format(recap.captain.counted)}`,
                      )} ${pointsUnit(recap.captain.counted, t)}`,
                    )}
                </li>
              ) : null}
              {recap.transferHit > 0 ? (
                <li>
                  {t("fantasy.recap.hit").replace(
                    "{n}",
                    `${ltr(`−${nf.format(recap.transferHit)}`)} ${pointsUnit(recap.transferHit, t)}`,
                  )}
                </li>
              ) : null}
            </ul>
          ) : null}
          {recap.corrected ? (
            <p className={cn("mt-3", ui.text.meta, ui.tone.muted)}>
              {t("fantasy.recap.corrected_note")}
            </p>
          ) : null}
          <p className={cn("mt-2", ui.text.micro, ui.tone.muted)}>
            {t("fantasy.recap.page.revision")
              .replace("{v}", nf.format(recap.calculationVersion))
              .replace(
                "{date}",
                new Intl.DateTimeFormat(lang === "ar" ? "ar-MA" : "fr-FR", {
                  day: "numeric",
                  month: "long",
                  hour: "2-digit",
                  minute: "2-digit",
                }).format(new Date(recap.updatedAt)),
              )}
          </p>
          <p className={cn("mt-1", ui.text.micro, ui.tone.muted)}>{t("fantasy.recap.footer")}</p>
        </UiCard>
      )}

      <UiCard testId="public-recap-cta">
        <h2 className={cn(ui.text.bodyStrong, ui.tone.default)}>
          {t("fantasy.recap.page.cta_title")}
        </h2>
        <p className={cn("mt-1", ui.text.secondary, ui.tone.muted)}>
          {t("fantasy.recap.page.cta_body")}
        </p>
        {cta}
      </UiCard>
    </div>
  );
}
