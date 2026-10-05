import colorMark from "@/assets/brand/botolago-mark-color.svg";
import lightMark from "@/assets/brand/botolago-mark-light.svg";
import colorWordmark from "@/assets/brand/botolago-wordmark-color.svg";
import lightWordmark from "@/assets/brand/botolago-wordmark-light.svg";

import { cn } from "@/lib/utils";

import { LOGO_TONE_FILES, logoThemeClass, type LogoTone } from "./logo-tone";

interface LogoProps {
  variant?: "full" | "icon";
  /**
   * `auto` (the default) follows the theme: the blue mark on the light
   * theme's surfaces, the all-white one on the dark theme's. `color` and
   * `light` pin one file for a surface that is the same in both themes:
   * `light` for the dark mesh and ink bands (auth, landing hero, welcome).
   * Applies to the wordmark and the icon.
   */
  tone?: LogoTone;
  /** Wordmark height. `md` is the top bar; `sm` endorses a sub-brand; `lg` a hero. */
  size?: "sm" | "md" | "lg";
  className?: string;
}

const WORDMARK_HEIGHT = { sm: "h-5", md: "h-8", lg: "h-10" } as const;

/**
 * The brand mark, in the three contexts the product uses: the wordmark in
 * the global bar and on branded headers, and the app icon on onboarding and
 * account surfaces.
 *
 * The icon used to be `public/favicon.png` — a 64px raster with a grey
 * backdrop baked in — scaled up to 36–64px, where it read as a blurry pasted
 * thumbnail. It is now the "GO" of the official wordmark (same vector paths,
 * cropped viewBox: `botolago-mark-color.svg`), so it is sharp at any size and
 * identical to the wordmark it came from. It has no tile behind it, like
 * `public/favicon.png`: the colour mark gives the ball its own white fill, and
 * dark surfaces take the all-white mark instead (`tone="auto"` in the dark
 * theme, `tone="light"` on a band that is dark in both).
 *
 * Icon sizes stay literal (`h-9 w-9`) and call sites override them with `!`.
 * `cn()` is tailwind-merge, which treats an important class as its own group,
 * so `h-9` and `!h-16` both survive and `!important` decides. Drop the `!` at
 * a call site and the base size wins instead.
 */
export function Logo({ variant = "full", tone = "auto", size = "md", className }: LogoProps) {
  const files = LOGO_TONE_FILES[tone];
  if (variant === "icon") {
    return (
      <span
        role="img"
        aria-label="BotolaGO"
        className={cn("inline-flex h-9 w-9 shrink-0 items-center justify-center", className)}
      >
        {files.map(({ file, only }) => (
          <img
            key={file}
            src={file === "light" ? lightMark : colorMark}
            alt=""
            width={422}
            height={270}
            decoding="async"
            draggable={false}
            className={cn(
              "h-full w-full select-none object-contain",
              logoThemeClass(only, "block"),
            )}
          />
        ))}
      </span>
    );
  }
  return (
    <div className={cn("flex items-center", className)}>
      {files.map(({ file, only }) => (
        <img
          key={file}
          src={file === "light" ? lightWordmark : colorWordmark}
          alt="BotolaGO"
          width={1615}
          height={288}
          decoding="async"
          fetchPriority="high"
          className={cn(
            WORDMARK_HEIGHT[size],
            "w-auto max-w-full select-none object-contain",
            logoThemeClass(only, "block"),
          )}
          draggable={false}
        />
      ))}
    </div>
  );
}
