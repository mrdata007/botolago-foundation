import { useId, useRef, useState, type KeyboardEvent } from "react";
import { useI18n } from "@/i18n/provider";
import { fr } from "@/i18n/dictionary-fr";
import { CHOOSER_ARABIC } from "@/i18n/language-chooser-copy";
import { RetryLabel } from "@/i18n/language-load-notice";
import type { Language } from "@/types/domain";
import { Logo } from "@/components/brand/Logo";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ui, UiAlert, UiButton } from "@/components/ui-kit";
import { radioKeyTarget } from "./radio-keys";

const OPTIONS: readonly { code: Language; native: string; sub: string; dir: "ltr" | "rtl" }[] = [
  { code: "fr", native: "Français", sub: fr["app.tagline"], dir: "ltr" },
  { code: "ar", native: "العربية", sub: CHOOSER_ARABIC["app.tagline"], dir: "rtl" },
];
const CODES = OPTIONS.map((option) => option.code);

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
 * visitor sees is the same product as the second thing. In Option A that
 * means the display face for the title, 14px option tiles, white-on-navy for
 * the chosen one (the selected-chip pairing) and the action gradient behind
 * its tick — the bottom nav's "you are here" pill in miniature.
 *
 * It is NOT `UiModal`, and must not become one. This is a mandatory language
 * gate: `UiModal` always renders a close control, closes on Escape and closes
 * on an outside interaction, and all three of those are exactly what the
 * three `preventDefault` handlers below exist to stop. So the Radix dialog
 * stays hand-rolled here and wears the kit's overlay clothing — the same
 * scrim token, the same sheet radius and the same elevation `UiModal` uses —
 * rather than being replaced by it.
 *
 * The two tiles are a radio group (audit 2026-09-25, A12). They were plain
 * buttons, and the tick that marks the chosen one is decoration, so a screen
 * reader heard two names and no choice. A radio group rather than a pair of
 * `aria-pressed` toggles because that is what this is: exactly one of two is
 * always chosen, and nothing happens until "Continuer" — a toggle says "this
 * is on", not "this one instead of that one". So the pattern's keyboard
 * comes with it: one tab stop (the chosen tile), and the arrows move the
 * choice (`radio-keys.ts`).
 *
 * The gate closes only once the chosen language can be shown (audit
 * 2026-09-25, A10). Choosing Arabic downloads its dictionary; until it is
 * here the button waits, and if it does not come the gate says so in both
 * languages and the button becomes a retry, named in both too. Every line of
 * that is in `CHOOSER_ARABIC` or the French dictionary, so none of it needs
 * the download that failed.
 */

