import { ADMIN_PANEL_CLASS } from "@/components/admin/AdminSurfaces";
import type { EditorialMoveCopy } from "@/components/admin/editorial-move";
import { ui, UiButton, UiModal } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

/**
 * The article editor's confirmation before a status move: the kit's centred
 * modal (`UiModal`, "confirmations and short forms"), not `window.confirm`,
 * which could not be translated, styled, or name the article.
 *
 * It names the article by its headline, set in the article's own direction
 * on a sunken panel so an Arabic headline reads right to left inside a French
 * console, and says what the move does on the site (`editorial-move.ts`). The
 * commit names the act -- "Publier", or "Enregistrer et publier" when the
 * edits on screen are saved first -- and wears the filled negative for the
 * moves that take an article off the site or end its run. Backing out is
 * "Abandonner", the console's word for it, as in `AdminDestructiveAction`.
 */
export function EditorialMoveDialog({
  open,
  onOpenChange,
  copy,
  headline,
  headlineDir,
  destructive,
  busy,
  onCommit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  copy: EditorialMoveCopy;
  headline: string;
  headlineDir: "ltr" | "rtl";
  destructive: boolean;
  busy: boolean;
  onCommit: () => void;
}) {
  return (
    <UiModal
      open={open}
      onOpenChange={onOpenChange}
      title={copy.title}
      description={copy.description}
      footer={
        <>
          <UiButton
            variant={destructive ? "destructive" : "gradient"}
            disabled={busy}
            onClick={onCommit}
            data-testid="admin-news-move-commit"
          >
            {copy.commit}
          </UiButton>
          <UiButton
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid="admin-news-move-abandon"
          >
            {copy.abandon}
          </UiButton>
        </>
      }
    >
      <div data-testid="admin-news-move-dialog">
        <p
          dir={headlineDir}
          className={cn(
            ADMIN_PANEL_CLASS,
            "break-words px-3 py-2",
            ui.text.bodyStrong,
            ui.tone.default,
          )}
          data-testid="admin-news-move-headline"
        >
          {headline}
        </p>
        {copy.unsavedNote && (
          <p
            className={cn("mt-3", ui.text.secondary, ui.tone.default)}
            data-testid="admin-news-move-unsaved"
          >
            {copy.unsavedNote}
          </p>
        )}
      </div>
    </UiModal>
  );
}
