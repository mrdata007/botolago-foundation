import colorWordmark from "@/assets/brand/botolago-wordmark-color.svg";

import { cn } from "@/lib/utils";

interface LogoProps {
  variant?: "full" | "icon";
  className?: string;
}

/**
 * The brand mark. Two things here look convertible and are staying:
 *
 * The sizes (`h-9 w-9`, `h-8`) are literals because there is no brand-mark
 * ramp in the kit and inventing one locally is what the design system forbids
 * — and because three of the five call sites override them anyway
 * (`!h-16` on the welcome mesh, `!h-12` on profile, `!h-9` in the auth shell;
 * the top bar and the first-launch gate take the base size).
 * Those overrides carry `!` for a reason: `cn()` is tailwind-merge, and
 * tailwind-merge 3.5 treats an important class as its own group, so `h-9` and
 * `!h-16` BOTH survive the merge and the winner is decided by `!important` in
 * the cascade. Verified against this repo's Tailwind 4.2.4 and tailwind-merge
 * 3.5. Drop the `!` at a call site and the base size wins instead.
 *
 * The icon's hairline is `--ui-rule`, the page's divider colour, which is
 * right on the top bar and slightly loud on the dark mesh, where the
 * surrounding glass tile draws its own hairline from `--ui-mesh-rule`. The
 * fix for that is a `tone` prop, i.e. an API change across call sites this
 * lane does not own; the ring stays on the token until then.
 */
export function Logo({ variant = "full", className }: LogoProps) {
  if (variant === "icon") {
    return (
      <img
        src="/favicon.png"
        alt="BotolaGO"
        width={1024}
        height={1024}
        decoding="async"
        // Kit radius and a hairline from the rule token; the V2 `rounded-xl`
        // + `ring-white/20` only read correctly on a dark chrome.
        className={cn(
          "h-9 w-9 object-cover ring-1 ring-[color:var(--ui-rule)]",
          "rounded-[var(--ui-radius-control)]",
          className,
        )}
      />
    );
  }
  return (
    <div className={cn("flex items-center", className)} aria-label="BotolaGO">
      <img
        src={colorWordmark}
        alt="BotolaGO"
        width={1615}
        height={288}
        decoding="async"
        fetchPriority="high"
        className="h-8 w-auto max-w-full select-none object-contain"
        draggable={false}
      />
    </div>
  );
}
