import { ui } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { focusMainContent, MAIN_CONTENT_ID } from "@/lib/skip-link";
import { cn } from "@/lib/utils";

/**
 * "Skip to content": the first stop of the Tab order in every shell, for a
 * keyboard reader who would otherwise cross the bar's links on each page.
 *
 * Invisible until it has focus, then a pill pinned to the top corner of the
 * screen (`fixed`, so showing it moves nothing; `start-3`, so it sits at the
 * leading edge in both directions). It is a real link to `#main-content`, so
 * it also works before the page's script has run; once it has, the click is
 * taken over to focus the `<main>` directly: a hash change would be a
 * navigation as far as the router is concerned (a history entry, a scroll
 * reset), and a skip is not one.
 */
export function SkipLink() {
  const { t } = useI18n();
  return (
    <a
      href={`#${MAIN_CONTENT_ID}`}
      onClick={(event) => {
        if (focusMainContent(document)) event.preventDefault();
      }}
      className={cn(
        "sr-only focus:not-sr-only focus:fixed focus:start-3 focus:z-[70]",
        "focus:top-[max(env(safe-area-inset-top),0.75rem)]",
        // The kit's 44px floor, once it is on screen (not while it is clipped).
        "focus:inline-flex focus:min-h-[var(--ui-tap-min)] focus:items-center focus:px-4",
        ui.radius.full,
        ui.text.meta,
        "[font-weight:var(--ui-weight-heavy)]",
        "bg-[color:var(--ui-surface)] text-[color:var(--ui-ink-fg)]",
        "shadow-[var(--ui-shadow-column)]",
        ui.focus,
      )}
    >
      {t("nav.skip_to_content")}
    </a>
  );
}
