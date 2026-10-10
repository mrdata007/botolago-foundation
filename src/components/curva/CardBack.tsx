import type { CSSProperties } from "react";

import { useCardCopy, useCardStrings } from "@/components/manager-card/copy";
import { useMotionCopy } from "@/components/manager-card/motion-copy";
import { FOIL, tierKeyOf } from "@/components/manager-card/tier-palette";
import { TierWord } from "@/components/manager-card/tier-word";
import { STAT_CODES, type CardProfile } from "@/components/manager-card/types";

import { DASH, Figure } from "./figures";

/**
 * The back of the card, plain DOM (the stage's « Retourner »): the four statistics with their
 * names, the season and the serial, on the card's own material. The colours are the tier's row of
 * the foil ladder (`FOIL`: lacquer, field, rim light, label, tier word and the metal's stops), so
 * the back is the same object as the front and no new palette exists. Everything is sized in the
 * back's own container units, like the card, so it scales with the stage's 296 to 336 px.
 *
 * The face fills the box of the card (`absolute inset-0`); the stage turns it into place and
 * keeps it `inert` and `aria-hidden` while the front shows. A statistic the server has not given
 * is « — », never 0.
 */
export function CardBack({ profile }: { profile: CardProfile }) {
  const copy = useCardCopy();
  const motion = useMotionCopy();
  const strings = useCardStrings();
  const foil = FOIL[tierKeyOf(profile)];
  const metal = foil.metal;
  const style = {
    "--cb-plate": foil.plate,
    "--cb-deep": foil.deep,
    "--cb-glow": foil.glow,
    "--cb-light": foil.light,
    "--cb-label": foil.label,
    "--cb-word": foil.wordFill ?? foil.light,
    // the card's own corner radius and frame width, in the back's container units
    borderRadius: "5cqw",
    padding: "1.1cqw",
    backgroundImage: `linear-gradient(145deg, ${metal[0]}, ${metal[1]} 22%, ${metal[2]} 38%, ${metal[3]} 55%, ${metal[4]} 72%, ${metal[5]} 88%, ${metal[6]})`,
  } as CSSProperties;
  return (
    <div
      data-card-back=""
      role="group"
      aria-label={motion.flip.backLabel}
      className="h-full w-full [container-type:inline-size]"
    >
      <div className="h-full w-full" style={style}>
        <div
          className="flex h-full w-full flex-col justify-between overflow-hidden px-[7cqw] py-[8cqw]"
          style={{
            borderRadius: "4cqw",
            backgroundImage:
              "radial-gradient(120% 70% at 50% 0%, color-mix(in srgb, var(--cb-glow) 24%, transparent), transparent 70%), linear-gradient(180deg, var(--cb-deep), var(--cb-plate) 62%)",
            color: "var(--cb-light)",
          }}
        >
          <div className="flex flex-col gap-[1.4cqw]">
            <p className="flex items-baseline justify-between gap-[3cqw] text-[4.2cqw] leading-none">
              {profile.tier && profile.ovr !== null ? (
                <span
                  className="text-[5.2cqw] [font-weight:var(--ui-weight-heavy)]"
                  style={{ color: "var(--cb-word)", fontFamily: "var(--ui-font-display)" }}
                >
                  <TierWord tier={profile.tier} />
                </span>
              ) : (
                <span />
              )}
              {profile.season ? (
                <span style={{ color: "var(--cb-label)" }}>
                  <Figure>{profile.season}</Figure>
                </span>
              ) : null}
            </p>
            {profile.name ? (
              <bdi
                dir="auto"
                className="truncate text-[7cqw] leading-tight"
                style={{ fontFamily: "var(--ui-font-display)" }}
              >
                {profile.name}
              </bdi>
            ) : null}
          </div>

          <dl className="grid grid-cols-2 gap-x-[5cqw] gap-y-[7cqw]">
            {STAT_CODES.map((code) => {
              const value = profile.stats[code];
              return (
                <div key={code} data-back-stat={code} className="flex min-w-0 flex-col gap-[1cqw]">
                  <dt className="flex flex-col gap-[0.6cqw]">
                    <span
                      className="text-[4.4cqw] [font-weight:var(--ui-weight-heavy)] leading-none"
                      style={{ color: "var(--cb-label)" }}
                    >
                      {copy.stat[code]}
                    </span>
                    <span
                      className="text-[3.6cqw] leading-tight"
                      style={{ color: "var(--cb-label)" }}
                    >
                      {copy.statLong[code]}
                    </span>
                  </dt>
                  <dd
                    className="text-[13cqw] leading-none"
                    style={{ fontFamily: "var(--ui-font-display)", color: "var(--cb-light)" }}
                  >
                    {value === null ? DASH : <Figure>{value}</Figure>}
                  </dd>
                </div>
              );
            })}
          </dl>

          {profile.serial !== null ? (
            <p className="text-end text-[4.2cqw] leading-none" style={{ color: "var(--cb-label)" }}>
              <bdi dir="ltr" className="[font-weight:var(--ui-weight-heavy)]">
                {strings.serial(profile.serial)}
              </bdi>
            </p>
          ) : (
            <span />
          )}
        </div>
      </div>
    </div>
  );
}
