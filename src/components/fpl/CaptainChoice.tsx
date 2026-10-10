import { Check, ChevronRight } from "lucide-react";
import { useId, useRef, useState } from "react";

import { JerseyVisual } from "@/components/fantasy/JerseyVisual";
import { ui, UiPlayerRow, UiSheet } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { getKitForClub } from "@/lib/kits";
import { cn } from "@/lib/utils";
import type { Club } from "@/types/domain";
import type { FantasyPlayer, Position } from "@/types/fantasy";
import { findClub } from "./club-lookup";

type Role = "captain" | "vice";

/**
 * The captain decision of a first squad, on the step before it is saved.
 *
 * The builder used to give the armband to the goalkeeper in slot 1 and the
 * vice-captain's to the next starter without asking, and the last step only
 * displayed them. The captain is the one decision that doubles points, so it
 * is now asked for: a heading that says why it matters, then one row per
 * armband ("À choisir" until chosen), each opening a sheet that lists the
 * eleven starters and nobody else — the server refuses a substitute
 * (`captain_not_in_xi`), so the list never offers one. The save button waits
 * for both (`validateDraft`). "Nommer capitaine" on the pitch still works and
 * fills the same rows.
 */
export function CaptainChoice({
  starters,
  clubs,
  captainId,
  viceId,
  onChoose,
}: {
  /** The eleven starters, in slot order. */
  starters: FantasyPlayer[];
  clubs: Club[];
  captainId: string | null;
  viceId: string | null;
  onChoose: (role: Role, playerId: string) => void;
}) {
  const { t, tr } = useI18n();
  const titleId = useId();
  const [open, setOpen] = useState<Role | null>(null);
  const triggers = useRef<Record<Role, HTMLButtonElement | null>>({ captain: null, vice: null });
  // The row the sheet was opened from, kept after the sheet closes.
  const lastRole = useRef<Role | null>(null);
  const holder = (role: Role) => {
    const id = role === "captain" ? captainId : viceId;
    return starters.find((player) => player.id === id) ?? null;
  };
  const positionLabel = (value: Position) =>
    value === "GK"
      ? t("player.pos.GK")
      : value === "DEF"
        ? t("player.pos.DEF")
        : value === "MID"
          ? t("player.pos.MID")
          : t("player.pos.FWD");

  const row = (role: Role) => {
    const player = holder(role);
    const label = role === "captain" ? t("fpl.captain") : t("fpl.vice_captain");
    const value = player ? tr(player.name) : t("fantasy.create.captain_pick");
    return (
      <button
        ref={(node) => {
          triggers.current[role] = node;
        }}
        type="button"
        aria-haspopup="dialog"
        aria-label={`${label} : ${value}`}
        onClick={() => {
          lastRole.current = role;
          setOpen(role);
        }}
        data-testid={`captain-choice-${role}`}
        className={cn(
          "flex w-full items-center gap-3 py-1.5 pe-1 text-start",
          ui.space.row,
          role === "captain" && ui.rule.block,
          "transition-colors hover:bg-[color:var(--ui-surface-sunken)] active:bg-[color:var(--ui-surface-sunken)]",
          ui.focus,
        )}
      >
        <RoleDisc role={role} />
        <span className="min-w-0 flex-1">
          <span className={cn("block", ui.text.meta, ui.tone.muted)}>{label}</span>
          <span
            className={cn(
              "block truncate",
              ui.text.bodyStrong,
              player ? ui.tone.default : ui.tone.ink,
            )}
          >
            {value}
          </span>
        </span>
        <ChevronRight className={cn("h-5 w-5 shrink-0", ui.tone.muted)} aria-hidden />
      </button>
    );
  };

  const sheetRole = open;
  const chosen = sheetRole ? holder(sheetRole) : null;
  const other = sheetRole ? holder(sheetRole === "captain" ? "vice" : "captain") : null;

  return (
    <section aria-labelledby={titleId} data-testid="captain-choice">
      <h2 id={titleId} className={cn("text-balance", ui.text.bodyStrong, ui.tone.default)}>
        {t("fantasy.create.captain_title")}
      </h2>
      <p className={cn("mt-1", ui.text.meta, ui.tone.muted)}>{t("fantasy.create.captain_hint")}</p>
      <div className="mt-1">
        {row("captain")}
        {row("vice")}
      </div>

      <UiSheet
        open={sheetRole !== null}
        onOpenChange={(next) => {
          if (!next) setOpen(null);
        }}
        // Back to the row that opened it, so a keyboard or screen-reader user
        // continues where they were.
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const role = lastRole.current;
          if (role) triggers.current[role]?.focus();
        }}
        title={
          sheetRole === "vice" ? t("fantasy.create.vice_sheet") : t("fantasy.create.captain_sheet")
        }
        description={t("fantasy.create.starters_hint")}
      >
        <ul>
          {starters.map((player) => {
            const club = findClub(clubs, player.clubId);
            const isChosen = chosen?.id === player.id;
            const isOther = other?.id === player.id;
            return (
              <li key={player.id}>
                <UiPlayerRow
                  name={tr(player.name)}
                  meta={[positionLabel(player.position), club ? tr(club.shortName) : null]
                    .filter(Boolean)
                    .join(" · ")}
                  visual={
                    <span
                      className={cn(
                        "grid h-10 w-10 place-items-center",
                        ui.radius.full,
                        ui.surface.sunken,
                      )}
                    >
                      <JerseyVisual
                        kit={getKitForClub(club, player.kitPattern)}
                        size={26}
                        variant="flat"
                        imageUrl={player.jerseyImageUrl}
                      />
                    </span>
                  }
                  selected={isChosen}
                  trailing={
                    isChosen ? (
                      <Check className={cn("h-5 w-5", ui.tone.ink)} aria-hidden />
                    ) : isOther ? (
                      // Who holds the other armband: choosing him moves it.
                      <RoleDisc role={sheetRole === "captain" ? "vice" : "captain"} small />
                    ) : null
                  }
                  onClick={() => {
                    if (sheetRole) onChoose(sheetRole, player.id);
                    setOpen(null);
                  }}
                />
              </li>
            );
          })}
        </ul>
      </UiSheet>
    </section>
  );
}

/** The armband as the pitch draws it: a navy "C", or the vice's ringed "V". */
function RoleDisc({ role, small = false }: { role: Role; small?: boolean }) {
  const { t } = useI18n();
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center",
        small ? "h-6 w-6" : "h-9 w-9",
        ui.radius.full,
        small ? ui.text.micro : ui.text.meta,
        "[font-weight:var(--ui-weight-heavy)]",
        role === "captain"
          ? ui.surface.inkPlain
          : cn("bg-[color:var(--ui-surface)] ring-2 ring-[color:var(--ui-ink-fg)]", ui.tone.ink),
      )}
    >
      {role === "captain" ? t("fantasy.captain") : t("fantasy.vice")}
    </span>
  );
}
