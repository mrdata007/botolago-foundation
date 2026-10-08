import { RotateCcw } from "lucide-react";
import { useMemo } from "react";

import type { MyCardDto } from "@/backend/manager-card/contracts";
import { SectionHeader } from "@/components/common/SectionHeader";
import { useMomentCopy } from "@/components/manager-card/copy";
import { useCardStrings } from "@/components/manager-card/copy";
import { fill } from "@/components/manager-card/interpolate";
import { scopeSvgIds, newIdScope } from "@/components/manager-card/scope-ids";
import { useCardRenderer, useCardTheme } from "@/components/manager-card/use-card-renderer";
import type { CardProfile } from "@/components/manager-card/types";
import { ui, UiButton, UiCard } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

import { PersonName } from "./figures";
import { useBeatPlayback, useMotionAllowed } from "./use-replay-beat";

/** « 30 novembre 2026 »: a stored calendar date, written on its own day (no time zone shifts it). */
function cutoffText(date: string, lang: "fr" | "ar"): string {
  const parsed = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-MA-u-nu-latn" : "fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

/**
 * « Fondateur 2026 », for founders only (plan 4.8): the founder's cast-on drawn large (the part of
 * the card the renderer shows as its founder detail), what the mark is, the cut-off date when the
 * owner stored one, and a « Revoir » that knits the five cream rows again. Before the grant, and
 * for everyone not granted, there is no such block, no teaser and no « éligible ».
 */
export function FounderBlock({ card, profile }: { card: MyCardDto; profile: CardProfile }) {
  const { lang } = useI18n();
  const moments = useMomentCopy();
  const strings = useCardStrings();
  const renderer = useCardRenderer();
  const theme = useCardTheme();
  const { beat, play } = useBeatPlayback();
  const motion = useMotionAllowed();
  const scope = useMemo(() => newIdScope(), []);
  const html = useMemo(() => {
    const art = renderer?.detail(profile, "founder", { strings, theme, beat });
    return art ? scopeSvgIds(art, scope) : null;
  }, [renderer, profile, strings, theme, beat, scope]);
  if (!card.founder) return null;
  const name = card.name.trim().toLocaleUpperCase(lang === "ar" ? "ar" : "fr");
  return (
    <section data-testid="gradins-founder" aria-label={moments.m9.heading}>
      <SectionHeader title={moments.m9.heading} />
      <UiCard padding="md" className="flex flex-col gap-3">
        {html ? (
          <div
            className="mx-auto w-full max-w-[22rem]"
            data-founder-art=""
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : null}
        <p className={cn("text-pretty", ui.text.secondary, ui.tone.default)}>
          {fill(moments.m9.line, { name: <PersonName>{name}</PersonName> })}
        </p>
        {card.founder.cutoffDate ? (
          <p className={cn("text-pretty", ui.text.secondary, ui.tone.muted)}>
            {fill(moments.m9.cutoff, { date: cutoffText(card.founder.cutoffDate, lang) })}
          </p>
        ) : null}
        {motion && renderer?.beats.includes("founder") ? (
          <UiButton variant="soft" size="sm" className="self-start" onClick={() => play("founder")}>
            <RotateCcw className="h-4 w-4" aria-hidden />
            {moments.m4.sheetReplay}
          </UiButton>
        ) : null}
      </UiCard>
    </section>
  );
}
