import { useState } from "react";
import { useI18n } from "@/i18n/provider";
import { dictionaries } from "@/i18n/dictionaries";
import type { Language } from "@/types/domain";
import { Logo } from "@/components/brand/Logo";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ui, UiButton } from "@/components/ui-kit";

/**
 * The very first screen a new visitor sees, and until now the loudest
 * surviving piece of Design System V2: a 24px-radius frosted panel
 * (`glass-surface glass-strong`, `border-white/20`, `shadow-2xl`) over a
 * blurred brand scrim, with `bg-white/40` option tiles and a `cta-brand`
 * pill. Every one of those is light-only and none of it exists anywhere
 * else in the product any more.
 *
 * It now uses the kit: an opaque overlay on `--ui-surface`, the kit radii, the
 * kit type scale and the kit's ink/gradient pairings, so the first thing a
 * visitor sees is the same product as the second thing.
 *
 * It is NOT `UiModal`, and must not become one. This is a mandatory language
 * gate: `UiModal` always renders a close control, closes on Escape and closes
 * on an outside interaction, and all three of those are exactly what the
 * three `preventDefault` handlers below exist to stop. So the Radix dialog
 * stays hand-rolled here and wears the kit's overlay clothing — the same
 * scrim token, the same sheet radius and the same elevation `UiModal` uses —
 * rather than being replaced by it.
 */

export function FirstLaunchLanguage() {
  const { isHydrated, hasChosen, setLanguage } = useI18n();
  const [selected, setSelected] = useState<Language>("fr");

  if (!isHydrated || hasChosen) return null;

  const options: { code: Language; native: string; sub: string; dir: "ltr" | "rtl" }[] = [
    { code: "fr", native: "Français", sub: dictionaries.fr["app.tagline"], dir: "ltr" },
    { code: "ar", native: "العربية", sub: dictionaries.ar["app.tagline"], dir: "rtl" },
  ];

  return (
    <DialogPrimitive.Root open modal>
      <DialogPrimitive.Portal>
        {/* `--ui-scrim` IS the dim behind a sheet or a modal, and it is themed
            (ink 45% light, near-black 68% dark). This was a hand-mixed
            `--ui-ink-deep` at 70%, i.e. a second spelling of the one token the
            kit's own scrim uses. The blur stays: it is this gate's texture,
            not a colour. */}
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[color:var(--ui-scrim)] backdrop-blur-md motion-safe:animate-in motion-safe:fade-in-0" />
        <DialogPrimitive.Content
          className={cn(
            "fixed start-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 p-6 rtl:translate-x-1/2",
            // `ui.surface.card` + `--ui-shadow-raised` was a card pretending to
            // be an overlay: the control radius (6px) where the radius set says
            // a modal is `--ui-radius-sheet` (16px), and the elevation of a bar
            // lifted off content rather than the one for a surface above a
            // scrim. This is what `UiModal` paints.
            ui.surface.overlay,
            ui.radius.sheet,
          )}
          onEscapeKeyDown={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <div className="flex items-center justify-center pb-4">
            <Logo />
          </div>
          <DialogPrimitive.Title className={cn("text-center", ui.text.hero, ui.tone.default)}>
            {dictionaries.fr["language.choose_title"]}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description
            className={cn("mt-1 text-center", ui.text.secondary, ui.tone.muted)}
            dir="rtl"
          >
            {dictionaries.ar["language.choose_title"]}
          </DialogPrimitive.Description>

          <div className="mt-6 grid gap-3">
            {options.map((o) => {
              const active = selected === o.code;
              return (
                <button
                  key={o.code}
                  type="button"
                  dir={o.dir}
                  onClick={() => setSelected(o.code)}
                  className={cn(
                    "flex items-center justify-between px-4 py-3 text-start transition-colors",
                    ui.space.tap,
                    ui.radius.control,
                    ui.focus,
                    active
                      ? cn(ui.surface.ink, "shadow-[var(--ui-shadow-card)]")
                      : cn(ui.surface.sunken, ui.rule.all),
                  )}
                >
                  <div className="min-w-0">
                    <div className={ui.text.bodyStrong}>{o.native}</div>
                    {/* The quieter step of a foreground ON an ink fill: the kit
                        has `--ui-on-ink` and `--ui-on-ink-plain` but no muted
                        step for either, so the selected tile dims its own
                        inherited colour instead of naming a second one. The
                        unselected tile is on a surface and uses the token. */}
                    <div
                      className={cn(
                        "truncate",
                        ui.text.meta,
                        active ? "opacity-80" : ui.tone.muted,
                      )}
                    >
                      {o.sub}
                    </div>
                  </div>
                  <span
                    className={cn(
                      "grid h-6 w-6 shrink-0 place-items-center transition-colors",
                      active
                        ? // BG-0083: this was `text-[color:var(--ui-ink)]`, and
                          // `--ui-ink` is a fill, never a foreground. The plate
                          // is the cyan `--ui-on-ink`, so the tick takes the
                          // foreground the kit pairs with that cyan wherever it
                          // appears as a fill — `--ui-ink-deep`, which is dark
                          // in both themes, where `--ui-ink-fg` is a light tint
                          // in dark and would vanish into the plate.
                          "bg-[color:var(--ui-on-ink)] text-[color:var(--ui-ink-deep)]"
                        : // `ui.surface.card` was painting this 24px plate, and
                          // it carries the card radius and the card shadow.
                          // `cn()` merges last-wins, so its 6px radius beat the
                          // `ui.radius.full` above it and the unselected plate
                          // rendered as a rounded square beside a circle.
                          // `ui.surface.bar` is the same opaque surface with no
                          // radius and no elevation of its own.
                          cn(ui.surface.bar, ui.rule.all),
                      ui.radius.full,
                    )}
                    aria-hidden
                  >
                    {active && <Check className="h-3.5 w-3.5" />}
                  </span>
                </button>
              );
            })}
          </div>

          {/* The gate's one action. It was a hand-rolled copy of
              `UiButton variant="gradient"` — the same action gradient, the
              same `--ui-ink-deep` foreground, the same row height, radius,
              type and focus ring — so it is the primitive now. Only the hover
              brightness is local, because the kit's button does not carry one.
              A primitive is safe here in a way `UiModal` is not: it paints,
              it does not take the dialog's dismissal behaviour away. */}
          <UiButton onClick={() => setLanguage(selected)} className="mt-6 hover:brightness-105">
            {selected === "ar"
              ? dictionaries.ar["language.continue"]
              : dictionaries.fr["language.continue"]}
          </UiButton>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
