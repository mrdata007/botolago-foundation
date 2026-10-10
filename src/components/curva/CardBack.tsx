import { useId, type CSSProperties } from "react";

import { useCardCopy, useCardStrings } from "@/components/manager-card/copy";
import { useMotionCopy } from "@/components/manager-card/motion-copy";
import { TierWord } from "@/components/manager-card/tier-word";
import { STAT_CODES, type CardProfile } from "@/components/manager-card/types";
import { useCardPalette } from "@/components/manager-card/use-card-palette";
import { useI18n } from "@/i18n/provider";

import { DASH, Figure } from "./figures";

/** The cut corner and the tier chip's points, as the front's outline draws them. */
const CUT = 13;
const frame = (rtl: boolean, cut: number): string =>
  rtl
    ? `polygon(0 0, 100% 0, 100% 100%, ${cut}cqw 100%, 0 calc(100% - ${cut}cqw))`
    : `polygon(0 0, 100% 0, 100% calc(100% - ${cut}cqw), calc(100% - ${cut}cqw) 100%, 0 100%)`;
const CHIP = "polygon(7% 0, 93% 0, 100% 50%, 93% 100%, 7% 100%, 0 50%)";

/** A honeycomb of hairline hexagons, the front's backboard (drawn here as one tiled SVG pattern). */
function hex(cx: number, cy: number): string {
  const p = [
    [cx, cy - 5],
    [cx + 4.33, cy - 2.5],
    [cx + 4.33, cy + 2.5],
    [cx, cy + 5],
    [cx - 4.33, cy + 2.5],
    [cx - 4.33, cy - 2.5],
  ];
  return `M${p.map((q) => q.join(" ")).join("L")}Z`;
}
const HONEYCOMB = [hex(4.33, 5), hex(0, 12.5), hex(8.66, 12.5)].join("");

/**
 * The back of the card, plain DOM (the stage's « Retourner »), made of the front's own parts: the
 * cut-cornered outline and its rim stroke, the lacquer with the backlight and the honeycomb, the
 * club's disc and the season as on the front's tab, the name in the front's serif, the tier in its
 * pointed chip, the four statistics with a bar each, the wordmark and the serial. The colours are
 * the tier's material from the active renderer (`useCardPalette`), so the back is the same object
 * as the front. Everything is sized in the back's own container units, like the card, so it scales
 * with the stage's 296 to 336 px. The lower start corner stays empty: the stage's flip button sits
 * there.
 *
 * The face fills the box of the card (`absolute inset-0`); the stage turns it into place and
 * keeps it `inert` and `aria-hidden` while the front shows. A statistic the server has not given
 * is « — », never 0.
 */
