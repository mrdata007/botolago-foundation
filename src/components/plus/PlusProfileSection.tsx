import { Check, ReceiptText, RotateCcw, Settings2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Section } from "@/components/common/Section";
import { SectionHeader } from "@/components/common/SectionHeader";
import {
  ui,
  UiButton,
  UiCard,
  UiKeyValueRow,
  UiLinkButton,
  UiModal,
  UiSkeleton,
} from "@/components/ui-kit";
import type { TranslationKey } from "@/i18n/dictionaries";
import { cn } from "@/lib/utils";
import { usePremium, usePremiumReceipts } from "@/services/use-premium";

import { PlusFeatureRows, PlusHubRow } from "./PlusMemberRows";
import { PlusLogo } from "./PlusLogo";
import { formatPlusDate, PLUS_NAME, usePlusCopy } from "./plus-copy";
import { DateText, Money } from "./plus-text";
import { priceOf } from "./plus-pricing";
import type { PremiumReceipt } from "@/backend/premium/contracts";

function statusText(t: (key: TranslationKey) => string, state: string): string {
  switch (state) {
    case "active":
      return t("plus.profile.status_active");
    case "cancelling":
      return t("plus.profile.status_cancelling");
    case "grace":
      return t("plus.profile.status_grace");
    case "expired":
      return t("plus.profile.status_expired");
    default:
      return t("plus.profile.status_other");
  }
}

/**
 * Cancelling from the app is not open yet (the repository answers « soon »). Until it is, the
 * hub hides the button and says how it will work (`plus.hub.cancel_how`); flip this when
 * `premium.cancel()` answers `ok`.
 */
const CANCEL_IN_APP = false;

/** States of a former member: there may be a purchase to restore and receipts to keep. */
const FORMER_STATES: readonly string[] = ["expired", "refunded", "revoked", "on_hold"];

/**
 * Profil › « Mon abonnement » (docs/product/botolago-plus-member-side-brief.md). For a member it
 * is the hub: the plan, its state and date, then the ways on (the season, the duels, the card's
 * style, how to manage). For anyone else it is the pitch and « Découvrir », nothing more: no
 * receipts list when there are none, a restore row only for a former member. The heading carries
 * the logo (the product name is never typed).
 */
export function PlusProfileSection() {
  const premium = usePremium();
  const { t } = usePlusCopy();
  // Former members keep their receipts, so the list does not wait on a live membership.
  const receipts = usePremiumReceipts(premium.ready && premium.enabled);

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

  const monthly = premium.productCode === "plus_monthly";
  const yearly = premium.productCode === "plus_yearly";
  if (premium.isMember && (monthly || yearly)) {
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
        <MemberHub receipts={receipts} />
      </Section>
    );
  }
  return (
    <Section>
      <SectionHeader title={logo} />
      <FormerOrNever receipts={receipts} />
    </Section>
  );
}

function MemberHub({ receipts }: { receipts: readonly PremiumReceipt[] }) {
  const premium = usePremium();
  const { t, f, text, lang } = usePlusCopy();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);

  const monthly = premium.productCode === "plus_monthly";
  const price = priceOf(monthly ? "plus_monthly" : "plus_yearly", premium.prices);
  const state = premium.state;
  const date = premium.periodEnd;

  const dateLine = (() => {
    if (!date) return null;
    if (state === "active")
      return f(monthly ? "plus.profile.renews" : "plus.profile.until", {
        date: <DateText date={date} />,
      });
    if (state === "cancelling") return f("plus.profile.ends", { date: <DateText date={date} /> });
    if (state === "grace") return f("plus.hub.grace_line", { date: <DateText date={date} /> });
    return null;
  })();

  const onCancel = async () => {
    const result = await premium.cancel();
    setConfirmOpen(false);
    if (result.status !== "ok") toast.info(t("plus.profile.cancel_soon"));
  };
  const onKeep = () => {
    toast.info(
      date
        ? text("plus.hub.keep_soon", { date: formatPlusDate(lang, date) })
        : t("plus.profile.cancel_soon"),
    );
  };
  const onPay = () => toast.info(t("plus.hub.pay_soon"));

  return (
    <div className="flex flex-col gap-3" data-testid="plus-profile">
      <UiCard padding="none" className="overflow-hidden">
        <div className="px-4">
          <UiKeyValueRow
            label={t("plus.profile.plan")}
            value={
              <span>
                {monthly ? t("plus.monthly.name") : t("plus.yearly.name")}
                {" · "}
                <Money amount={price.amountMad} />
              </span>
            }
          />
          <UiKeyValueRow
            label={t("plus.profile.status")}
            value={<span>{statusText(t, state)}</span>}
          />
        </div>
        {dateLine ? (
          <p
            className={cn("px-4 py-3 text-pretty", ui.text.body, ui.tone.default)}
            data-testid="plus-date-line"
          >
            {dateLine}
          </p>
        ) : null}
        {state === "active" && !monthly ? (
          <p className={cn("px-4 pb-3 text-pretty", ui.text.meta, ui.tone.muted)}>
            {t("plus.terms.yearly2")}
          </p>
        ) : null}
        {state === "cancelling" ? (
          <div className={cn("p-4", ui.rule.blockStart)}>
            <UiButton className="w-full" onClick={onKeep} data-testid="plus-keep">
              {t("plus.profile.cancel_keep")}
            </UiButton>
          </div>
        ) : null}
        {state === "grace" ? (
          <div className={cn("p-4", ui.rule.blockStart)}>
            <UiButton className="w-full" onClick={onPay} data-testid="plus-pay-update">
              {t("plus.hub.pay_update")}
            </UiButton>
          </div>
        ) : null}
      </UiCard>

      <UiCard padding="none" className="overflow-hidden">
        <PlusFeatureRows withSeason />
        <PlusHubRow
          icon={<Settings2 aria-hidden />}
          title={t("plus.hub.manage_t")}
          body={t("plus.hub.manage_d")}
          ruled
          onClick={() => setManageOpen((open) => !open)}
          expanded={manageOpen}
          testId="plus-hub-manage"
        />
        {manageOpen ? (
          <div
            className={cn("flex flex-col gap-3 p-4", ui.rule.blockStart)}
            data-testid="plus-manage"
          >
            <p className={cn("text-pretty", ui.text.body, ui.tone.default)}>
              {monthly ? t("plus.hub.cancel_how") : t("plus.hub.yearly_how")}
            </p>
            {CANCEL_IN_APP && state === "active" && monthly && !premium.cancelling ? (
              <UiButton variant="outline" className="w-full" onClick={() => setConfirmOpen(true)}>
                {t("plus.profile.cancel")}
              </UiButton>
            ) : null}
            <Receipts receipts={receipts} />
          </div>
        ) : null}
      </UiCard>

      <UiModal
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t("plus.profile.cancel_title")}
        description={
          date
            ? `${text("plus.terms.monthly2", { date: formatPlusDate(lang, date) })} ${t("plus.terms.keep")}`
            : t("plus.terms.keep")
        }
        footer={
          <>
            <UiButton onClick={() => setConfirmOpen(false)}>
              <Check className="h-4 w-4" aria-hidden /> {t("plus.profile.cancel_keep")}
            </UiButton>
            <UiButton variant="destructive" onClick={() => void onCancel()}>
              {t("plus.profile.cancel_confirm")}
            </UiButton>
          </>
        }
      />
    </div>
  );
}

