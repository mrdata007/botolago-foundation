import {
  useMemo,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { ui, UiCard } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { clubStyle, type ClubPalette } from "@/lib/club-palette";
import { cn } from "@/lib/utils";
import type { Club } from "@/types/domain";
import { pressureBins, pressureShare, type PressurePoint } from "./pressure-bins";

/** `clubStyle(palette)` with a bar's height merged in. */
function withClub(palette: ClubPalette, style: CSSProperties) {
  const club = clubStyle(palette);
  return { "data-club": club["data-club"], style: { ...club.style, ...style } };
}

/**
 * The Stats tab's pressure chart (SportsMonks Pressure Index): who was
 * pushing, five minutes a bar. Home grows up from the centre line and away
 * down, each in its club's edge colour (≥ 3:1 on the card, so a white kit
 * still shows); the half-time boundary is a hairline, and the axis names every
 * quarter hour. The time axis runs with the reading direction, so Arabic reads
 * it from the right, as the header puts home on the right.
 *
 * Identity is never colour alone: the legend names both clubs with their
 * share of the pressure, home is always above the line, and the readout names
 * the clubs. A bar under the pointer, a tap, or the arrow keys on the focused
 * chart fill the readout with that bar's minutes and values; the same values
 * are in a table for screen readers.
 */
export function PressureChart({
  points,
  home,
  away,
  palettes,
}: {
  points: readonly PressurePoint[];
  home: Club;
  away: Club;
  palettes: { home: ClubPalette; away: ClubPalette };
}) {
  const { t, tr, lang } = useI18n();
  const bins = useMemo(() => pressureBins(points), [points]);
  const share = useMemo(() => pressureShare(points), [points]);
  const nf = useMemo(
    () => new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR", { maximumFractionDigits: 0 }),
    [lang],
  );
  const [active, setActive] = useState<number | null>(null);

  if (!share || bins.length === 0) return null;

  const peak = Math.max(...bins.map((bin) => Math.max(bin.home, bin.away)));
  // A bar with any pressure stays visible (a sliver); none is no bar.
  const height = (value: number) =>
    `${value > 0 && peak > 0 ? Math.max(6, (value / peak) * 100) : 0}%`;
  const current = active === null ? null : (bins[active] ?? null);
  const homeName = tr(home.shortName);
  const awayName = tr(away.shortName);

  const move = (to: number) => setActive(Math.min(bins.length - 1, Math.max(0, to)));
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // Time runs with the reading direction: "later" is left in Arabic.
    const later = lang === "ar" ? "ArrowLeft" : "ArrowRight";
    const earlier = lang === "ar" ? "ArrowRight" : "ArrowLeft";
    if (event.key === later) move(active === null ? 0 : active + 1);
    else if (event.key === earlier) move(active === null ? bins.length - 1 : active - 1);
    else if (event.key === "Home") move(0);
    else if (event.key === "End") move(bins.length - 1);
    else if (event.key === "Escape") setActive(null);
    else return;
    event.preventDefault();
  };
  // A finger lifting also "leaves"; only a mouse clears the readout that way.
  const onPointerLeave = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse") setActive(null);
  };

  return (
    <UiCard padding="none" className={cn(ui.radius.sheet, "mb-3 px-4 pb-3 pt-3.5")}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className={cn(ui.text.label, ui.tone.muted)}>{t("matches.pressure.title")}</h3>
        <p className={cn(ui.text.micro, ui.tone.muted)}>{t("matches.pressure.share")}</p>
      </div>

      {/* The legend: each club's swatch, name and share of all the pressure. */}
      <div className="mt-2 flex items-center justify-between gap-3">
        <Key name={homeName} palette={palettes.home} share={share.home} />
        <Key name={awayName} palette={palettes.away} share={share.away} />
      </div>

      <div
        role="group"
        tabIndex={0}
        aria-label={t("matches.pressure.caption")}
        onKeyDown={onKeyDown}
        onBlur={() => setActive(null)}
        onPointerLeave={onPointerLeave}
        className={cn("mt-3 flex", ui.radius.tight, ui.focus)}
      >
        {bins.map((bin, index) => (
          <div
            key={bin.from}
            onPointerEnter={() => setActive(index)}
            onClick={() => setActive(index)}
            className={cn(
              "flex min-w-0 flex-1 flex-col items-center transition-opacity duration-[var(--duration-quick)]",
              bin.from === 46 && ui.rule.inline,
              active !== null && active !== index && "opacity-40",
            )}
          >
            <div className="flex h-14 w-full items-end justify-center">
              <span
                {...withClub(palettes.home, { height: height(bin.home) })}
                className={cn("w-3/5 max-w-3 rounded-t", ui.club.edgeFill)}
              />
            </div>
            <span aria-hidden className="h-px w-full bg-[color:var(--ui-rule)]" />
            <div className="flex h-14 w-full items-start justify-center">
              <span
                {...withClub(palettes.away, { height: height(bin.away) })}
                className={cn("w-3/5 max-w-3 rounded-b", ui.club.edgeFill)}
              />
            </div>
            <span
              aria-hidden
              className={cn("mt-1 h-3 whitespace-nowrap", ui.text.micro, ui.tone.faint)}
            >
              {bin.to % 15 === 0 ? <bdi className={ui.text.tabular}>{bin.to}′</bdi> : null}
            </span>
          </div>
        ))}
      </div>

      <p
        aria-live="polite"
        className={cn(
          "mt-2 min-h-5 text-center",
          ui.text.meta,
          current ? ui.tone.default : ui.tone.muted,
        )}
      >
        {current ? (
          <>
            <bdi className={ui.text.tabular}>
              {current.from}′–{current.to}′
            </bdi>
            {" · "}
            {homeName} <bdi className={ui.text.tabular}>{nf.format(current.home)}</bdi>
            {" · "}
            {awayName} <bdi className={ui.text.tabular}>{nf.format(current.away)}</bdi>
          </>
        ) : (
          t("matches.pressure.hint")
        )}
      </p>

      <table className="sr-only">
        <caption>{t("matches.pressure.caption")}</caption>
        <thead>
          <tr>
            <th scope="col">{t("matches.pressure.minutes")}</th>
            <th scope="col">{homeName}</th>
            <th scope="col">{awayName}</th>
          </tr>
        </thead>
        <tbody>
          {bins.map((bin) => (
            <tr key={bin.from}>
              <th scope="row">
                {bin.from}–{bin.to}
              </th>
              <td>{nf.format(bin.home)}</td>
              <td>{nf.format(bin.away)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </UiCard>
  );
}

/** A legend entry: the bar colour as a swatch, the club, its share in percent. */
function Key({ name, palette, share }: { name: string; palette: ClubPalette; share: number }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span
        {...clubStyle(palette)}
        aria-hidden
        className={cn("h-2.5 w-2.5 shrink-0", ui.radius.tight, ui.club.edgeFill)}
      />
      <span className={cn("truncate", ui.text.secondary, "[font-weight:var(--ui-weight-heavy)]")}>
        {name}
      </span>
      <bdi className={cn("whitespace-nowrap", ui.stat.md)}>
        {share}
        <span className="text-[length:0.7em]">%</span>
      </bdi>
    </span>
  );
}
