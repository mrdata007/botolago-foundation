import { useEffect, useRef } from "react";

import { ui, UiInput } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

/**
 * What a copy button shows when the clipboard refused (permission denied, no
 * clipboard in this in-app browser, a page that is not secure): the sentence
 * that says so, and the text in a read-only field that is selected when it is
 * tapped, so the person can copy it with the phone's own menu. Never shown on
 * success, and never a silent no-op: the link an invite needs is otherwise
 * nowhere on screen.
 *
 * `dir="auto"` on the field: a bare link starts with Latin letters and reads
 * left to right in both languages, an Arabic message that ends with one reads
 * right to left, as WhatsApp will show it.
 */
export function ManualCopyField({ value, className }: { value: string; className?: string }) {
  const { t } = useI18n();
  const ref = useRef<HTMLInputElement>(null);
  // Selected as it appears, so one tap on "Copy" in the phone's menu is enough.
  useEffect(() => {
    const field = ref.current;
    if (!field) return;
    field.focus({ preventScroll: true });
    field.select();
  }, [value]);
  return (
    <div className={cn("flex flex-col gap-1", className)} data-testid="manual-copy">
      <p role="status" className={cn(ui.text.meta, ui.tone.default)}>
        {t("pepites.share.copy_manual")}
      </p>
      <UiInput
        ref={ref}
        readOnly
        dir="auto"
        value={value}
        aria-label={t("pepites.share.copy_manual_label")}
        onFocus={(event) => event.currentTarget.select()}
        onClick={(event) => event.currentTarget.select()}
        data-testid="manual-copy-field"
      />
    </div>
  );
}
