import { useEffect, type ReactNode } from "react";

import type { MyCardDto } from "@/backend/manager-card/contracts";
import { ManagerCard } from "@/components/manager-card/ManagerCard";
import { useCardCopy, useGradinsCopy, useMomentCopy } from "@/components/manager-card/copy";
import { fill } from "@/components/manager-card/interpolate";
import { fromMember, fromMyCard } from "@/components/manager-card/to-profile";
import { STAT_CODES, type StatCode } from "@/components/manager-card/types";
import { ReportNameMenu } from "@/components/report/ReportNameMenu";
import { ui, UiButton, UiSheet } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";

import { CODE_CLASS, DASH, Figure, PersonName, ProvisionalBadge } from "./figures";
import { barWidth, compareValues } from "./h2h";
import { rowReportTargets, type PeopleRow } from "./people";

/**
 * Face-à-face (G4, plan 4.4): two cards side by side, yours at the inline start, with the four
 * statistics in rows, « CAP 91 · 85 ». The higher value is set heavier with a short bar under it;
 * equal values are both set at 700; a missing one is a dash, and nothing is compared with it.
 * It opens from a row of « Les vôtres », on a tap, and has no beat and no share: a friend's rating
 * stays in the app (D19). « Provisoire » sits under either card when it applies.
 */
export function HeadToHeadSheet({
  open,
  onOpenChange,
  mine,
  row,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mine: MyCardDto | null;
  row: PeopleRow | null;
}) {
  const { t } = useI18n();
  const copy = useGradinsCopy();
  const moments = useMomentCopy();
  const ready = open && mine !== null && row !== null && row.card !== null;
  useEffect(() => {
    if (ready) track("card_h2h_open");
  }, [ready]);

  const myProfile = mine ? fromMyCard(mine) : null;
  const theirs = row?.card ?? null;
  const theirProfile = theirs ? fromMember(theirs) : null;
  const myOvr = mine && !(mine.ratingState === "forming" && mine.previousSeason) ? mine.ovr : null;

  return (
    <UiSheet open={open} onOpenChange={onOpenChange} title={copy.h2hTitle}>
      {mine && myProfile && row && theirs && theirProfile ? (
        <div className="flex flex-col gap-5 px-4 pb-4 pt-5" data-testid="gradins-h2h">
          <div className="grid grid-cols-2 gap-3">
            <Side
              name={mine.name}
              provisional={mine.provisional && myOvr !== null}
              profile={myProfile}
            />
            <Side
              name={row.name}
              provisional={theirs.provisional && theirs.ovr !== null}
              profile={theirProfile}
              report={
                row.own ? null : (
                  <ReportNameMenu targets={rowReportTargets(row)} className="shrink-0" />
                )
              }
            />
          </div>
          <p
            className={cn("text-center", ui.text.bodyStrong, ui.tone.default)}
            data-testid="gradins-h2h-score"
          >
            {fill(moments.m5.h2hScore, {
              a: myOvr ?? DASH,
              name: <PersonName>{row.name}</PersonName>,
              b: theirs.ovr ?? DASH,
            })}
          </p>
          <ul className="flex flex-col" aria-label={copy.h2hTitle}>
            {STAT_CODES.map((code) => (
              <StatRow key={code} code={code} a={mine.stats[code].value} b={theirs.stats[code]} />
            ))}
          </ul>
          <UiButton variant="ghost" onClick={() => onOpenChange(false)}>
            {t("fpl.close")}
          </UiButton>
        </div>
      ) : null}
    </UiSheet>
  );
}

function Side({
  name,
  profile,
  provisional,
  report,
}: {
  name: string;
  profile: Parameters<typeof ManagerCard>[0]["profile"];
  provisional: boolean;
  report?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-2">
      <div className="w-full max-w-40 md:max-w-[200px]">
        <ManagerCard profile={profile} width={200} />
      </div>
      <div className="flex min-w-0 max-w-full items-center gap-1">
        <p className={cn("min-w-0 truncate text-center", ui.display.header, ui.tone.default)}>
          <PersonName>{name}</PersonName>
        </p>
        {report}
      </div>
      <div className="min-h-6">{provisional ? <ProvisionalBadge /> : null}</div>
    </div>
  );
}

function StatRow({ code, a, b }: { code: StatCode; a: number | null; b: number | null }) {
  const copy = useCardCopy();
  const higher = compareValues(a, b);
  return (
    <li className={cn("flex min-h-14 items-center gap-3 py-2", ui.rule.block)} data-stat={code}>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={CODE_CLASS}>{copy.stat[code]}</span>
        <span className={cn("truncate", ui.text.meta, ui.tone.default)}>{copy.statLong[code]}</span>
      </span>
      <Value value={a} win={higher === "a"} tie={higher === "equal"} />
      <Value value={b} win={higher === "b"} tie={higher === "equal"} />
    </li>
  );
}

function Value({ value, win, tie }: { value: number | null; win: boolean; tie: boolean }) {
  const card = useCardCopy();
  return (
    <span className="flex w-14 shrink-0 flex-col items-center gap-1">
      <span
        className={cn(
          ui.stat.md,
          ui.tone.default,
          // The higher value is the heavy one (800); a lower one and a tie are 700.
          win && !tie
            ? "[font-weight:var(--ui-weight-heavy)]"
            : "[font-weight:var(--ui-weight-strong)]",
        )}
      >
        {value === null ? (
          <>
            <span aria-hidden>{DASH}</span>
            <span className="sr-only">{card.a11y.noRating}</span>
          </>
        ) : (
          <Figure>{value}</Figure>
        )}
      </span>
      <span
        aria-hidden
        className="h-[3px] rounded-full"
        style={{
          width: win && value !== null ? barWidth(value) : 0,
          backgroundColor: "var(--ui-ink-fg)",
        }}
      />
    </span>
  );
}
