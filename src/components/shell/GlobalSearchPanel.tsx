// What the header search's dropdown holds: the listbox of options, the line
// that says "searching" or "no result", and the failed-catalog note with its
// retry. Presentational, so the combobox wiring (ids, selection, roles) can be
// rendered and read without the field around it.

import { useI18n } from "@/i18n/provider";
import {
  highlightParts,
  searchOptionId,
  type SearchEntry,
  type SearchPanelState,
} from "@/lib/global-search";
import { ExitFade, ExitPresence } from "@/lib/motion-exit";
import { cn } from "@/lib/utils";
import { ui, UiButton } from "@/components/ui-kit";

export function GlobalSearchPanelBody({
  panel,
  results,
  active,
  listId,
  query,
  note,
  onPick,
  onHover,
  onRetry,
}: {
  panel: SearchPanelState;
  results: readonly SearchEntry[];
  /** The option the keyboard is on (-1 when none). */
  active: number;
  /** The listbox's id; each option's id is built from it. */
  listId: string;
  /** What was typed, for the highlight. */
  query: string;
  /** "none": no catalog could be read; "partial": at least one could not. */
  note: "none" | "partial" | null;
  onPick: (entry: SearchEntry) => void;
  onHover: (index: number) => void;
  onRetry: () => void;
}) {
  const { t } = useI18n();
  return (
    <>
      {/* The listbox holds options and nothing else: "searching" and "no
          result" are lines beside it, and with nothing to choose there is no
          listbox for the field to point at. */}
      {panel.kind === "loading" || panel.kind === "empty" ? (
        <p className={cn("px-3 py-3", ui.text.meta, ui.tone.muted)}>
          {panel.kind === "loading" ? t("nav.search.loading") : t("nav.search.empty")}
        </p>
      ) : null}
      {results.length > 0 ? (
        <ul id={listId} role="listbox" aria-label={t("nav.search.label")}>
          {/* Rows that drop out while typing fade where they stand (out of
          the flow), so the ones that stay do not jump. */}
          <ExitPresence mode="popLayout" idleOnly>
            {results.map((entry, index) => (
              <ExitFade
                as="li"
                key={`${entry.kind}:${entry.id}`}
                // Stable per option: the field's aria-activedescendant names it.
                id={searchOptionId(listId, entry)}
                role="option"
                aria-selected={index === active}
                // mousedown, not click: the field's blur would close the
                // list before a click lands.
                onMouseDown={(event) => {
                  event.preventDefault();
                  onPick(entry);
                }}
                onMouseEnter={() => onHover(index)}
              >
                <div
                  className={cn(
                    // The name first, on its own lines, and what it is under it:
                    // beside the name, the metadata took the width and the
                    // player's name was the part that got cut.
                    "flex min-h-11 cursor-pointer flex-col justify-center gap-0.5 px-3 py-2",
                    ui.radius.control,
                    ui.text.meta,
                    index === active && "bg-[color:var(--ui-surface-sunken)]",
                  )}
                >
                  <span className="min-w-0 break-words [font-weight:var(--ui-weight-heavy)]">
                    {highlightParts(entry.label, query).map((part, position) =>
                      part.match ? (
                        <mark
                          key={position}
                          className="rounded-[2px] bg-[color:color-mix(in_oklab,var(--ui-accent-spring)_50%,transparent)] text-inherit"
                        >
                          {part.text}
                        </mark>
                      ) : (
                        <span key={position}>{part.text}</span>
                      ),
                    )}
                  </span>
                  <span className={cn("min-w-0 break-words", ui.text.micro, ui.tone.muted)}>
                    {entry.hint ? `${entry.hint} · ` : ""}
                    {entry.kind === "club" ? t("nav.search.club") : t("nav.search.player")}
                  </span>
                </div>
              </ExitFade>
            ))}
          </ExitPresence>
        </ul>
      ) : null}
      {/* A failed catalog and the way to ask again: beside the list, not
          in it (a listbox holds options). It is not a live region: the
          search's own one says it (an element that appears already filled is
          often not read, and it would be read twice). mousedown is held back, like
          the options': the field's blur would otherwise close the panel
          first. */}
      {note ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
          <p className={cn("min-w-0 flex-1", ui.text.meta, ui.tone.muted)}>
            {note === "none" ? t("nav.search.unavailable") : t("nav.search.partial")}
          </p>
          <UiButton
            variant="ghost"
            size="sm"
            onMouseDown={(event) => event.preventDefault()}
            onClick={onRetry}
          >
            {t("state.retry")}
          </UiButton>
        </div>
      ) : null}
    </>
  );
}
