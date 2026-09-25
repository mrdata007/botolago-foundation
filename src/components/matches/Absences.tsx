import { useMemo } from "react";
import { HeartPulse } from "lucide-react";
import type { MatchAbsenceDto } from "@/backend/football/contracts";
import { ClubCrest } from "@/components/common/ClubCrest";
import { SectionHeader } from "@/components/common/SectionHeader";
import { ui, UiCard } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import type { ClubPalette } from "@/lib/club-palette";
import { cn } from "@/lib/utils";
import type { Club } from "@/types/domain";

/**
 * The Compos tab's absent players: those the provider lists as injured or
 * suspended for this match, per club, home first. Each row says why in words
 * (never by colour alone): a pulse for an injury, a red card for a
 * suspension, and the provider's expected return date when it has one.
 * Renders nothing when nobody is out.
 */
export function Absences({
  absences,
  home,
  away,
  palettes,
}: {
  absences: readonly MatchAbsenceDto[];
  home: Club;
  away: Club;
  palettes: { home: ClubPalette; away: ClubPalette };
}) {
  const { t, lang } = useI18n();
  const dateFmt = useMemo(
    () =>
      new Intl.DateTimeFormat(lang === "ar" ? "ar-MA" : "fr-FR", {
        timeZone: "UTC",
        day: "numeric",
        month: "short",
      }),
    [lang],
  );
  const sides = [
    { club: home, palette: palettes.home, rows: absences.filter((row) => row.teamId === home.id) },
    { club: away, palette: palettes.away, rows: absences.filter((row) => row.teamId === away.id) },
  ].filter((side) => side.rows.length > 0);
  if (sides.length === 0) return null;

  return (
    <section>
      <SectionHeader title={t("matches.absences.title")} as="h3" />
      <UiCard padding="sm" className="grid gap-4 sm:grid-cols-2">
        {sides.map(({ club, palette, rows }) => (
          <AbsenceColumn
            key={club.id}
            club={club}
            palette={palette}
            rows={rows}
            formatDate={(date) => dateFmt.format(new Date(`${date}T00:00:00Z`))}
          />
        ))}
      </UiCard>
    </section>
  );
}

function AbsenceColumn({
  club,
  palette,
  rows,
  formatDate,
}: {
  club: Club;
  palette: ClubPalette;
  rows: readonly MatchAbsenceDto[];
  formatDate: (date: string) => string;
}) {
  const { t, tr } = useI18n();
  return (
    <div className="min-w-0">
      {/* A div, not a p: the crest is a div. */}
      <div className={cn("flex items-center gap-2", ui.text.label, ui.tone.muted)}>
        <ClubCrest club={club} palette={palette} size="xs" />
        <span className="truncate">{tr(club.shortName)}</span>
      </div>
      <ul className="mt-2 grid gap-2">
        {rows.map((row) => {
          const injured = row.category === "injury";
          return (
            <li key={row.id} className="flex min-w-0 items-start gap-2.5">
              <span
                aria-hidden
                className={cn(
                  "mt-0.5 grid h-7 w-7 shrink-0 place-items-center",
                  ui.radius.full,
                  ui.surface.sunken,
                  ui.tone.muted,
                )}
              >
                {injured ? (
                  <HeartPulse className="h-4 w-4" />
                ) : (
                  <span
                    className={cn("h-3.5 w-2.5", ui.radius.tight, "bg-[color:var(--ui-live)]")}
                  />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "truncate",
                    ui.text.secondary,
                    "[font-weight:var(--ui-weight-strong)]",
                  )}
                >
                  {row.playerName}
                </p>
                <p className={cn(ui.text.meta, ui.tone.muted)}>
                  {injured ? t("matches.absences.injury") : t("matches.absences.suspension")}
                  {row.expectedReturnOn ? (
                    <>
                      {" · "}
                      {t("matches.absences.return").replace(
                        "{date}",
                        formatDate(row.expectedReturnOn),
                      )}
                    </>
                  ) : null}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
