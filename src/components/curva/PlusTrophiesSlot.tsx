import { PlusTrophiesSection } from "@/components/plus/PlusTrophiesSection";
import { usePlusAccess } from "@/components/plus/plus-access";
import { useI18n } from "@/i18n/provider";
import type { CardProfile, TierCode } from "@/components/manager-card/types";

/**
 * « Trophées » on Curva's card page (BotolaGO+). Decides what the reader sees and hands the section
 * who the cabinet belongs to, as the card above it already shows them:
 *   - feature off: null, before any hook that would ask for anything;
 *   - locked: the trophies they earned (free), the cabinet blurred, « Découvrir »;
 *   - member: the lit cabinet, the detail and the frames.
 */
export function PlusTrophiesSlot({ profile }: { profile: CardProfile }) {
  const access = usePlusAccess();
  const { t } = useI18n();
  if (access === "off") return null;
  const tierName = (tier: TierCode | null): string | null => {
    switch (tier) {
      case "homa":
        return t("card.tier.homa");
      case "stade":
        return t("card.tier.stade");
      case "pro":
        return t("card.tier.pro");
      case "champion":
        return t("card.tier.champion");
      case "legend":
        return t("card.tier.legend");
      default:
        return null;
    }
  };
  return (
    <PlusTrophiesSection
      access={access}
      identity={{
        name: profile.name,
        club: profile.club?.initials ?? null,
        ovr: profile.ovr,
        tier: tierName(profile.tier),
      }}
    />
  );
}
