import { Section } from "@/components/common/Section";
import { SectionHeader } from "@/components/common/SectionHeader";
import { ui, UiCard, UiLinkButton, UiSkeleton } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import { usePremium } from "@/services/use-premium";

import { PlusFeatureRows, PlusFormerStyleRow } from "./PlusMemberRows";
import { PlusTrophyVisibilityRow } from "./PlusTrophyVisibilityRow";
import { PlusLogo } from "./PlusLogo";
import { PLUS_NAME, usePlusCopy } from "./plus-copy";
import { DateText } from "./plus-text";

/** States of a former Saison holder: the Saison is over (or was taken back). */
const FORMER_STATES: readonly string[] = ["expired", "refunded", "revoked", "on_hold"];

/**
 * Profil › « Ma saison » (docs/product/botolago-plus-season-brief.md). For a Saison holder it is the
 * hub: « Votre Saison 2026/27 est active · jusqu'au {date} », then the ways on (the season, the
 * duels, the card's style). For anyone else it is the pitch and « Découvrir », or « Votre Saison est
 * terminée » with the way back to the offer once it is over. Nothing to cancel, restore or renew:
 * the Saison is paid once and ends with the Fantasy season. Old monthly and yearly states read as
 * the same « jusqu'au » line. The heading carries the logo (the product name is never typed).
 */
export function PlusProfileSection() {
  const premium = usePremium();
  const { t } = usePlusCopy();

  // Not shown (and no skeleton) until the feature is known to show for this reader: a preview
  // member is only discovered by the second answer, and everyone else never sees the heading.
  if (!premium.enabled) return null;

  const logo = <PlusLogo label={PLUS_NAME} height={24} className="plus-logo--heading" />;
  if (!premium.ready) {
    return (
      <Section>
        <SectionHeader title={logo} />
        <UiSkeleton className="h-24" testId="plus-profile-loading" />
        <span className="sr-only">{t("plus.profile.loading")}</span>
      </Section>
    );
  }

  if (premium.isMember) {
    return (
      <Section>
        <SectionHeader
          title={
            <span className="inline-flex items-center gap-2">
              {logo}
              <span>{t("plus.hub.title")}</span>
            </span>
          }
        />
        <MemberHub />
      </Section>
    );
  }
  return (
    <Section>
      <SectionHeader title={logo} />
      <FormerOrNever />
    </Section>
  );
}

function MemberHub() {
  const premium = usePremium();
  const { t, f } = usePlusCopy();
  const date = premium.periodEnd;
  return (
    <div className="flex flex-col gap-3" data-testid="plus-profile">
      <UiCard padding="none" className="overflow-hidden">
        <div className="flex flex-col gap-2 p-4">
          <p
            className={cn("text-pretty", ui.text.bodyStrong, ui.tone.default)}
            data-testid="plus-date-line"
          >
            {date
              ? f("plus.profile.active_line", { date: <DateText date={date} /> })
              : t("plus.profile.active_nodate")}
          </p>
          <p className={cn("text-pretty", ui.text.meta, ui.tone.muted)}>
            {t("plus.hub.active_note")}
          </p>
        </div>
      </UiCard>

      <UiCard padding="none" className="overflow-hidden">
        <PlusFeatureRows withSeason />
        <PlusTrophyVisibilityRow ruled />
      </UiCard>
    </div>
  );
}

/** No Saison yet, or no longer: the pitch (or the end of the last one) and the way to the offer. */
function FormerOrNever() {
  const premium = usePremium();
  const { t, f } = usePlusCopy();
  const former = FORMER_STATES.includes(premium.state);
  const ended = premium.state === "expired";
  return (
    <div className="flex flex-col gap-3" data-testid="plus-profile">
      <UiCard padding="none" className="overflow-hidden">
        <div className="flex flex-col gap-3 p-4">
          {ended ? (
            <p className={cn("text-pretty", ui.text.bodyStrong, ui.tone.default)}>
              {t("plus.profile.ended")}
            </p>
          ) : null}
          <p className={cn("text-pretty", ui.text.body, ui.tone.default)}>
            {ended
              ? premium.periodEnd
                ? f("plus.hub.expired_line", { date: <DateText date={premium.periodEnd} /> })
                : t("plus.hub.expired_nodate")
              : t("plus.profile.intro")}
          </p>
          <UiLinkButton to="/curva/plus" search={{ step: 3 }}>
            {ended ? t("plus.profile.offer_link") : t("plus.profile.discover")}
          </UiLinkButton>
        </div>
      </UiCard>
      {former ? <PlusFormerStyleRow /> : null}
    </div>
  );
}
