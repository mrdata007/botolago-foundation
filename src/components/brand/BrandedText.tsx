import colorWordmark from "@/assets/brand/botolago-wordmark-color.svg";
import lightWordmark from "@/assets/brand/botolago-wordmark-light.svg";

import { cn } from "@/lib/utils";

/** The brand name as it is written in copy, in either script. */
const BRAND = /(BotolaGO|بوتولاجو)/;

/**
 * A heading whose copy names the product ("Bienvenue sur BotolaGO",
 * "Explorer BotolaGO") shows the wordmark in place of the typed name.
 *
 * The wordmark is sized from the heading's own font (`em`), sits on its
 * baseline, and never breaks inside itself. Its alt is "BotolaGO", so the
 * heading's accessible name and any test that reads it are unchanged. The
 * dictionary's `{accent}` markers are dropped: the logo is the accent.
 *
 * Only for headings: running text, buttons and page titles keep the word.
 */
export function BrandedText({
  text,
  tone = "color",
  className,
}: {
  text: string;
  /** `color` on light surfaces, `light` (all white) on dark ones. */
  tone?: "color" | "light";
  className?: string;
}) {
  const parts = text.replace(/\{\/?accent\}/g, "").split(BRAND);
  return (
    <span className={className}>
      {parts.map((part, i) =>
        BRAND.test(part) ? (
          <img
            key={i}
            src={tone === "light" ? lightWordmark : colorWordmark}
            alt="BotolaGO"
            width={1615}
            height={288}
            decoding="async"
            draggable={false}
            className="inline-block h-[0.82em] w-auto max-w-none select-none align-baseline"
          />
        ) : (
          part
        ),
      )}
    </span>
  );
}
