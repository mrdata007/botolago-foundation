import { Check, ReceiptText, RotateCcw } from "lucide-react";
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

import { PlusLogo } from "./PlusLogo";
import { PlusRenewalReminder } from "./PlusRenewal";
import { formatPlusDate, PLUS_NAME, usePlusCopy } from "./plus-copy";
import { DateText, Money } from "./plus-text";
import { priceOf } from "./plus-pricing";

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
 * Profil › BotolaGO+ (docs/product/botolago-plus-screens-brief.md): the plan, its renewal or end
 * date, cancel, restore and the receipts, from the mocked `usePremium()`. The heading is the logo.
 * Cancelling as easy as subscribing: the button is on this screen and opens its consequences (the
 * same words as the terms), then asks once. Nothing is cancelled yet (« bientôt », lane F).
 */
export function PlusProfileSection() {
  const premium = usePremium();
  const { t, f, text, lang } = usePlusCopy();
  // Former members keep their receipts, so the list does not wait on a live membership.
  const receipts = usePremiumReceipts(premium.ready && premium.enabled);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Not shown (and no skeleton) until the feature is known to show for this reader: a preview
  // member is only discovered by the second answer, and everyone else never sees the heading.
  if (!premium.enabled) return null;

  const heading = <PlusLogo label={PLUS_NAME} height={24} className="plus-logo--heading" />;
  if (!premium.ready) {
    return (
      <Section>
        <SectionHeader title={heading} />
        <UiSkeleton className="h-24" testId="plus-profile-loading" />
        <span className="sr-only">{t("plus.profile.loading")}</span>
      </Section>
    );
  }

  const monthly = premium.productCode === "plus_monthly";
  const yearly = premium.productCode === "plus_yearly";
  const showsPlan = premium.isMember && (monthly || yearly);
  const price = priceOf(monthly ? "plus_monthly" : "plus_yearly", premium.prices);
  const status = statusText(t, premium.state);
  const canCancel = premium.state === "active" && monthly && !premium.cancelling;

  const onCancel = async () => {
    const result = await premium.cancel();
    setConfirmOpen(false);
    if (result.status !== "ok") toast.info(t("plus.profile.cancel_soon"));
  };
  const onRestore = async () => {
    const result = await premium.restore();
    if (result.status !== "ok") toast.info(t("plus.s3.restore_soon"));
  };

  const dateLine = (() => {
    if (!premium.periodEnd) return null;
    if (premium.state === "active")
      return f(monthly ? "plus.profile.renews" : "plus.profile.until", {
        date: <DateText date={premium.periodEnd} />,
      });
    if (premium.state === "cancelling")
      return f("plus.profile.ends", { date: <DateText date={premium.periodEnd} /> });
    return null;
  })();

  return (
    <Section>
      <SectionHeader title={heading} />
      <div className="flex flex-col gap-3" data-testid="plus-profile">
        <PlusRenewalReminder />
        <UiCard padding="none" className="overflow-hidden">
          {showsPlan ? (
            <>
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
                <UiKeyValueRow label={t("plus.profile.status")} value={<span>{status}</span>} />
              </div>
              {dateLine ? (
                <p className={cn("px-4 py-3 text-pretty", ui.text.body, ui.tone.default)}>
                  {dateLine}
                </p>
              ) : null}
            </>
          ) : (
            <div className="flex flex-col gap-3 p-4">
              <p className={cn("text-pretty", ui.text.body, ui.tone.default)}>
                {t("plus.profile.intro")}
              </p>
              {premium.state === "expired" ? (
                <p className={cn("text-pretty", ui.text.meta, ui.tone.muted)}>{status}</p>
              ) : null}
              <UiLinkButton to="/curva/plus" search={{ step: 3 }}>
                {premium.state === "expired"
                  ? t("plus.profile.resume")
                  : t("plus.profile.discover")}
              </UiLinkButton>
            </div>
          )}
          {premium.isMember && yearly ? (
            <p className={cn("px-4 pb-3 text-pretty", ui.text.meta, ui.tone.muted)}>
              {t("plus.terms.yearly2")}
            </p>
          ) : null}
          {canCancel ? (
            <div className={cn("p-4", ui.rule.blockStart)}>
              <UiButton variant="outline" className="w-full" onClick={() => setConfirmOpen(true)}>
                {t("plus.profile.cancel")}
              </UiButton>
            </div>
          ) : null}
        </UiCard>

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

        <div>
          <h3 className={cn("mb-2 flex items-center gap-2", ui.text.bodyStrong, ui.tone.default)}>
            <ReceiptText className="h-4.5 w-4.5" aria-hidden />
            {t("plus.profile.receipts")}
          </h3>
          {receipts.length === 0 ? (
            <p className={cn("text-pretty", ui.text.meta, ui.tone.muted)}>
              {t("plus.profile.receipts_empty")}
            </p>
          ) : (
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
                      <bdi suppressHydrationWarning>
                        {formatPlusDate(lang, new Date(receipt.paidAt))}
                      </bdi>
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
          )}
        </div>
      </div>

      <UiModal
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t("plus.profile.cancel_title")}
        description={
          premium.periodEnd
            ? `${text("plus.terms.monthly2", { date: formatPlusDate(lang, premium.periodEnd) })} ${t("plus.terms.keep")}`
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
    </Section>
  );
}
