import { AlertTriangle, Loader2, RotateCcw, X } from "lucide-react";

import { ui } from "@/components/ui-kit/tokens";
import { cn } from "@/lib/utils";
import { fr } from "./dictionary-fr";
import { CHOOSER_ARABIC } from "./language-chooser-copy";

/**
 * The notice a reader gets when Arabic was asked for outside the first-launch
 * chooser — a returning Arabic reader, or a switch from the menu — and its
 * dictionary did not arrive (audit 2026-09-25, A10). The page carries on in
 * French underneath, so nothing is taken from the reader: no scrim, focus
 * left where it is, and the notice stays until they retry or close it,
 * because the only retry must not time out from under them.
 *
 * It sits under the top bar, and under the live strip while that shows,
 * never over them. It was a sonner toast at the top of the screen, and at
 * 390px that covered the whole bar, the language switcher included — the
 * reader's other way out — with a 20px close button and a 24px action. Both
 * controls here are the kit's 44px.
 *
 * Both languages, from copy that ships with the page: the reader asked for
 * Arabic, and the Arabic dictionary is exactly what is missing.
 *
 * Plain elements wearing the kit's classes rather than `UiAlert`/`UiButton`:
 * the kit's primitives import `useI18n` from the provider that draws this
 * notice, so importing them here would close an import cycle. As on the 404
 * and error screens, that is not licence to paint something else: the card is
 * `UiAlert tone="negative"`, Retry is `UiButton variant="ink" size="sm"` and
 * the close control is `UiIconButton variant="ghost"`, class for class.
 */
export function LanguageLoadNotice({
  retrying,
  onRetry,
  onClose,
}: {
  /** A retry started here is on its way. */
  retrying: boolean;
  onRetry: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-x-0 z-40",
        "top-[calc(var(--topbar-h)+var(--livestrip-h)+0.5rem)]",
        ui.space.gutter,
      )}
    >
      <div
        className={cn(
          "pointer-events-auto mx-auto flex max-w-md items-start gap-3 p-3",
          ui.radius.control,
          // It floats over the page, which an inline `UiAlert` does not.
          ui.shadow.overlay,
        )}
        style={{
          backgroundColor: "color-mix(in oklab, var(--ui-negative) 14%, var(--ui-surface))",
          color: "var(--ui-on-surface)",
        }}
      >
        <span
          className="mt-0.5 shrink-0"
          style={{ color: retrying ? "var(--ui-ink-fg)" : "var(--ui-negative)" }}
          aria-hidden
        >
          {retrying ? (
            <Loader2 className="h-5 w-5 motion-safe:animate-spin" />
          ) : (
            <AlertTriangle className="h-5 w-5" />
          )}
        </span>
        <div className={cn("min-w-0 flex-1", ui.text.secondary, ui.tone.muted)}>
          {/* Both regions are always in the tree and only their words come
              and go, so a second failure after a retry is announced again. */}
          <div role="alert">{retrying ? null : bilingual("language.arabic_failed")}</div>
          <div role="status">{retrying ? bilingual("language.arabic_loading") : null}</div>
          <button
            type="button"
            // Stays focusable while it waits (`aria-disabled`, not
            // `disabled`), as the chooser's button does: a disabled button
            // drops focus to the page.
            aria-disabled={retrying || undefined}
            onClick={() => {
              if (!retrying) onRetry();
            }}
            className={cn(
              "mt-2 inline-flex items-center justify-center gap-2 [&_svg]:shrink-0",
              ui.radius.full,
              ui.focus,
              "min-h-[var(--ui-tap-min)] min-w-[var(--ui-tap-min)] px-3",
              "whitespace-nowrap text-center",
              ui.text.meta,
              "[font-weight:var(--ui-weight-heavy)]",
              "transition-[filter,opacity]",
              ui.surface.inkPlain,
              retrying && "cursor-progress",
            )}
          >
            {retrying ? (
              <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden />
            ) : (
              <RotateCcw className="h-4 w-4" aria-hidden />
            )}
            <RetryLabel />
          </button>
        </div>
        <button
          type="button"
          onClick={onClose}
          className={cn(
            "inline-grid shrink-0 place-items-center transition-[filter,opacity,background-color]",
            "[&_svg]:h-5 [&_svg]:w-5 [&_svg]:shrink-0",
            ui.space.tap,
            ui.radius.full,
            "bg-transparent hover:bg-[color:var(--ui-surface-sunken)]",
            ui.tone.ink,
            ui.focus,
          )}
        >
          <X aria-hidden />
          {/* Named in both languages, each in its own voice: an
              `aria-label` is one string in one language. */}
          <span className="sr-only">
            <span lang="fr">{fr["toast.close"]}</span>{" "}
            <span lang="ar">{CHOOSER_ARABIC["toast.close"]}</span>
          </span>
        </button>
      </div>
    </div>
  );
}

/**
 * "Réessayer · إعادة المحاولة", each word marked with its language. The dot
 * is only for the eye. Shared with the first-launch chooser's failed state.
 */
export function RetryLabel() {
  return (
    <span>
      <span lang="fr">{fr["state.retry"]}</span>
      <span aria-hidden>{" · "}</span>
      <span lang="ar">{CHOOSER_ARABIC["state.retry"]}</span>
    </span>
  );
}

/** A French line and its Arabic twin, each in its own language and direction. */
function bilingual(key: "language.arabic_failed" | "language.arabic_loading") {
  return (
    <>
      <span lang="fr" dir="ltr" className="block text-start">
        {fr[key]}
      </span>
      <span lang="ar" dir="rtl" className="mt-1 block text-start">
        {CHOOSER_ARABIC[key]}
      </span>
    </>
  );
}