/** Never subscribed, or no longer: the pitch (or the end of the last one) and « Découvrir ». */
function FormerOrNever({ receipts }: { receipts: readonly PremiumReceipt[] }) {
  const premium = usePremium();
  const { t, f } = usePlusCopy();
  const former = FORMER_STATES.includes(premium.state);
  const onRestore = async () => {
    const result = await premium.restore();
    if (result.status !== "ok") toast.info(t("plus.s3.restore_soon"));
  };
  return (
    <div className="flex flex-col gap-3" data-testid="plus-profile">
      <UiCard padding="none" className="overflow-hidden">
        <div className="flex flex-col gap-3 p-4">
          <p className={cn("text-pretty", ui.text.body, ui.tone.default)}>
            {premium.state === "expired"
              ? premium.periodEnd
                ? f("plus.hub.expired_line", { date: <DateText date={premium.periodEnd} /> })
                : t("plus.hub.expired_nodate")
              : t("plus.profile.intro")}
          </p>
          <UiLinkButton to="/curva/plus" search={{ step: 3 }}>
            {t("plus.profile.discover")}
          </UiLinkButton>
        </div>
      </UiCard>
      {former ? (
        <UiCard padding="none" className="overflow-hidden">
          <button
            type="button"
            onClick={() => void onRestore()}
            className={cn(
              "flex w-full items-center gap-3 px-4 py-2 text-start",
              ui.space.row,
              "transition-colors hover:bg-[color:var(--ui-surface-sunken)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--ui-ink-fg)]",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "grid h-9 w-9 shrink-0 place-items-center",
                ui.radius.full,
                ui.surface.sunken,
                ui.tone.ink,
              )}
            >
              <RotateCcw className="h-4.5 w-4.5" />
            </span>
            <span className={cn("min-w-0 flex-1 text-pretty", ui.text.bodyStrong, ui.tone.default)}>
              {t("plus.profile.restore")}
            </span>
          </button>
        </UiCard>
      ) : null}
      <Receipts receipts={receipts} />
    </div>
  );
}

/** The payments, only when there are some. */
function Receipts({ receipts }: { receipts: readonly PremiumReceipt[] }) {
  const { t, lang } = usePlusCopy();
  if (receipts.length === 0) return null;
  return (
    <div>
      <h3 className={cn("mb-2 flex items-center gap-2", ui.text.bodyStrong, ui.tone.default)}>
        <ReceiptText className="h-4.5 w-4.5" aria-hidden />
        {t("plus.profile.receipts")}
      </h3>
      <UiCard padding="none" className="overflow-hidden">
        <ul>
          {receipts.map((receipt, index) => (
            <li
              key={receipt.id}
              className={cn(
                "flex items-center justify-between gap-3 px-4 py-3",
                index > 0 && ui.rule.blockStart,
              )}
            >
              <span className={cn(ui.text.body, ui.tone.default)}>
                <bdi suppressHydrationWarning>{formatPlusDate(lang, new Date(receipt.paidAt))}</bdi>
                {" · "}
                <Money amount={receipt.amountMad} />
              </span>
              {receipt.url ? (
                <a
                  href={receipt.url}
                  className={cn(
                    "min-h-11 inline-flex items-center",
                    ui.text.meta,
                    ui.tone.ink,
                    "underline",
                  )}
                >
                  {t("plus.profile.receipt_open")}
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      </UiCard>
    </div>
  );
}