export function CardBack({ profile }: { profile: CardProfile }) {
  const copy = useCardCopy();
  const motion = useMotionCopy();
  const strings = useCardStrings();
  const { dir } = useI18n();
  const rtl = dir === "rtl";
  const palette = useCardPalette(profile.ovr === null ? null : profile.tier);
  const pattern = useId();
  const metal = palette.metal;
  const rim: CSSProperties = {
    clipPath: frame(rtl, CUT),
    backgroundImage: `linear-gradient(145deg, ${metal[0]}, ${metal[1]} 22%, ${metal[2]} 38%, ${metal[3]} 55%, ${metal[4]} 72%, ${metal[5]} 88%, ${metal[6]})`,
    padding: "1cqw",
  };
  const plate: CSSProperties = {
    clipPath: frame(rtl, CUT - 0.8),
    backgroundColor: palette.plate,
    backgroundImage: `radial-gradient(110% 60% at 50% 38%, color-mix(in srgb, ${palette.glow} 30%, transparent), transparent 72%), linear-gradient(180deg, ${palette.deep}, ${palette.plate} 70%)`,
    color: palette.light,
  };
  const label: CSSProperties = { color: palette.label };
  const display: CSSProperties = { fontFamily: "var(--ui-font-display)" };
  const name = profile.name.trim().toLocaleUpperCase("fr");
  return (
    <div
      data-card-back=""
      role="group"
      aria-label={motion.flip.backLabel}
      className="h-full w-full [container-type:inline-size]"
    >
      <div className="h-full w-full" style={rim}>
        <div className="relative h-full w-full" style={plate}>
          <svg
            aria-hidden
            className="pointer-events-none absolute inset-0 h-full w-full opacity-30"
            viewBox="0 0 100 161.8"
            preserveAspectRatio="xMidYMid slice"
          >
            <defs>
              <pattern id={pattern} width="8.66" height="15" patternUnits="userSpaceOnUse">
                <path d={HONEYCOMB} fill="none" stroke={palette.light} strokeWidth="0.22" />
              </pattern>
            </defs>
            <rect width="100" height="161.8" fill={`url(#${pattern})`} />
          </svg>

          <div className="relative flex h-full w-full flex-col px-[8cqw] pb-[7cqw] pt-[8cqw]">
            <div className="flex items-center gap-[3cqw]">
              {profile.club ? (
                <span
                  aria-hidden
                  className="grid h-[12cqw] w-[12cqw] shrink-0 place-items-center rounded-full text-[4.4cqw] leading-none"
                  style={{
                    ...display,
                    backgroundColor: profile.club.primary,
                    color: "var(--ui-on-club)",
                    boxShadow: `0 0 0 0.7cqw ${palette.light}`,
                  }}
                >
                  {profile.club.initials}
                </span>
              ) : null}
              {profile.season ? (
                <span className="text-[4.6cqw] leading-none" style={label}>
                  <Figure>{profile.season}</Figure>
                </span>
              ) : null}
            </div>

            <div className="mt-[7cqw] flex flex-col items-start gap-[3.5cqw]">
              {name ? (
                <bdi
                  dir="auto"
                  className="max-w-full truncate text-[11cqw] leading-none"
                  style={{ fontFamily: '"Instrument Serif", "Times New Roman", serif' }}
                >
                  {name}
                </bdi>
              ) : null}
              {profile.tier && profile.ovr !== null ? (
                <span
                  className="inline-grid h-[8cqw] min-w-[27cqw] place-items-center px-[5cqw] text-[4.4cqw] leading-none"
                  style={{
                    ...display,
                    clipPath: CHIP,
                    backgroundColor: palette.deep,
                    boxShadow: `inset 0 0 0 0.5cqw ${palette.word}`,
                    color: palette.word,
                  }}
                >
                  <TierWord tier={profile.tier} />
                </span>
              ) : null}
            </div>

            <dl className="my-auto grid grid-cols-2 gap-x-[6cqw] gap-y-[9cqw] pt-[6cqw]">
              {STAT_CODES.map((code) => {
                const value = profile.stats[code];
                return (
                  <div
                    key={code}
                    data-back-stat={code}
                    className="flex min-w-0 flex-col gap-[1.6cqw]"
                  >
                    <dt className="flex items-baseline justify-between gap-[2cqw]">
                      <span className="text-[4.6cqw] leading-none" style={{ ...display, ...label }}>
                        {copy.stat[code]}
                      </span>
                    </dt>
                    <dd
                      className="text-[14cqw] leading-none"
                      style={{ ...display, color: palette.light }}
                    >
                      {value === null ? DASH : <Figure>{value}</Figure>}
                    </dd>
                    <span
                      aria-hidden
                      className="block h-[1.4cqw] w-full overflow-hidden rounded-full"
                      style={{
                        backgroundColor: `color-mix(in srgb, ${palette.light} 18%, transparent)`,
                      }}
                    >
                      <span
                        className="block h-full rounded-full"
                        style={{
                          width: `${value ?? 0}%`,
                          backgroundImage: `linear-gradient(90deg, ${palette.glow}, ${palette.light})`,
                        }}
                      />
                    </span>
                    <span className="text-[3.6cqw] leading-tight" style={label}>
                      {copy.statLong[code]}
                    </span>
                  </div>
                );
              })}
            </dl>

            <div
              className="flex items-baseline justify-between gap-[3cqw] ps-[15cqw] text-[4cqw] leading-none"
              style={label}
            >
              <span dir="ltr" className="ltr:tracking-[0.35em]" style={display}>
                BOTOLAGO
              </span>
              {profile.serial !== null ? (
                <bdi dir="ltr" className="[font-weight:var(--ui-weight-heavy)]">
                  {strings.serial(profile.serial)}
                </bdi>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
