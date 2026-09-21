import { useState } from "react";
import { useI18n } from "@/i18n/provider";
import { dictionaries } from "@/i18n/dictionaries";
import type { Language } from "@/types/domain";
import { Logo } from "@/components/brand/Logo";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ui } from "@/components/ui-kit";

/**
 * The very first screen a new visitor sees, and until now the loudest
 * surviving piece of Design System V2: a 24px-radius frosted panel
 * (`glass-surface glass-strong`, `border-white/20`, `shadow-2xl`) over a
 * blurred brand scrim, with `bg-white/40` option tiles and a `cta-brand`
 * pill. Every one of those is light-only and none of it exists anywhere
 * else in the product any more.
 *
 * It now uses the kit: an opaque card on `--ui-surface`, the kit radii, the
 * kit type scale and the kit's ink/gradient pairings, so the first thing a
 * visitor sees is the same product as the second thing.
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
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[color:color-mix(in_oklab,var(--ui-ink-deep)_70%,transparent)] backdrop-blur-md motion-safe:animate-in motion-safe:fade-in-0" />
        <DialogPrimitive.Content
          className={cn(
            "fixed start-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 p-6 rtl:translate-x-1/2",
            ui.surface.card,
            "shadow-[var(--ui-shadow-raised)]",
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
                      ui.radius.full,
                      active
                        ? "bg-[color:var(--ui-on-ink)] text-[color:var(--ui-ink)]"
                        : cn(ui.surface.card, ui.rule.all),
                    )}
                    aria-hidden
                  >
                    {active && <Check className="h-3.5 w-3.5" />}
                  </span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setLanguage(selected)}
            className={cn(
              "mt-6 w-full px-4 text-[color:var(--ui-ink-deep)]",
              "min-h-[var(--ui-row-min)]",
              ui.radius.control,
              ui.text.bodyStrong,
              ui.focus,
              "transition-[filter] hover:brightness-105",
            )}
            style={{ backgroundImage: "var(--ui-grad-action)" }}
          >
            {selected === "ar"
              ? dictionaries.ar["language.continue"]
              : dictionaries.fr["language.continue"]}
          </button>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
