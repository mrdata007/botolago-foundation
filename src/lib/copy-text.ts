/**
 * Putting text on the clipboard, and telling the truth about it.
 *
 * `navigator.clipboard` is missing outside a secure context and in some
 * in-app browsers, and refuses (permission denied, no recent tap) in others.
 * Calling it without a guard and showing "copied" afterwards says so even when
 * nothing was copied. `copyText` answers `true` only when the text really went
 * to the clipboard: first through the Clipboard API, then through the old
 * `execCommand("copy")` on a selected text area, which in-app browsers and
 * plain-http pages still honour. When both fail it answers `false`, and the
 * caller must show the text so the person can copy it by hand.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.clipboard?.writeText === "function") {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Denied or unavailable: try the older route below.
  }
  return copyWithSelection(text);
}

function copyWithSelection(text: string): boolean {
  if (typeof document === "undefined" || !document.body) return false;
  const previous = document.activeElement as HTMLElement | null;
  // Inside an open dialog the text area must be inside it, or the dialog's
  // focus trap takes the focus (and the selection) straight back, while
  // `execCommand` still answers true for a selection nobody holds. The focus
  // may be on the body (a tap on a button does not always focus it), so the
  // host is the focused element's dialog, else the last open one, else the body.
  const dialogs = document.querySelectorAll?.('[role="dialog"]');
  const lastDialog = dialogs && dialogs.length > 0 ? dialogs[dialogs.length - 1] : null;
  const host = previous?.closest?.('[role="dialog"]') ?? lastDialog ?? document.body;
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.setAttribute("aria-hidden", "true");
  area.tabIndex = -1;
  // 16px, or iPhone Safari zooms the page when the area takes focus.
  area.style.cssText =
    "position:fixed;top:0;inset-inline-start:0;width:1px;height:1px;opacity:0;font-size:16px;";
  let copied = false;
  try {
    host.appendChild(area);
    area.focus({ preventScroll: true });
    area.select();
    area.setSelectionRange(0, text.length);
    // Counted only if the text area really holds the focus and the selection:
    // a copy of some other selection is not this text.
    copied = document.activeElement === area && document.execCommand("copy");
  } catch {
    copied = false;
  } finally {
    area.remove();
    try {
      previous?.focus?.({ preventScroll: true });
    } catch {
      // The control that had the focus is gone.
    }
  }
  return copied;
}
