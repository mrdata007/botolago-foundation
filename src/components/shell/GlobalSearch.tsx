// The header search field on wide screens: type a club or a player, go there.
//
// The two lists load the first time the field is focused (the same queries
// the Clubs and Players pages use, so they are usually already cached), and
// the matching is done in the browser.

import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { useI18n } from "@/i18n/provider";
import {
  clampActiveIndex,
  committableEntry,
  highlightParts,
  moveActiveIndex,
  searchEntries,
  searchPanelState,
  type SearchEntry,
} from "@/lib/global-search";
import { ExitFade, ExitPresence } from "@/lib/motion-exit";
import { recallSearchQuery, rememberSearchQuery } from "@/lib/search-context";
import { cn } from "@/lib/utils";
import { fantasyService } from "@/services/fantasy-runtime";
import { footballService } from "@/services/football";
import { ui, UiButton } from "@/components/ui-kit";

export function GlobalSearch({
  className,
  autoFocus = false,
}: {
  className?: string;
  /** Focus the field as soon as it appears (the phone's search row). */
  autoFocus?: boolean;
}) {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const listId = useId();
  const [text, setText] = useState("");
  const [armed, setArmed] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeStored, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Back from a result this field was left through: the same query, with its
  // results showing. After mount rather than in the initial state, so a page
  // loaded cold (whose history entry may carry a query too) hydrates the
  // server's empty field.
  useEffect(() => {
    const remembered = recallSearchQuery();
    if (remembered === "") return;
    setText(remembered);
    setArmed(true);
    setOpen(true);
  }, []);

  // A restored list is open without the field being focused, so no blur will
  // close it: a press anywhere else does.
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  const clubsQ = useQuery({
    queryKey: ["football", "clubs", lang],
    queryFn: () => footballService.getClubs(lang),
    enabled: armed,
  });
  const playersQ = useQuery({
    queryKey: ["fantasy-players"],
    queryFn: () => fantasyService.getPlayers(),
    enabled: armed,
  });

  const entries = useMemo<SearchEntry[]>(() => {
    const clubs = clubsQ.data ?? [];
    const clubName = new Map(clubs.map((club) => [club.id, club.shortName[lang]]));
    return [
      ...clubs.map((club) => ({
        kind: "club" as const,
        id: club.id,
        label: club.name[lang],
        hint: club.city[lang],
      })),
      ...(playersQ.data ?? []).map((player) => ({
        kind: "player" as const,
        id: player.id,
        label: player.name[lang],
        hint: clubName.get(player.clubId) ?? "",
      })),
    ];
  }, [clubsQ.data, playersQ.data, lang]);

  const results = useMemo(() => searchEntries(entries, text), [entries, text]);
  const showPanel = open && text.trim() !== "";
  // The option the keyboard is on is always one of those shown (audit SOL-03),
  // and goes back to the first when the list changes under it.
  const active = clampActiveIndex(activeStored, results.length);
  const resultsKey = results.map((entry) => `${entry.kind}:${entry.id}`).join("|");
  useEffect(() => setActive(0), [resultsKey]);
  // A failed catalog is not "no result" (audit UX-007). A query that is off
  // (not armed yet) is not pending. Only a read that failed with nothing to
  // show counts: a list already loaded stays good if a later refresh fails.
  const panel = searchPanelState({
    resultCount: results.length,
    sources: [clubsQ, playersQ].map((query) => ({
      pending: armed && query.isPending && !query.isLoadingError,
      failed: query.isLoadingError,
    })),
  });
  const hasList = panel.kind === "results" || panel.kind === "loading" || panel.kind === "empty";
  // "none": no catalog could be read; "partial": at least one could not.
  const note =
    panel.kind === "unavailable"
      ? panel.coverage
      : panel.kind === "results" && panel.partial
        ? "partial"
        : null;
  const retryFailed = () => {
    if (clubsQ.isLoadingError) void clubsQ.refetch();
    if (playersQ.isLoadingError) void playersQ.refetch();
    // The button leaves with the note; the keyboard stays in the field.
    inputRef.current?.focus();
  };

  const go = (entry: SearchEntry) => {
    // Written to the entry being left, so Retour brings the query back.
    rememberSearchQuery(text);
    setOpen(false);
    setText("");
    if (entry.kind === "club")
      void navigate({ to: "/clubs/$clubId", params: { clubId: entry.id } });
    else void navigate({ to: "/fantasy/players/$playerId", params: { playerId: entry.id } });
  };

  return (
    <div
      ref={rootRef}
      className={cn("relative", className)}
      role="search"
      // Focus moving to the retry button inside the panel keeps it open;
      // leaving the search altogether closes it.
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <Search
        aria-hidden
        className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-[color:var(--ui-on-surface-muted)]"
      />
      <input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-expanded={showPanel}
        aria-controls={hasList ? listId : undefined}
        aria-autocomplete="list"
        aria-label={t("nav.search.label")}
        placeholder={t("nav.search.placeholder")}
        value={text}
        autoComplete="off"
        autoFocus={autoFocus}
        onFocus={() => {
          setArmed(true);
          setOpen(true);
        }}
        onChange={(event) => {
          setText(event.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActive(moveActiveIndex(active, "down", results.length));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive(moveActiveIndex(active, "up", results.length));
          } else if (event.key === "Enter") {
            // Only an option that is on screen: after Escape the list is shut.
            const entry = committableEntry(results, active, showPanel);
            if (!entry) return;
            event.preventDefault();
            go(entry);
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
        className={cn(
          "h-11 w-full ps-9 pe-3 bg-[color:var(--ui-surface-sunken)] text-[color:var(--ui-on-surface)]",
          "placeholder:text-[color:var(--ui-on-surface-muted)]",
          ui.radius.full,
          ui.text.meta,
          ui.focus,
        )}
      />
      <ExitPresence idleOnly>
        {showPanel ? (
          <ExitFade
            key="panel"
            className={cn(
              "absolute inset-x-0 top-full z-40 mt-2 max-h-80 overflow-auto p-1",
              "bg-[color:var(--ui-surface)] shadow-[var(--ui-shadow-column)]",
              "border border-[color:var(--ui-rule)]",
              ui.radius.card,
            )}
          >
            {hasList ? (
              <ul id={listId} role="listbox">
                {/* Rows that drop out while typing fade where they stand (out of
                the flow), so the ones that stay do not jump. */}
                <ExitPresence mode="popLayout" idleOnly>
                  {panel.kind === "loading" || panel.kind === "empty" ? (
                    <ExitFade
                      as="li"
                      key="empty"
                      className={cn("px-3 py-3", ui.text.meta, ui.tone.muted)}
                    >
                      {panel.kind === "loading" ? t("nav.search.loading") : t("nav.search.empty")}
                    </ExitFade>
                  ) : null}
                  {results.map((entry, index) => (
                    <ExitFade
                      as="li"
                      key={`${entry.kind}:${entry.id}`}
                      role="option"
                      aria-selected={index === active}
                      // mousedown, not click: the field's blur would close the
                      // list before a click lands.
                      onMouseDown={(event) => {
                        event.preventDefault();
                        go(entry);
                      }}
                      onMouseEnter={() => setActive(index)}
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
                          {highlightParts(entry.label, text).map((part, position) =>
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
                in it (a listbox holds options). mousedown is held back, like
                the options': the field's blur would otherwise close the panel
                first. */}
            {note ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                <p role="status" className={cn("min-w-0 flex-1", ui.text.meta, ui.tone.muted)}>
                  {note === "none" ? t("nav.search.unavailable") : t("nav.search.partial")}
                </p>
                <UiButton
                  variant="ghost"
                  size="sm"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={retryFailed}
                >
                  {t("state.retry")}
                </UiButton>
              </div>
            ) : null}
          </ExitFade>
        ) : null}
      </ExitPresence>
    </div>
  );
}
