import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useId, type ReactNode } from "react";

import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

import { PlusLockChip } from "./PlusLockChip";
import { PLUS_SHAPE } from "./PlusLogo";
import { SeasonProvider, EXAMPLE_VIEW } from "./plus-season-context";
import type { PlusContext } from "./plus-steps";
import { usePlusCopy } from "./plus-copy";

import "./plus-embed.css";

/**
 * The big mint « + » that glows through the blur, like a floodlight (the logo's own shape). Pure
 * decoration: hidden from readers, drawn twice (a wide halo and a tighter core), breathing under
 * `prefers-reduced-motion: no-preference` only.
 */
function PlusGlow() {
  const id = `plusglow${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <div className="pl-plus" aria-hidden="true">
      {["pl-plus__halo", "pl-plus__core"].map((cls) => (
        <svg key={cls} className={cls} viewBox="1620 60 250 220" focusable="false">
          {cls === "pl-plus__halo" ? (
            <defs>
              <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#d6ffe6" />
                <stop offset="0.5" stopColor="#5cf0a0" />
                <stop offset="1" stopColor="#22b868" />
              </linearGradient>
            </defs>
          ) : null}
          <path d={PLUS_SHAPE} fill={`url(#${id})`} />
        </svg>
      ))}
    </div>
  );
}

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
      <PlusGlow />
      <div className="pl-veil" aria-hidden="true" />
      <div className="pl-lock">{lock}</div>
    </div>
  );
}

/**
 * The dark, always-dark surface the in-app BotolaGO+ sections live on (the offer's tokens).
 * `plus-embed--night` is the « Nuit de match » look of the locked sections.
 */
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
 * that carries the context, and a mint « Découvrir » that opens the short paywall (`/curva/plus`,
 * with `via` saying which section the reader came from). The offer closes back to this page, where
 * the section is then open.
 */
export function PlusLockedSection({
  headline,
  head,
  children,
  id,
  testId,
  via = "season",
  onOpen,
}: {
  headline: string;
  /** Real figures the free screens already have: clear, above the blur. */
  head?: ReactNode;
  /** The analysis, drawn from the example (it is blurred and inert). */
  children: ReactNode;
  id?: string;
  testId: string;
  /** Which section this is: the paywall's headline carries it. */
  via?: PlusContext;
  /** Runs when the reader leaves for the offer (the duel sheet notes itself here). */
  onOpen?: () => void;
}) {
  const { t } = usePlusCopy();
  const titleId = `${testId}-title`;
  return (
    <PlusEmbed id={id} className="plus-embed--night" data-testid={testId} aria-labelledby={titleId}>
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
              search={{ step: 3, via }}
              onClick={onOpen}
              className="plus-btn plus-btn--primary pl-cta"
              data-testid={`${testId}-unlock`}
            >
              {t("plus.in.unlock")}
              <ArrowRight aria-hidden />
            </Link>
          </>
        }
      >
        {children}
      </LockedStage>
    </PlusEmbed>
  );
}
