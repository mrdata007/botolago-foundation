import type { ReactNode } from "react";
import { AdminDatum } from "@/components/admin/AdminSurfaces";
import { ui, UiBadge } from "@/components/ui-kit";
import type { PreviewCategory } from "@/backend/football/identity/review-queue";
import { cn } from "@/lib/utils";
import type { PlayerMappingCopy } from "./copy";
import { formatUtc } from "./format";

/** A date-time in UTC, as LTR data so Arabic cannot reorder its parts. */
export function UtcDate({ iso }: { iso: string | null }) {
  return (
    <bdi dir="ltr" className="inline-block">
      {formatUtc(iso)}
    </bdi>
  );
}

export function ProviderBadge({
  provider,
  copy,
}: {
  provider: "sofascore" | "flashscore";
  copy: PlayerMappingCopy;
}) {
  return <UiBadge tone="outline">{copy.providers[provider]}</UiBadge>;
}

const SIGNAL_GLYPH = { match: "✓", conflict: "≠", no_signal: "–" } as const;

/**
 * One signal, always in words as well as colour: "✓ Concorde", "≠ Différent",
 * "– Sans signal". A conflict is amber (to look at), never red (nothing failed),
 * and a missing value is plain grey: it counts for nothing and against no one.
 */
export function SignalPill({
  kind,
  label,
  copy,
}: {
  kind: "match" | "conflict" | "no_signal";
  label: string;
  copy: PlayerMappingCopy;
}) {
  const word =
    kind === "match"
      ? copy.detail.match
      : kind === "conflict"
        ? copy.detail.conflict
        : copy.detail.noSignal;
  return (
    <UiBadge tone={kind === "match" ? "positive" : kind === "conflict" ? "caution" : "neutral"}>
      <span data-signal={kind}>
        <span aria-hidden>{SIGNAL_GLYPH[kind]} </span>
        {label} : {word}
      </span>
    </UiBadge>
  );
}

export function FlagBadges({
  flags,
  copy,
  testId,
}: {
  flags: readonly string[];
  copy: PlayerMappingCopy;
  testId?: string;
}) {
  if (flags.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label={copy.filters.flag} data-testid={testId}>
      {flags.map((flag) => (
        <li key={flag}>
          <UiBadge tone="caution">
            <span data-flag={flag} title={copy.flagHelp[flag]}>
              {copy.flags[flag] ?? flag}
            </span>
          </UiBadge>
        </li>
      ))}
    </ul>
  );
}

const PREVIEW_TONE = {
  A: "positive",
  B: "neutral",
  C: "outline",
  D: "caution",
} as const;

export function PreviewBadge({
  category,
  copy,
}: {
  category: PreviewCategory;
  copy: PlayerMappingCopy;
}) {
  return (
    <UiBadge tone={PREVIEW_TONE[category]}>
      <span data-preview={category} title={copy.detail.previewCategories[category]}>
        {copy.detail.previewCategories[category]}
      </span>
    </UiBadge>
  );
}

/** A label over a value, for a definition list. The value is plain text or a node. */
export function Fact({
  label,
  children,
  testId,
}: {
  label: string;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <div className="min-w-0" data-testid={testId}>
      <dt className={cn(ui.text.label, ui.tone.muted)}>{label}</dt>
      <dd className={cn("mt-0.5 min-w-0", ui.text.secondary, ui.tone.default)}>{children}</dd>
    </div>
  );
}

/** A person's or club's name: data, isolated so its direction cannot reorder the sentence around it. */
export function NameText({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <bdi dir="auto" className={cn("break-words", className)}>
      {children}
    </bdi>
  );
}

export { AdminDatum };
