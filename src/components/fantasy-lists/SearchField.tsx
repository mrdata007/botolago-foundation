import { Search } from "lucide-react";

import { ui, UiInput } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

/**
 * The Option A search field: a round 48px box with a magnifier on the inline
 * start. The outline is `--ui-rule-strong` rather than the hairline — the
 * boundary of a field has to be seen (≥ 3:1), and on the page surface the
 * hairline is 1.2:1. The placeholder doubles as the accessible name, since
 * the boards give the field no visible label.
 */
export function SearchField({
  value,
  onChange,
  label,
  className,
}: {
  value: string;
  onChange: (next: string) => void;
  label: string;
  className?: string;
}) {
  return (
    <UiInput
      type="search"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={label}
      aria-label={label}
      className={className}
      leading={<Search className={cn("h-5 w-5", ui.tone.muted)} aria-hidden />}
      fieldClassName={cn(
        ui.radius.full,
        "min-h-[var(--ui-row-min)] border-[color:var(--ui-rule-strong)] pe-4 ps-11",
      )}
    />
  );
}
