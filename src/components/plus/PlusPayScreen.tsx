import { useEffect, useRef, useState, type ReactNode } from "react";

import type { PremiumPrice } from "@/backend/premium/contracts";
import { copyText } from "@/lib/copy-text";
import { usePremiumPay } from "@/services/use-premium";

import { seasonPriceOf } from "./plus-pricing";
import { whatsappLink } from "./plus-pay";
import { usePlusCopy } from "./plus-copy";
import { Money } from "./plus-text";

const COPIED_MS = 2000;

/**
 * Screen 5, « Payer ma Saison »: how to pay by hand and where to send the receipt. The amount, the
 * reader's personal code (`BG-XXXXXX`, with a copy button; it goes first because it is what ties the
 * payment to the account), a bank transfer block (holder, bank, RIB with a copy button), a CashPlus /
 * Wafacash block (recipient) and one big button that opens WhatsApp with
 * the message already written, code included. Staff activate the Saison once the payment is checked.
 *
 * Every detail comes from the database (`api.get_premium_payment_details()`, typed in by the owner in
 * the admin screen); none is in code. Without them (or without a WhatsApp number) the screen says the
 * details are coming and shows no button.
 */
export function PlusPayScreen({
  prices,
  titleRef,
}: {
  prices: readonly PremiumPrice[];
  titleRef: React.Ref<HTMLHeadingElement>;
}) {
  const { t, text, lang } = usePlusCopy();
  const pay = usePremiumPay(true);
  const price = seasonPriceOf(prices);
  const { details, code } = pay;

  // Without the reader's code staff cannot tell whose payment a receipt is, so no code means no
  // button: the screen reads as « coming soon » until the code loads.
  const link =
    details.available && code
      ? whatsappLink(details.whatsapp, text("plus.pay.wa_message", { code }))
      : null;
  const ready = pay.ready;
  const showDetails = ready && details.available && link !== null;
  const hasBank = Boolean(details.bankHolder || details.bankName || details.rib);
  const note = lang === "ar" ? details.noteAr : details.noteFr;

  return (
    <>
      <div className="plus-body">
        <h1 className="plus-h" id="plus-s5-title" tabIndex={-1} ref={titleRef}>
          {t("plus.pay.title")}
        </h1>
        {!ready ? (
          <p className="plus-lede" role="status" data-testid="plus-pay-loading">
            {t("plus.pay.loading")}
          </p>
        ) : null}
        {ready && !showDetails ? (
          <div className="plus-panel plus-pay-soon" data-testid="plus-pay-soon">
            <p className="plus-pay-soon-t">{t("plus.pay.soon")}</p>
          </div>
        ) : null}
        {showDetails ? (
          <>
            <p className="plus-lede">{t("plus.pay.lede")}</p>
            <div className="plus-panel plus-pay-amount">
              <span className="plus-pay-label">{t("plus.pay.amount")}</span>
              <span className="plus-pay-value plus-pay-value--big">
                <Money amount={price.amountMad} />
              </span>
            </div>
            {code ? (
              <section
                className="plus-panel plus-pay-code"
                aria-labelledby="plus-pay-code-h"
                data-testid="plus-pay-code"
              >
                <h2 className="plus-h2" id="plus-pay-code-h">
                  {t("plus.pay.code_t")}
                </h2>
                <PayRow label="" value={code} mono copy big />
                <p className="plus-small">{t("plus.pay.code_d")}</p>
              </section>
            ) : null}
            {hasBank ? (
              <section className="plus-panel" aria-labelledby="plus-pay-bank-h">
                <h2 className="plus-h2" id="plus-pay-bank-h">
                  {t("plus.pay.bank_t")}
                </h2>
                {details.bankHolder ? (
                  <PayRow label={t("plus.pay.holder")} value={details.bankHolder} />
                ) : null}
                {details.bankName ? (
                  <PayRow label={t("plus.pay.bank")} value={details.bankName} />
                ) : null}
                {details.rib ? (
                  <PayRow label={t("plus.pay.rib")} value={details.rib} mono copy />
                ) : null}
              </section>
            ) : null}
            {details.cashplusName ? (
              <section className="plus-panel" aria-labelledby="plus-pay-cash-h">
                <h2 className="plus-h2" id="plus-pay-cash-h">
                  {t("plus.pay.cash_t")}
                </h2>
                <p className="plus-small">{t("plus.pay.cash_d")}</p>
                <PayRow label={t("plus.pay.recipient")} value={details.cashplusName} />
              </section>
            ) : null}
            {note ? <p className="plus-small plus-pay-note">{note}</p> : null}
          </>
        ) : null}
      </div>
      {showDetails && link ? (
        <div className="plus-foot">
          <a
            className="plus-btn plus-btn--primary"
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="plus-pay-whatsapp"
          >
            {t("plus.pay.wa_cta")}
          </a>
          <p className="plus-rule-line">{t("plus.pay.wa_hint")}</p>
        </div>
      ) : null}
    </>
  );
}

/** One labelled line, optionally with a button that copies its value. */
function PayRow({
  label,
  value,
  mono = false,
  copy = false,
  big = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  copy?: boolean;
  big?: boolean;
}): ReactNode {
  return (
    <div className="plus-pay-row">
      <div className="plus-pay-main">
        {label ? <span className="plus-pay-label">{label}</span> : null}
        <bdi
          dir={mono ? "ltr" : "auto"}
          className={`plus-pay-value${mono ? " plus-pay-value--mono" : ""}${big ? " plus-pay-value--big" : ""}`}
        >
          {value}
        </bdi>
      </div>
      {copy ? <CopyButton value={value} what={label || value} /> : null}
    </div>
  );
}

function CopyButton({ value, what }: { value: string; what: string }) {
  const { t, text } = usePlusCopy();
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const onCopy = async () => {
    if (!(await copyText(value))) return;
    setDone(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setDone(false), COPIED_MS);
  };
  return (
    <button
      type="button"
      className="plus-pay-copy"
      onClick={() => void onCopy()}
      aria-label={text("plus.pay.copy_aria", { what })}
      data-done={done}
    >
      <span aria-live="polite">{done ? t("plus.pay.copied") : t("plus.pay.copy")}</span>
    </button>
  );
}
