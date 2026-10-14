import { Link } from "@tanstack/react-router";
import { BarChart3, ChevronRight, Sparkles, Swords } from "lucide-react";
import type { ReactNode } from "react";

import { SectionHeader } from "@/components/common/SectionHeader";
import { ui, UiCard } from "@/components/ui-kit";
import type { TranslationKey } from "@/i18n/dictionaries";
import { cn } from "@/lib/utils";

import { PlusLockChip } from "./PlusLockChip";
import { usePlusLocksVisible } from "./use-plus-locks";
import { usePlusCopy } from "./plus-copy";

/**
 * Premium entry points in Curva. Each is a row that says what the extra is and carries the lock
 * chip; a tap opens the offer (the editions at screen 1, the other two at the paywall). Nothing
 * renders while the build switch is off, the (mocked) status is off, or the reader already is a
 * member: for a member these rows will become the real features (TODO lane E: the edition picker;
 * TODO lane C: the career detail and the detailed duel), not offers.
 */
export type PlusEntryKind = "editions" | "career" | "duels";

const ENTRIES: Record<PlusEntryKind, { icon: ReactNode; step: 1 | 3 }> = {
  editions: { icon: <Sparkles aria-hidden />, step: 1 },
  career: { icon: <BarChart3 aria-hidden />, step: 3 },
  duels: { icon: <Swords aria-hidden />, step: 3 },
};

/** The entry's title and one line, from literal keys (the i18n gate reads them). */
function entryCopy(
  t: (key: TranslationKey) => string,
  kind: PlusEntryKind,
): { title: string; body: string } {
  switch (kind) {
    case "editions":
      return { title: t("plus.s3.f1.t"), body: t("plus.s3.f1.d") };
    case "career":
      return { title: t("plus.s3.f2.t"), body: t("plus.s3.f2.d") };
    case "duels":
      return { title: t("plus.s3.f3.t"), body: t("plus.s3.f3.d") };
  }
}

export function PlusEntryRow({ kind, ruled = false }: { kind: PlusEntryKind; ruled?: boolean }) {
  const { t } = usePlusCopy();
  const entry = ENTRIES[kind];
  const copy = entryCopy(t, kind);
  return (
    <Link
      to="/curva/plus"
      search={{ step: entry.step }}
      data-testid={`plus-entry-${kind}`}
      className={cn(
        "flex w-full items-center gap-3 px-4 py-3 text-start",
        ui.space.row,
        ruled && ui.rule.blockStart,
        "transition-colors hover:bg-[color:var(--ui-surface-sunken)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--ui-ink-fg)]",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "grid h-9 w-9 shrink-0 place-items-center [&_svg]:h-4.5 [&_svg]:w-4.5",
          ui.radius.full,
          ui.surface.sunken,
          ui.tone.ink,
        )}
      >
        {entry.icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block text-pretty", ui.text.bodyStrong, ui.tone.default)}>
          {copy.title}
        </span>
        <span className={cn("mt-0.5 block text-pretty", ui.text.meta, ui.tone.muted)}>
          {copy.body}
        </span>
        <PlusLockChip className="mt-1.5" />
      </span>
      <ChevronRight className={cn("h-4.5 w-4.5 shrink-0", ui.tone.muted)} aria-hidden />
    </Link>
  );
}

/** The « Avec <logo> » block of Curva's card page: the three extras, each with its lock. */
export function PlusEntryRows() {
  const visible = usePlusLocksVisible();
  const { f, logo } = usePlusCopy();
  if (!visible) return null;
  return (
    <section data-testid="plus-entries">
      <SectionHeader title={f("plus.with", { logo })} />
      <UiCard padding="none" className="overflow-hidden">
        <PlusEntryRow kind="editions" />
        <PlusEntryRow kind="career" ruled />
        <PlusEntryRow kind="duels" ruled />
      </UiCard>
    </section>
  );
}

/** One row, for the face-à-face sheet: the detailed duel is a member extra. */
export function PlusDuelEntry() {
  const visible = usePlusLocksVisible();
  if (!visible) return null;
  return (
    <UiCard padding="none" className="overflow-hidden">
      <PlusEntryRow kind="duels" />
    </UiCard>
  );
}
