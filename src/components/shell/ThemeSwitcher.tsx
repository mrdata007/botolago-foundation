/**
 * BG-0081 — the Light / Dark / System control.
 *
 * Built from the kit (`ui.*` class tokens and `--ui-*` only) so it reads as one
 * of the Profile preference rows rather than a bolted-on widget, and so it is
 * legible in both themes.
 *
 * Why it does not reuse `UiSegmented`: that primitive paints its active
 * segment `text-[color:var(--ui-ink)]` on `var(--ui-surface)`. `--ui-ink` is a
 * dark navy in BOTH themes — it is a fill/border token, not a text colour — so
 * on the dark surface the active label computes to roughly 1.4:1 and is
 * unreadable. That is a pre-existing kit defect (reported, not patched here).
 * This control instead paints the active segment as an ink SURFACE and takes
 * its text from `--ui-on-ink`, the token that exists for exactly that pairing,
 * which clears AA in both themes.
 *
 * Direction: logical utilities throughout, no `tracking-*` at all.
 */

import { Monitor, Moon, Sun } from "lucide-react";

import { useI18n } from "@/i18n/provider";
import { ui } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import { useTheme } from "@/theme/provider";
import type { ThemeChoice } from "@/theme/theme";

export function ThemeSwitcher({ className }: { className?: string }) {
  const { t } = useI18n();
  const { choice, setChoice } = useTheme();

  // One literal translation call per option. A ternary inside a single call
  // would be an opaque call site and would move the i18n gate's W4 baseline.
  const options: ReadonlyArray<{
    value: ThemeChoice;
    label: string;
    icon: React.ReactNode;
  }> = [
    { value: "light", label: t("theme.light"), icon: <Sun className="h-4 w-4" aria-hidden /> },
    { value: "dark", label: t("theme.dark"), icon: <Moon className="h-4 w-4" aria-hidden /> },
    {
      value: "system",
      label: t("theme.system"),
      icon: <Monitor className="h-4 w-4" aria-hidden />,
    },
  ];

  return (
    <div
      role="radiogroup"
      aria-label={t("theme.switch")}
      data-testid="theme-switcher"
      className={cn(
        "grid grid-cols-3 gap-1 p-[3px]",
        ui.radius.track,
        ui.surface.sunken,
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === choice;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            data-theme-choice={option.value}
            onClick={() => setChoice(option.value)}
            className={cn(
              "flex min-h-10 items-center justify-center gap-1.5 px-2 transition-colors",
              ui.radius.segment,
              ui.text.meta,
              "[font-weight:var(--ui-weight-heavy)]",
              ui.focus,
              // The unselected labels take the full-strength foreground, not
              // `ui.tone.muted`: measured on the sunken track, muted is 3.95:1
              // in light at 13px, under AA. Selection is already carried by
              // the ink fill, so the labels do not also need to be dimmed.
              active ? cn(ui.surface.ink, "shadow-[var(--ui-shadow-card)]") : ui.tone.default,
            )}
          >
            {option.icon}
            <span className="truncate">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