export function FirstLaunchLanguage() {
  const { isHydrated, hasChosen, dir, loadingLanguage, failedLanguage, setLanguage } = useI18n();
  const [selected, setSelected] = useState<Language>("fr");

  if (!isHydrated || hasChosen) return null;

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
          <LanguageChoice
            selected={selected}
            onSelect={setSelected}
            // Only Arabic is ever downloaded, so only the Arabic tile can be
            // waiting or have failed.
            waiting={loadingLanguage === selected}
            failed={failedLanguage === selected}
            rtl={dir === "rtl"}
            onConfirm={() => setLanguage(selected)}
          />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/**
 * What the gate shows, apart from the dialog around it, so the tests can draw
 * it (`react-dom/server` does not render a portal). It needs a Radix dialog
 * above it for its title and description.
 */
export function LanguageChoice({
  selected,
  onSelect,
  waiting,
  failed,
  rtl,
  onConfirm,
}: {
  selected: Language;
  onSelect: (lang: Language) => void;
  /** The chosen language's dictionary is on its way. */
  waiting: boolean;
  /** The chosen language's dictionary did not arrive. */
  failed: boolean;
  rtl: boolean;
  onConfirm: () => void;
}) {
  const titleId = useId();
  const subtitleId = useId();
  const tiles = useRef<Partial<Record<Language, HTMLButtonElement | null>>>({});
  // The button speaks the language of the chosen tile.
  const copy = selected === "ar" ? CHOOSER_ARABIC : fr;

  const onTileKeyDown = (event: KeyboardEvent<HTMLButtonElement>, from: Language) => {
    const target = radioKeyTarget(CODES, event, from, rtl);
    if (target === null) return;
    event.preventDefault();
    onSelect(target);
    tiles.current[target]?.focus();
  };

  return (
    <>
      <div className="flex items-center justify-center pb-4">
        <Logo />
      </div>
      {/* The inner spans carry ids of their own for the radio group's
          name: Radix gives the title and description theirs, for the
          dialog, and an id passed to them would break that link. */}
      <DialogPrimitive.Title className={cn("text-center", ui.display.title, ui.tone.default)}>
        <span id={titleId}>{fr["language.choose_title"]}</span>
      </DialogPrimitive.Title>
      <DialogPrimitive.Description
        className={cn("mt-1 text-center", ui.text.secondary, ui.tone.muted)}
        dir="rtl"
        lang="ar"
      >
        <span id={subtitleId}>{CHOOSER_ARABIC["language.choose_title"]}</span>
      </DialogPrimitive.Description>

      <div
        role="radiogroup"
        aria-labelledby={`${titleId} ${subtitleId}`}
        className="mt-6 grid gap-3"
      >
        {OPTIONS.map((o) => {
          const active = selected === o.code;
          return (
            <button
              key={o.code}
              ref={(node) => {
                tiles.current[o.code] = node;
              }}
              type="button"
              role="radio"
              aria-checked={active}
              // One tab stop for the group, on the chosen tile; the
              // arrows reach the other.
              tabIndex={active ? 0 : -1}
              dir={o.dir}
              // Each tile is written in its own language, and says so, so
              // a screen reader reads "العربية" with an Arabic voice.
              lang={o.code}
              onClick={() => onSelect(o.code)}
              onKeyDown={(event) => onTileKeyDown(event, o.code)}
              className={cn(
                "flex items-center justify-between px-4 py-3 text-start transition-colors",
                ui.space.tap,
                ui.radius.card,
                ui.focus,
                active
                  ? cn(ui.surface.inkPlain, ui.shadow.card)
                  : cn(ui.surface.sunken, ui.rule.all),
              )}
            >
              <div className="min-w-0">
                <div className={ui.text.bodyStrong}>{o.native}</div>
                {/* The quieter step of a foreground ON an ink fill is a
                    token now (`--ui-on-ink-muted`, 8.4:1), so the selected
                    tile names it instead of dimming its own colour. The
                    unselected tile is on a surface and uses the muted one. */}
                <div
                  className={cn(
                    "truncate",
                    ui.text.meta,
                    active ? ui.tone.onInkMuted : ui.tone.muted,
                  )}
                >
                  {o.sub}
                </div>
              </div>
              <span
                className={cn(
                  "grid h-6 w-6 shrink-0 place-items-center transition-colors",
                  active
                    ? // The action gradient (set inline below — a
                      // background image) with the foreground the kit
                      // pairs with it everywhere: `--ui-ink-deep`, dark in
                      // both themes like the gradient under it. BG-0083:
                      // never `--ui-ink`, which is a fill.
                      "text-[color:var(--ui-ink-deep)]"
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
                style={active ? { backgroundImage: "var(--ui-grad-action)" } : undefined}
                // The tick is the picture of `aria-checked`; announcing
                // it as well would say the same thing twice.
                aria-hidden
              >
                {active && <Check className="h-3.5 w-3.5" />}
              </span>
            </button>
          );
        })}
      </div>

      {failed ? (
        <UiAlert tone="negative" className="mt-4">
          <span lang="fr" dir="ltr" className="block text-start">
            {fr["language.arabic_failed"]}
          </span>
          <span lang="ar" dir="rtl" className="mt-1 block text-start">
            {CHOOSER_ARABIC["language.arabic_failed"]}
          </span>
        </UiAlert>
      ) : null}
      {/* Said once when the wait starts; the button's own label changes
          too, but a change to the focused control's name is not reliably
          read out. Always in the tree, so the region exists before it
          has anything to say. */}
      <p role="status" className="sr-only">
        {waiting ? (
          <>
            <span lang="fr">{fr["language.arabic_loading"]}</span>{" "}
            <span lang="ar">{CHOOSER_ARABIC["language.arabic_loading"]}</span>
          </>
        ) : null}
      </p>
      {/* The gate's one action. It was a hand-rolled copy of
          `UiButton variant="gradient"` — the same action gradient, the
          same `--ui-ink-deep` foreground, the same row height, radius,
          type and focus ring — so it is the primitive now. Only the hover
          brightness is local, because the kit's button does not carry one.
          A primitive is safe here in a way `UiModal` is not: it paints,
          it does not take the dialog's dismissal behaviour away.
          While it waits it stays focusable (`aria-disabled`, not
          `disabled`): a disabled button drops focus to the page behind
          the dialog, and the reader would have to find their way back. */}
      <UiButton
        onClick={() => {
          if (!waiting) onConfirm();
        }}
        aria-disabled={waiting || undefined}
        // Retry is in both languages, like the alert above it: a reader who
        // tapped Arabic by mistake must be able to read the one way on.
        lang={failed && !waiting ? undefined : selected}
        className={cn("mt-6 hover:brightness-105", waiting && "cursor-progress")}
      >
        {waiting ? (
          <>
            <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden />
            {copy["language.arabic_loading"]}
          </>
        ) : failed ? (
          <RetryLabel />
        ) : (
          copy["language.continue"]
        )}
      </UiButton>
    </>
  );
}
