/**
 * The sponsor placements the demo pitches.
 *
 * They are built from the kit (card surface, label type, the club-edge rule
 * the product uses for a club's colour) so a partner's brand sits in the
 * product the way a club does, not as a banner ad pasted on top.
 */
import type { CSSProperties } from "react";
import { ArrowUpRight } from "lucide-react";
import { toast } from "sonner";

import { ui, UiIconButton } from "@/components/ui-kit";
import { inkOn } from "@/lib/kits";
import { cn } from "@/lib/utils";

import { useDemoCopy } from "../copy";
import { useDemo, type Sponsor } from "../state";
import { useDemoUi } from "../ui-state";

export function useSponsorName(sponsor: Sponsor): string {
  const copy = useDemoCopy();
  return sponsor.name.trim() || copy("sponsorPlaceholder");
}

function monogram(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "").slice(0, 2);
  return letters.toLocaleUpperCase();
}

/** A logo for places that need a URL (the prize card): the upload, or the monogram as SVG. */
export function sponsorLogoUrl(sponsor: Sponsor, name: string): string {
  if (sponsor.logo) return sponsor.logo;
  const ink = inkOn(sponsor.color);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="22" fill="${sponsor.color}"/><text x="48" y="50" dominant-baseline="central" text-anchor="middle" font-family="Changa, Manrope, sans-serif" font-weight="800" font-size="40" fill="${ink}">${escapeXml(monogram(name))}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function escapeXml(text: string): string {
  return text.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`);
}

export function SponsorLogo({
  sponsor,
  name,
  size = 40,
  className,
}: {
  sponsor: Sponsor;
  name: string;
  size?: number;
  className?: string;
}) {
  const box: CSSProperties = { width: size, height: size };
  if (sponsor.logo) {
    return (
      <span
        className={cn(
          "grid shrink-0 place-items-center overflow-hidden bg-white",
          ui.radius.control,
          className,
        )}
        style={box}
      >
        <img src={sponsor.logo} alt="" className="h-full w-full object-contain p-1" />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center",
        ui.radius.control,
        ui.font.display,
        className,
      )}
      style={{
        ...box,
        backgroundColor: sponsor.color,
        color: inkOn(sponsor.color),
        fontSize: size * 0.42,
        fontWeight: 800,
        lineHeight: 1,
      }}
    >
      {monogram(name)}
    </span>
  );
}

/** Marks sponsor placements while the presenter is on the sponsor step. */
function useHighlight() {
  const { highlightSponsor } = useDemoUi();
  return highlightSponsor ? "demo-sponsor-highlight" : undefined;
}

/**
 * "Journée 12 présentée par …": a slim band under the hub's gameweek band.
 */
export function SponsorStrip({ gameweek }: { gameweek: number }) {
  const { state } = useDemo();
  const copy = useDemoCopy();
  const name = useSponsorName(state.sponsor);
  return (
    <div
      data-sponsor-slot="gameweek"
      className={cn(
        "flex items-center justify-between gap-3 py-2",
        ui.space.gutter,
        ui.surface.bar,
        ui.rule.block,
        useHighlight(),
      )}
    >
      <p className={cn("min-w-0 truncate", ui.text.label, ui.tone.muted)}>
        {copy("gameweekPresentedBy", { n: gameweek })}
      </p>
      <span className="flex min-w-0 items-center gap-2">
        <SponsorLogo sponsor={state.sponsor} name={name} size={28} />
        <span className={cn("min-w-0 truncate", ui.display.headerSm, ui.tone.default)}>{name}</span>
      </span>
    </div>
  );
}

/**
 * "Classement présenté par …": a card above a list, in the partner's colour on
 * the start edge, with the partner's call to action.
 */
export function SponsorBanner({ title, pitch = false }: { title: string; pitch?: boolean }) {
  const { state } = useDemo();
  const copy = useDemoCopy();
  const name = useSponsorName(state.sponsor);
  return (
    <section
      data-sponsor-slot="banner"
      aria-label={`${title} ${name}`}
      className={cn(
        "flex items-center gap-3 py-3 pe-3 ps-3",
        ui.surface.card,
        ui.edge.start,
        useHighlight(),
      )}
      style={{ "--ui-club-edge": state.sponsor.color } as CSSProperties}
    >
      <SponsorLogo sponsor={state.sponsor} name={name} size={44} />
      <div className="min-w-0 flex-1">
        <p className={cn("truncate", ui.text.label, ui.tone.muted)}>{copy("sponsorKicker")}</p>
        <p className={cn("line-clamp-2 break-words", ui.text.bodyStrong, ui.tone.default)}>
          {title} <span className={cn(ui.font.display, ui.tone.ink)}>{name}</span>
        </p>
        {pitch ? (
          <p className={cn("line-clamp-2", ui.text.meta, ui.tone.muted)}>{copy("sponsorPitch")}</p>
        ) : null}
      </div>
      <UiIconButton
        aria-label={copy("sponsorCta")}
        title={copy("sponsorCta")}
        onClick={() => toast.message(name, { description: copy("sponsorPitch") })}
      >
        <ArrowUpRight className="rtl:-scale-x-100" aria-hidden />
      </UiIconButton>
    </section>
  );
}
