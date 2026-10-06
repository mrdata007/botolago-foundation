/**
 * BG-0081 — the Light / Dark / System control. Visible since BG-0149, when
 * dark mode was switched on (owner decision, 2026-10-05).
 *
 * Built from the kit (`ui.*` class tokens and `--ui-*` only) so it reads as one
 * of the Profile preference rows rather than a bolted-on widget, and so it is
 * legible in both themes.
 *
 * It is a radio group, not `UiSegmented` (a tablist): picking a theme is a
 * choice of one of three, with nothing to switch between. So the pattern's
 * keyboard comes with it, as in the first-launch language chooser: one tab
 * stop (the chosen option), and the arrows move the choice, Left moving
 * forward under `dir="rtl"` (`radio-keys.ts`).
 *
 * The chosen segment is the selected fill (`ui.surface.selected`): white on
 * navy in light, ink-deep on the light brand tint in dark, where the navy
 * fill on the sunken track was 1.13:1 and the choice did not show.
 *
 * Direction: logical utilities throughout, no `tracking-*` at all.
 */

import { useRef, type KeyboardEvent } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

import { useI18n } from "@/i18n/provider";
import { ui } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import { useTheme } from "@/theme/provider";
import { THEME_CHOICES, type ThemeChoice } from "@/theme/theme";

import { radioKeyTarget } from "./radio-keys";

export function ThemeSwitcher({ className }: { className?: string }) {
  const { t, dir } = useI18n();
  const { choice, setChoice } = useTheme();
  const radios = useRef<Partial<Record<ThemeChoice, HTMLButtonElement | null>>>({});

  const onRadioKeyDown = (event: KeyboardEvent<HTMLButtonElement>, from: ThemeChoice) => {
    const target = radioKeyTarget(THEME_CHOICES, event, from, dir === "rtl");
    if (target === null) return;
    event.preventDefault();
    setChoice(target);
    radios.current[target]?.focus();
  };

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
      className={cn("grid grid-cols-3 gap-1 p-[3px]", ui.radius.full, ui.surface.sunken, className)}
    >
      {options.map((option) => {
        const active = option.value === choice;
        return (
          <button
            key={option.value}
            ref={(node) => {
              radios.current[option.value] = node;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            // One tab stop for the group, on the chosen option; the arrows
            // reach the others.
            tabIndex={active ? 0 : -1}
            data-theme-choice={option.value}
            onClick={() => setChoice(option.value)}
            onKeyDown={(event) => onRadioKeyDown(event, option.value)}
            className={cn(
              // The kit's 44px tap floor (it was `min-h-10`, 40px).
              "flex min-h-[var(--ui-tap-min)] items-center justify-center gap-1.5 px-2 transition-colors",
              ui.radius.full,
              ui.text.meta,
              "[font-weight:var(--ui-weight-heavy)]",
              ui.focus,
              // The unselected labels take the full-strength foreground, not
              // `ui.tone.muted`: measured on the sunken track, muted is 3.95:1
              // in light at 13px, under AA. Selection is already carried by
              // the selected fill, so the labels do not also need to be
              // dimmed. Option A: the selected segment is the selected chip
              // and `UiSegmented variant="pill"` pairing, not the cyan on-ink.
              active ? cn(ui.surface.selected, ui.shadow.card) : ui.tone.default,
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
