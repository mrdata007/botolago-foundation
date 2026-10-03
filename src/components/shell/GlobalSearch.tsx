// The header search field on wide screens: type a club or a player, go there.
//
// The two lists load the first time the field is focused (the same queries
// the Clubs and Players pages use, so they are usually already cached), and
// the matching is done in the browser.

import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useId, useMemo, useState } from "react";

import { useI18n } from "@/i18n/provider";
import { highlightParts, searchEntries, type SearchEntry } from "@/lib/global-search";
import { staggerStyle } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { fantasyService } from "@/services/fantasy-runtime";
import { footballService } from "@/services/football";
import { ui } from "@/components/ui-kit";

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
  const [active, setActive] = useState(0);

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
  const loading = armed && text.trim() !== "" && (clubsQ.isPending || playersQ.isPending);
  const showPanel = open && text.trim() !== "";

  const go = (entry: SearchEntry) => {
    setOpen(false);
    setText("");
    if (entry.kind === "club")
      void navigate({ to: "/clubs/$clubId", params: { clubId: entry.id } });
    else void navigate({ to: "/fantasy/players/$playerId", params: { playerId: entry.id } });
  };

  return (
    <div className={cn("relative", className)} role="search">
      <Search
        aria-hidden
        className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-[color:var(--ui-on-surface-muted)]"
      />
      <input
        type="search"
        role="combobox"
        aria-expanded={showPanel}
        aria-controls={listId}
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
        onBlur={() => setOpen(false)}
        onChange={(event) => {
          setText(event.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActive((i) => Math.min(i + 1, results.length - 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (event.key === "Enter" && results[active]) {
            event.preventDefault();
            go(results[active]);
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
      {showPanel ? (
        <ul
          id={listId}
          role="listbox"
          className={cn(
            "absolute inset-x-0 top-full z-40 mt-2 max-h-80 overflow-auto p-1",
            "bg-[color:var(--ui-surface)] shadow-[var(--ui-shadow-column)]",
            "border border-[color:var(--ui-rule)]",
            ui.radius.card,
          )}
        >
          {results.length === 0 ? (
            <li className={cn("px-3 py-3", ui.text.meta, ui.tone.muted)}>
              {loading ? t("nav.search.loading") : t("nav.search.empty")}
            </li>
          ) : (
            results.map((entry, index) => (
              <li
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
                style={staggerStyle(index)}
                className={cn(
                  "enter-rise stagger flex min-h-11 cursor-pointer items-center justify-between gap-3 px-3",
                  ui.radius.control,
                  ui.text.meta,
                  index === active && "bg-[color:var(--ui-surface-sunken)]",
                )}
              >
                <span className="min-w-0 truncate [font-weight:var(--ui-weight-heavy)]">
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
                <span className={cn("shrink-0", ui.tone.muted)}>
                  {entry.hint ? `${entry.hint} · ` : ""}
                  {entry.kind === "club" ? t("nav.search.club") : t("nav.search.player")}
                </span>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
