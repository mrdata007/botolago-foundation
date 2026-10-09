import { ClubCrest } from "@/components/common/ClubCrest";
import { useGradinsCopy } from "@/components/manager-card/copy";
import { ui } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

import { CAPTION_CLASS } from "./figures";
import type { Club } from "@/types/domain";

/**
 * « Essayer les couleurs d'un club »: the clubs of the Botola as 44px crest discs in a wrapping,
 * centred row (16 clubs make two rows of eight where the column is wide enough, seven and two
 * where it is not): none is ever cut at the inline edge, in either language, and nothing needs a
 * swipe to be found. A tap dresses the stage's card in that club's colours at once (no beat), and
 * nothing is stored: it is a preview, not a choice (the club is chosen in the profile). Plan 4.1.
 *
 * The row sits under the card it changes, so the change is seen where the tap is, rather than
 * after the proposition's buttons, where the card would be off the screen.
 */
export function ClubTryOn({
  clubs,
  selectedId,
  onPick,
}: {
  clubs: readonly Club[];
  selectedId: string | null;
  onPick: (club: Club) => void;
}) {
  const copy = useGradinsCopy();
  const { tr } = useI18n();
  if (clubs.length === 0) return null;
  return (
    <div data-testid="gradins-try-on">
      <p className={cn("px-4 text-center", CAPTION_CLASS)}>{copy.guestTryTitle}</p>
      <ul
        className={cn("mx-auto mt-2 flex max-w-[24rem] flex-wrap justify-center", ui.space.gutter)}
        aria-label={copy.guestTryTitle}
      >
        {clubs.map((club) => {
          const selected = club.id === selectedId;
          return (
            <li key={club.id} className="shrink-0">
              <button
                type="button"
                aria-pressed={selected}
                aria-label={tr(club.name)}
                onClick={() => onPick(club)}
                className={cn(
                  "press grid place-items-center",
                  ui.space.tap,
                  ui.radius.full,
                  ui.focus,
                  selected &&
                    "ring-2 ring-[color:var(--ui-ink-fg)] ring-offset-2 ring-offset-[color:var(--ui-page)]",
                )}
              >
                <ClubCrest club={club} size="md" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
