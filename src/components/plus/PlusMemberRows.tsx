import { Link } from "@tanstack/react-router";
import { BarChart3, CalendarCheck, ChevronRight, Sparkles, Swords } from "lucide-react";
import { useState, type ReactNode } from "react";

import { SectionHeader } from "@/components/common/SectionHeader";
import { ui, UiCard } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

import { PlusLogo } from "./PlusLogo";
import { PlusStylePicker } from "./PlusStylePicker";
import { editionLabel, editionOf } from "./plus-card-style";
import { usePlusMemberCard } from "./use-plus-member-card";
import { usePlusAccess } from "./plus-access";
import { formatPlusDate, PLUS_NAME, usePlusCopy } from "./plus-copy";
import { usePremium } from "@/services/use-premium";

const ROW_CLASS = cn(
  "flex w-full items-center gap-3 px-4 py-3 text-start",
  ui.space.row,
  "transition-colors hover:bg-[color:var(--ui-surface-sunken)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--ui-ink-fg)]",
);

/** One row of « Ma saison »: an icon, a title, one line, a chevron. A link, or a button. */
export function PlusHubRow({
  icon,
  title,
  body,
  ruled = false,
  to,
  search,
  hash,
  onClick,
  testId,
  expanded,
}: {
  icon: ReactNode;
  title: ReactNode;
  body?: ReactNode;
  ruled?: boolean;
  to?: string;
  search?: Record<string, unknown>;
  hash?: string;
  onClick?: () => void;
  testId?: string;
  expanded?: boolean;
}) {
  const inner = (
    <>
      <span
        aria-hidden
        className={cn(
          "grid h-9 w-9 shrink-0 place-items-center [&_svg]:h-4.5 [&_svg]:w-4.5",
          ui.radius.full,
          ui.surface.sunken,
          ui.tone.ink,
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block text-pretty", ui.text.bodyStrong, ui.tone.default)}>
          {title}
        </span>
        {body ? (
          <span className={cn("mt-0.5 block text-pretty", ui.text.meta, ui.tone.muted)}>
            {body}
          </span>
        ) : null}
      </span>
      <ChevronRight
        className={cn("h-4.5 w-4.5 shrink-0", ui.tone.muted, expanded && "rotate-90")}
        aria-hidden
      />
    </>
  );
  const className = cn(ROW_CLASS, ruled && ui.rule.blockStart);
  if (to) {
    return (
      <Link to={to} search={search} hash={hash} className={className} data-testid={testId}>
        {inner}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={className}
      data-testid={testId}
      aria-expanded={expanded}
    >
      {inner}
    </button>
  );
}

/**
 * « Style de la carte »: a row that opens the picker. `onlyStandard` is for a former member: the
 * paid styles are not offered, only the way back to the standard card.
 */
export function PlusStyleRow({
  ruled = false,
  onlyStandard = false,
}: {
  ruled?: boolean;
  onlyStandard?: boolean;
}) {
  const { t, text } = usePlusCopy();
  const profile = usePlusMemberCard();
  const [open, setOpen] = useState(false);
  if (!profile) return null;
  return (
    <>
      <PlusHubRow
        icon={<Sparkles aria-hidden />}
        title={t("plus.hub.style_t")}
        body={text("plus.hub.style_d", { style: editionLabel(t, editionOf(profile)) })}
        ruled={ruled}
        onClick={() => setOpen(true)}
        testId="plus-hub-style"
      />
      <PlusStylePicker
        open={open}
        onOpenChange={setOpen}
        profile={profile}
        onlyStandard={onlyStandard}
      />
    </>
  );
}

/**
 * A former member whose card still wears a paid style: the way back to Standard, which
 * `api.choose_card_design` allows without a membership. Nothing when the card is already standard
 * (or there is no card).
 */
export function PlusFormerStyleRow() {
  const profile = usePlusMemberCard();
  if (!profile || editionOf(profile) === "standard") return null;
  return (
    <UiCard padding="none" className="overflow-hidden" testId="plus-former-style">
      <PlusStyleRow onlyStandard />
    </UiCard>
  );
}

/** The rows that open the member's features: the season, the duels and the card's style. */
export function PlusFeatureRows({ withSeason }: { withSeason: boolean }) {
  const { t } = usePlusCopy();
  const profile = usePlusMemberCard();
  return (
    <>
      {withSeason ? (
        <PlusHubRow
          icon={<BarChart3 aria-hidden />}
          title={t("plus.hub.season_t")}
          body={t("plus.hub.season_d")}
          to="/curva/carte"
          hash="votre-saison"
          testId="plus-hub-season"
        />
      ) : null}
      <PlusHubRow
        icon={<Swords aria-hidden />}
        title={t("plus.hub.duels_t")}
        body={t("plus.hub.duels_d")}
        ruled={withSeason}
        to="/curva/les-votres"
        testId="plus-hub-duels"
      />
      {profile ? <PlusStyleRow ruled /> : null}
    </>
  );
}

/**
 * « Ma saison » on Curva's card page, for a member: the card's style, the duels, and the way
 * to the hub in Profil. Nothing for anyone else (the locked rows are `PlusEntryRows`).
 */
export function PlusMemberRows() {
  const access = usePlusAccess();
  const premium = usePremium();
  const { t, text, lang } = usePlusCopy();
  if (access !== "member") return null;
  return (
    <section data-testid="plus-member-rows">
      <SectionHeader
        title={
          <span className="inline-flex items-center gap-2">
            <PlusLogo label={PLUS_NAME} height={20} className="plus-logo--heading" />
            <span>{t("plus.hub.title")}</span>
          </span>
        }
      />
      <UiCard padding="none" className="overflow-hidden">
        <PlusFeatureRows withSeason={false} />
        <PlusHubRow
          icon={<CalendarCheck aria-hidden />}
          title={t("plus.hub.status_t")}
          body={
            premium.periodEnd
              ? text("plus.hub.status_d", { date: formatPlusDate(lang, premium.periodEnd) })
              : t("plus.hub.status_d_nodate")
          }
          ruled
          to="/profile"
          testId="plus-hub-status"
        />
      </UiCard>
    </section>
  );
}
