import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { fantasyService } from "@/services/fantasy-runtime";
import { footballService } from "@/services/football";
import { LoadingState } from "@/components/common/States";
import { ClubCrest } from "@/components/common/ClubCrest";
import { DifficultyBadge } from "@/components/fantasy/DifficultyBadge";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/fantasy/fixtures")({
  component: FixturesPage,
});

function FixturesPage() {
  const { t, tr, lang } = useI18n();
  const fdQ = useQuery({
    queryKey: ["fixture-difficulty"],
    queryFn: () => fantasyService.getFixtureDifficulty(),
  });
  const clubsQ = useQuery({
    queryKey: ["football", "clubs", lang],
    queryFn: () => footballService.getClubs(lang),
  });
  const [clubId, setClubId] = useState("");
  const [range, setRange] = useState<3 | 6>(6);

  const fdData = fdQ.data;
  const grid = useMemo(() => {
    if (!fdData) return null;
    const rows = new Map<string, typeof fdData>();
    for (const f of fdData) {
      if (clubId && f.clubId !== clubId) continue;
      const arr = rows.get(f.clubId) ?? [];
      arr.push(f);
      rows.set(f.clubId, arr);
    }
    for (const arr of rows.values()) arr.sort((a, b) => a.gameweek - b.gameweek);
    return rows;
  }, [fdData, clubId]);

  if (!fdQ.data || !clubsQ.data || !grid) return <LoadingState />;
  const clubs = clubsQ.data;
  const clubOf = (id: string) => clubs.find((c) => c.id === id);
  const gws = Array.from({ length: range }, (_, i) => 14 + i);

  return (
    <div>
      <h1 className="text-xl font-black text-foreground">
        <span className="text-brand">{t("fantasy.fixtures.title")}</span>
      </h1>
      <p className="mt-1 text-xs text-muted-foreground">{t("fantasy.fixtures.difficulty")} 1–5</p>

      <div className="mt-3 flex flex-wrap items-center gap-1">
        <span className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">
          {t("fantasy.fixtures.club")}:
        </span>
        <Chip active={clubId === ""} onClick={() => setClubId("")}>
          {t("common.all")}
        </Chip>
        {clubs.map((c) => (
          <Chip key={c.id} active={clubId === c.id} onClick={() => setClubId(c.id)}>
            {tr(c.shortName)}
          </Chip>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-1">
        <span className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">
          {t("fantasy.fixtures.range")}:
        </span>
        <Chip active={range === 3} onClick={() => setRange(3)}>
          3 GW
        </Chip>
        <Chip active={range === 6} onClick={() => setRange(6)}>
          6 GW
        </Chip>
      </div>

      <div className="mt-3 overflow-x-auto rounded-2xl bg-card ring-1 ring-black/5">
        <table className="w-full border-collapse text-xs">
          <thead className="bg-muted/60 text-[10px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="sticky start-0 z-10 bg-muted/60 px-2 py-2 text-start">
                {t("fantasy.fixtures.club")}
              </th>
              {gws.map((gw) => (
                <th key={gw} className="px-1 py-2 text-center">
                  GW{gw}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from(grid.entries()).map(([cid, list]) => {
              const c = clubOf(cid);
              if (!c) return null;
              return (
                <tr key={cid} className="border-t border-border/70">
                  <th className="sticky start-0 z-10 bg-card px-2 py-2 text-start">
                    <div className="flex items-center gap-1.5">
                      <ClubCrest club={c} size="sm" />
                      <span className="truncate font-semibold">{tr(c.shortName)}</span>
                    </div>
                  </th>
                  {gws.map((gw) => {
                    const f = list.find((x) => x.gameweek === gw);
                    if (!f) return <td key={gw} className="px-1 py-2" />;
                    const opp = clubOf(f.opponentClubId);
                    return (
                      <td key={gw} className="px-1 py-1">
                        <DifficultyBadge
                          difficulty={f.difficulty}
                          label={`${opp?.crestPlaceholder ?? "?"}${f.isHome ? " (H)" : ""}${f.isDouble ? " ×2" : ""}${f.isBlank ? " —" : ""}`}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <Legend color="bg-emerald-500" text="1-2" />
        <Legend color="bg-neutral-300" text="3" />
        <Legend color="bg-orange-400" text="4" />
        <Legend color="bg-red-600" text="5" />
        <span className="ms-2">
          ×2 = {t("fantasy.fixtures.double")} · — = {t("fantasy.fixtures.blank")}
        </span>
      </div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors",
        active
          ? "bg-[color:var(--brand-primary)] text-white"
          : "bg-white/60 text-foreground ring-1 ring-black/5 hover:bg-white",
      )}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}
function Legend({ color, text }: { color: string; text: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn("inline-block h-3 w-3 rounded", color)} />
      {text}
    </span>
  );
}
