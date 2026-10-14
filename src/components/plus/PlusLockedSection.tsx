import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

import { PlusLockChip } from "./PlusLockChip";
import { SeasonProvider, EXAMPLE_VIEW } from "./plus-season-context";
import { usePlusCopy } from "./plus-copy";

import "./plus-embed.css";

/**
 * The layers of a locked preview: the EXAMPLE analysis underneath, blurred and inert, a dark veil
 * over it, and whatever invites the reader to unlock on top.
 *
 * Security: this is presentation, not protection. The content under the blur is always the example
 * season (`EXAMPLE_VIEW`), provided here explicitly so a surrounding provider can never put a
 * member's figures under it. A member's real figures are never rendered into a locked view.
 */
export function LockedStage({
  children,
  lock,
  compact = false,
  className,
}: {
  children: ReactNode;
  lock: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("pl-stage", compact && "pl-stage--compact", className)}>
      <div className="pl-under plus-body ps-body" aria-hidden="true" inert>
        <SeasonProvider view={EXAMPLE_VIEW}>{children}</SeasonProvider>
      </div>
      <div className="pl-veil" aria-hidden="true" />
      <div className="pl-lock">{lock}</div>
    </div>
  );
}

/** The dark, always-dark surface the in-app BotolaGO+ sections live on (the offer's tokens). */
export function PlusEmbed({
  children,
  className,
  ...rest
}: {
  children: ReactNode;
  className?: string;
  id?: string;
  "data-testid"?: string;
  "aria-labelledby"?: string;
  "aria-label"?: string;
}) {
  const { dir, lang } = useI18n();
  return (
    <section className={cn("plus-offer plus-embed", className)} dir={dir} lang={lang} {...rest}>
      {children}
    </section>
  );
}

/**
 * A section for members, shown to everyone else locked: a clear head (the reader's real figures,
 * from screens that already load them), then the example analysis blurred, a lock, one headline
 * that carries the context, and a mint « Débloquer » that opens the paywall (step 3 of the offer).
 * The offer closes back to this page, where the section is then open.
 */
export function PlusLockedSection({
  headline,
  head,
  children,
  id,
  testId,
}: {
  headline: string;
  /** Real figures the free screens already have: clear, above the blur. */
  head?: ReactNode;
  /** The analysis, drawn from the example (it is blurred and inert). */
  children: ReactNode;
  id?: string;
  testId: string;
}) {
  const { t } = usePlusCopy();
  const titleId = `${testId}-title`;
  return (
    <PlusEmbed id={id} data-testid={testId} aria-labelledby={titleId}>
      {head ? <div className="pl-head">{head}</div> : null}
      <LockedStage
        lock={
          <>
            <PlusLockChip />
            <h2 className="pl-headline" id={titleId}>
              {headline}
            </h2>
            <Link
              to="/curva/plus"
              search={{ step: 3 }}
              className="plus-btn plus-btn--primary pl-cta"
              data-testid={`${testId}-unlock`}
            >
              {t("plus.in.unlock")}
            </Link>
          </>
        }
      >
        {children}
      </LockedStage>
    </PlusEmbed>
  );
}
