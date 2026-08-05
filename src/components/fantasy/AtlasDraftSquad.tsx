import { Minus, Plus, Shield } from "lucide-react";
import type { ReactNode } from "react";

import { ClubCrest } from "@/components/common/ClubCrest";
import { Pitch } from "@/components/fantasy/Pitch";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import type { CreateTeamDraft, CreateSlot } from "@/services/fantasy-create-service";
import type { TranslationKey } from "@/i18n/dictionaries";
import type { Club } from "@/types/domain";
import type { FantasyPlayer, Position } from "@/types/fantasy";

export type AtlasSquadView = "pitch" | "list";

export function AtlasDraftSquad({
  draft,
  players,
  clubs,
  view,
  onSlot,
  onRemove,
  readOnly = false,
}: {
  draft: CreateTeamDraft;
  players: FantasyPlayer[];
  clubs: Club[];
  view: AtlasSquadView;
  onSlot?: (slot: number) => void;
  onRemove?: (slot: number) => void;
  readOnly?: boolean;
}) {
  const { t } = useI18n();
  const xi = draft.slots.filter((slot) => slot.slot <= 11);
  const bench = draft.slots.filter((slot) => slot.slot > 11);
  const render = (slot: CreateSlot) => (
    <AtlasSlot
      key={slot.slot}
      slot={slot}
      players={players}
      clubs={clubs}
      onOpen={onSlot}
      onRemove={onRemove}
      readOnly={readOnly}
    />
  );

  if (view === "list") {
    return (
      <div className="grid gap-4">
        <AtlasListGroup
          label={t("fantasy.atlas.create.squad.starting")}
          slots={xi}
          render={render}
        />
        <AtlasListGroup label={t("fantasy.bench")} slots={bench} render={render} />
      </div>
    );
  }

  const byPosition = (position: Position) =>
    xi.filter((slot) => slot.position === position).map(render);
  return (
    <Pitch
      gk={byPosition("GK")[0]}
      def={byPosition("DEF")}
      mid={byPosition("MID")}
      fwd={byPosition("FWD")}
      bench={bench.map(render)}
      benchLabel={t("fantasy.bench")}
    />
  );
}

function AtlasListGroup({
  label,
  slots,
  render,
}: {
  label: string;
  slots: CreateSlot[];
  render: (slot: CreateSlot) => ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-black/5 bg-white/80 p-3 shadow-sm">
      <h3 className="px-1 text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </h3>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">{slots.map(render)}</div>
    </section>
  );
}

function AtlasSlot({
  slot,
  players,
  clubs,
  onOpen,
  onRemove,
  readOnly,
}: {
  slot: CreateSlot;
  players: FantasyPlayer[];
  clubs: Club[];
  onOpen?: (slot: number) => void;
  onRemove?: (slot: number) => void;
  readOnly: boolean;
}) {
  const { t, tr, lang } = useI18n();
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR", {
    maximumFractionDigits: 1,
  });
  const player = players.find((candidate) => candidate.id === slot.playerId);
  const club = player ? clubs.find((candidate) => candidate.id === player.clubId) : null;
  const position = t(`player.pos.${slot.position}` as TranslationKey);
  if (!player) {
    return (
      <button
        type="button"
        data-atlas-slot={slot.slot}
        disabled={readOnly || !onOpen}
        onClick={() => onOpen?.(slot.slot)}
        aria-label={t("fantasy.create.add_slot").replace("{pos}", position)}
        className={cn(
          "group flex min-h-[76px] w-full flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed px-2 py-2 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
          readOnly
            ? "border-slate-300 bg-slate-100 text-slate-500"
            : "border-white/50 bg-white/10 text-white transition-colors hover:bg-white/20",
        )}
      >
        <span className="grid h-8 w-8 place-items-center rounded-full bg-white/10">
          <Plus className="h-4 w-4" aria-hidden />
        </span>
        <span className="text-[10px] font-black uppercase tracking-[0.14em]">{position}</span>
      </button>
    );
  }

  const label = `${tr(player.name)}, ${position}${slot.isCaptain ? `, ${t("fantasy.captain_full")}` : ""}${slot.isViceCaptain ? `, ${t("fantasy.vice_full")}` : ""}`;
  return (
    <div className={cn("relative min-w-0 rounded-2xl", readOnly && "bg-white/85 p-1")}>
      <button
        type="button"
        data-atlas-slot={slot.slot}
        disabled={!onOpen}
        onClick={() => onOpen?.(slot.slot)}
        aria-label={label}
        className={cn(
          "flex min-h-[76px] w-full min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-1 text-center focus-visible:outline-none focus-visible:ring-2",
          readOnly
            ? "text-slate-950 focus-visible:ring-blue-500"
            : "text-white transition-transform focus-visible:ring-white motion-safe:hover:-translate-y-0.5",
        )}
      >
        <span className="relative">
          {club ? (
            <ClubCrest club={club} size="md" className="h-10 w-10 rounded-full shadow-lg" />
          ) : (
            <span className="grid h-10 w-10 place-items-center rounded-full bg-slate-700 text-white">
              <Shield className="h-5 w-5" aria-hidden />
            </span>
          )}
          {slot.isCaptain && (
            <span className="absolute -end-2 -top-1 grid h-5 w-5 place-items-center rounded-full bg-blue-600 text-[9px] font-black text-white ring-2 ring-white">
              {t("fantasy.captain")}
            </span>
          )}
          {!slot.isCaptain && slot.isViceCaptain && (
            <span className="absolute -end-2 -top-1 grid h-5 w-5 place-items-center rounded-full bg-white text-[9px] font-black text-blue-700 ring-2 ring-blue-600">
              {t("fantasy.vice")}
            </span>
          )}
        </span>
        <span
          className={cn(
            "max-w-full truncate rounded-md px-2 py-0.5 text-[10px] font-black",
            readOnly ? "bg-slate-100 text-slate-950" : "bg-[#07182f]/85 text-white",
          )}
        >
          {tr(player.name).split(/\s+/).slice(-1)[0]}
        </span>
        <span
          className={cn("text-[9px] tabular-nums", readOnly ? "text-slate-500" : "text-white/70")}
        >
          {nf.format(player.price)}
        </span>
      </button>
      {!readOnly && onRemove && (
        <button
          type="button"
          onClick={() => onRemove(slot.slot)}
          aria-label={t("fantasy.create.remove_slot")}
          className="absolute -end-1 -top-1 grid h-7 w-7 place-items-center rounded-full bg-red-600 text-white shadow-md ring-2 ring-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
        >
          <Minus className="h-3.5 w-3.5" aria-hidden />
        </button>
      )}
    </div>
  );
}
