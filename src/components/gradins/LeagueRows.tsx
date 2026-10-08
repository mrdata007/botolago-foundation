import type { ReactNode } from "react";

import { STRETCHED_LINK } from "@/components/clubs/stretched-link";
import { STANDINGS_FIGURE_CELL, STANDINGS_NAME_CELL } from "@/components/fantasy-lists/standings";
import { CardToken } from "@/components/manager-card/CardToken";
import { useCardCopy, useGradinsCopy, useMomentCopy } from "@/components/manager-card/copy";
import { fill } from "@/components/manager-card/interpolate";
import { fromMember } from "@/components/manager-card/to-profile";
import { ReportNameMenu } from "@/components/report/ReportNameMenu";
import { ui, UiTable, UiTBody, UiTD, UiTH, UiTHead, UiTR } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

import { DASH, PersonName, ProvisionalBadge } from "./figures";
import { cardLine, rowReportTargets, type PeopleRow } from "./people";

/**
 * A league's rows as a real table, in the league's own points order (never by rating): the
 * position, the manager with the card's mini and what the card says, and the Fantasy total.
 * G1's excerpt (three rows) and G3's full table are this one component.
 *
 * The reader's own row has a 4px bar in the action gradient at its inline start. With `onOpen`
 * the name is a button stretched over the row (the face-à-face opens from it); the report control
 * sits above that overlay, for other managers only.
 */
export function LeagueRows({
  rows,
  caption,
  onOpen,
  head = false,
  ownRef,
}: {
  rows: readonly PeopleRow[];
  caption: string;
  onOpen?: (row: PeopleRow) => void;
  head?: boolean;
  /** Receives the reader's own row, so the page can scroll it into view. */
  ownRef?: (element: HTMLTableRowElement | null) => void;
}) {
  const { t, lang } = useI18n();
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA-u-nu-latn" : "fr-FR");
  return (
    <UiTable caption={caption}>
      {head ? (
        <UiTHead className="bg-transparent">
          <UiTR>
            <UiTH className={cn("ps-4", STANDINGS_FIGURE_CELL)}>{t("fpl.pos")}</UiTH>
            <UiTH className={STANDINGS_NAME_CELL}>{t("fpl.manager")}</UiTH>
            <UiTH numeric className={cn("pe-4", STANDINGS_FIGURE_CELL)}>
              {t("fpl.total")}
            </UiTH>
          </UiTR>
        </UiTHead>
      ) : null}
      <UiTBody>
        {rows.map((row, index) => (
          <LeagueRow
            key={row.standing.managerId}
            row={row}
            last={index === rows.length - 1}
            nf={nf}
            onOpen={onOpen}
            ownRef={row.own ? ownRef : undefined}
          />
        ))}
      </UiTBody>
    </UiTable>
  );
}

function LeagueRow({
  row,
  last,
  nf,
  onOpen,
  ownRef,
}: {
  row: PeopleRow;
  last: boolean;
  nf: Intl.NumberFormat;
  onOpen?: (row: PeopleRow) => void;
  ownRef?: (element: HTMLTableRowElement | null) => void;
}) {
  const gradins = useGradinsCopy();
  const nameClass = cn(
    "block min-w-0 text-start",
    ui.text.secondary,
    "[font-weight:var(--ui-weight-heavy)]",
    ui.tone.default,
    "line-clamp-2 break-words",
  );
  return (
    <tr
      ref={ownRef}
      className={cn(
        "relative",
        ui.rule.block,
        row.own && "bg-[color:color-mix(in_oklab,var(--ui-ink-fg)_8%,var(--ui-surface))]",
        last && "border-b-0",
      )}
      data-own={row.own ? "true" : undefined}
      data-team={row.standing.managerId}
    >
      <UiTD className={cn("relative ps-4", STANDINGS_FIGURE_CELL, ui.stat.sm, ui.tone.muted)}>
        {row.own ? (
          <span
            aria-hidden
            data-own-bar=""
            className="absolute inset-y-1.5 start-0 w-1 rounded-full"
            style={{ backgroundImage: "var(--ui-grad-action)" }}
          />
        ) : null}
        <bdi>{nf.format(row.standing.rank)}</bdi>
      </UiTD>
      <UiTD className={cn("py-2", STANDINGS_NAME_CELL)}>
        <div className="flex items-center gap-2.5">
          <span className="grid h-7 w-7 shrink-0 place-items-center">
            {row.card ? <CardToken profile={fromMember(row.card)} size={28} /> : null}
          </span>
          {onOpen ? (
            // The whole text block is the button, so the control is as tall as the row's text
            // (over 44px) and its `::after` makes the full row the target.
            <button
              type="button"
              onClick={() => onOpen(row)}
              className={cn(
                "flex min-h-[var(--ui-tap-min)] min-w-0 flex-1 flex-col justify-center text-start",
                STRETCHED_LINK,
              )}
              data-testid="gradins-people-open"
            >
              <span className={nameClass}>
                <PersonName>{row.name}</PersonName>
              </span>
              <CardLineText row={row} youLabel={row.own ? gradins.peopleYou : null} />
            </button>
          ) : (
            <div className="min-w-0 flex-1">
              <span className={nameClass}>
                <PersonName>{row.name}</PersonName>
              </span>
              <CardLineText row={row} youLabel={row.own ? gradins.peopleYou : null} />
            </div>
          )}
          {onOpen && !row.own ? (
            <ReportNameMenu targets={rowReportTargets(row)} className="relative z-10" />
          ) : null}
        </div>
      </UiTD>
      <UiTD
        numeric
        strong
        className={cn("pe-4", STANDINGS_FIGURE_CELL, ui.stat.md, ui.tone.default)}
      >
        {nf.format(row.standing.totalScore)}
      </UiTD>
    </tr>
  );
}

/** « 84 OVR · PRO » and the pill, « en formation 1/3 », or a dash, with « Vous » first on your row. */
function CardLineText({ row, youLabel }: { row: PeopleRow; youLabel: ReactNode }) {
  const card = useCardCopy();
  const moments = useMomentCopy();
  const line = cardLine(row.card);
  const lead = youLabel ? (
    <>
      <span className={cn("[font-weight:var(--ui-weight-heavy)]", ui.tone.ink)}>{youLabel}</span>
      <span aria-hidden> · </span>
    </>
  ) : null;
  return (
    <span
      className={cn("flex flex-wrap items-center gap-x-1 gap-y-0.5", ui.text.meta, ui.tone.muted)}
      data-card-line={line.kind}
    >
      {lead}
      {line.kind === "rated" ? (
        <>
          <span>
            <bdi dir="ltr">
              {line.ovr} {card.ovr}
            </bdi>
            {line.tier ? ` · ${card.tier[line.tier]}` : ""}
          </span>
          {line.provisional ? <ProvisionalBadge className="px-2 py-0.5" /> : null}
        </>
      ) : line.kind === "forming" ? (
        <span>{fill(moments.m5.rowForming, { k: line.counted, n: line.min })}</span>
      ) : (
        <span>
          <span aria-hidden>{DASH}</span>
          <span className="sr-only">{card.a11y.noRating}</span>
        </span>
      )}
    </span>
  );
}
