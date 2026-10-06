import type { CSSProperties } from "react";
import { Toaster as Sonner } from "sonner";

import { useI18n } from "@/i18n/provider";
import { useTheme } from "@/theme/provider";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * The Toaster, on the kit (BG-0149).
 *
 * Sonner injects its own stylesheet WITHOUT a cascade layer, and an unlayered
 * rule beats anything in Tailwind's `@layer utilities` whatever its
 * specificity. So until BG-0149 none of the classes below applied: every
 * toast was Sonner's default white 8px box, in both themes. Two things make
 * the kit stick now:
 *
 *   1. Sonner's own rules paint from `--normal-bg` / `--normal-text` /
 *      `--normal-border`, which its theme rules set on the `<ol>`. The `style`
 *      prop lands inline on that same `<ol>`, and an inline declaration beats
 *      the stylesheet's, so pointing the three at kit tokens re-themes every
 *      rule that reads them (the toast, the close button, the action button).
 *      `theme` follows what is on screen, so Sonner's own dark rules (the
 *      description colour, the cancel button) are the matching set too.
 *   2. Every class that sets a property Sonner's rules also set carries `!`:
 *      an important declaration in a layer beats a normal unlayered one.
 *
 * Kit tokens only; every one of them is redeclared under `.dark`. The type
 * stripes are the kit's status colours on the inline-start edge, so they
 * mirror in Arabic.
 *
 * The toast sits on `--ui-toast` with a `--ui-toast-rule` edge, not on the
 * card surface: identical to the card white and its hairline in light, but in
 * dark a drop shadow cannot be seen on a dark page and a toast on
 * `--ui-surface` read as part of the top bar it covers at 1440 (both oklch
 * 0.22, edge 1.37:1). There the fill is one step lighter and the edge is the
 * strong rule. The action button wears the ink control's edge
 * (`ui.surface.inkControl`): `--ui-ink-edge`, a ring that exists only in
 * dark, where the navy fill measured 1.25:1 against the toast. That class is
 * not `!`: Sonner sets no box-shadow on a button at rest, so it applies, and
 * Sonner's own `:focus-visible` ring still replaces it on focus.
 *
 * Light toasts are a deliberate change from before BG-0149: they used to be
 * Sonner's default (8px corners, 13px type, near-black action button)
 * because none of these classes applied; they now wear the kit.
 *
 * The landmark around the toasts and a toast's close button are named from
 * the dictionaries: sonner's own names are English ("Notifications",
 * "Close toast"), which is what an Arabic screen reader announced.
 */
const TOASTER_STYLE = {
  "--normal-bg": "var(--ui-toast)",
  "--normal-text": "var(--ui-on-surface)",
  "--normal-border": "var(--ui-toast-rule)",
} as CSSProperties;

const Toaster = ({ ...props }: ToasterProps) => {
  const { t } = useI18n();
  const { resolved } = useTheme();
  return (
    <Sonner
      className="toaster group"
      position="top-center"
      offset={16}
      duration={3600}
      gap={8}
      containerAriaLabel={t("toast.region")}
      theme={resolved}
      style={TOASTER_STYLE}
      toastOptions={{
        closeButtonAriaLabel: t("toast.close"),
        classNames: {
          toast: [
            "group toast pointer-events-auto",
            "group-[.toaster]:!bg-[color:var(--ui-toast)]",
            "group-[.toaster]:!text-[color:var(--ui-on-surface)]",
            "group-[.toaster]:!border group-[.toaster]:!border-[color:var(--ui-toast-rule)]",
            "group-[.toaster]:!rounded-[var(--ui-radius-sheet)]",
            // A drop below the toast, not `--ui-shadow-overlay`: that one is
            // cast upwards, for a sheet rising from the bottom edge, and these
            // hang from the top.
            "group-[.toaster]:!shadow-[var(--ui-shadow-lifted)]",
            "group-[.toaster]:!px-4 group-[.toaster]:!py-3",
            "group-[.toaster]:![font-family:var(--ui-font-body)]",
            "group-[.toaster]:!text-[length:var(--ui-text-secondary)] group-[.toaster]:![font-weight:var(--ui-weight-strong)]",
          ].join(" "),
          title: "!text-[color:var(--ui-on-surface)] ![font-weight:var(--ui-weight-heavy)]",
          description:
            "group-[.toast]:!text-[color:var(--ui-on-surface-muted)] text-[length:var(--ui-text-meta)] mt-0.5",
          actionButton:
            "group-[.toast]:!bg-[color:var(--ui-ink)] group-[.toast]:!text-[color:var(--ui-on-ink-plain)] group-[.toast]:shadow-[inset_0_0_0_1px_var(--ui-ink-edge)] group-[.toast]:!rounded-full group-[.toast]:!px-3 group-[.toast]:!h-auto group-[.toast]:!py-1.5 group-[.toast]:!text-[length:var(--ui-text-meta)] group-[.toast]:![font-weight:var(--ui-weight-heavy)]",
          cancelButton:
            "group-[.toast]:!bg-[color:var(--ui-surface-sunken)] group-[.toast]:!text-[color:var(--ui-on-surface)] group-[.toast]:!rounded-full group-[.toast]:!px-3 group-[.toast]:!h-auto group-[.toast]:!py-1.5 group-[.toast]:!text-[length:var(--ui-text-meta)]",
          success:
            "group-[.toaster]:!border-s-4 group-[.toaster]:!border-s-[color:var(--ui-positive)]",
          error:
            "group-[.toaster]:!border-s-4 group-[.toaster]:!border-s-[color:var(--ui-negative)]",
          warning:
            "group-[.toaster]:!border-s-4 group-[.toaster]:!border-s-[color:var(--ui-caution)]",
          info: "group-[.toaster]:!border-s-4 group-[.toaster]:!border-s-[color:var(--ui-ink-fg)]",
          loading:
            "group-[.toaster]:!border-s-4 group-[.toaster]:!border-s-[color:var(--ui-on-surface-faint)]",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
