import type { ReactNode } from "react";
import { Trans } from "./Trans";

export function SectionHeader({
  title,
  action,
  subtitle,
  eyebrow,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  /** Optional short brand-blue label rendered above the title. */
  eyebrow?: string;
}) {
  return (
    <div className="flex items-end justify-between gap-3 pt-6 pb-3">
      <div className="min-w-0">
        {eyebrow && (
          <div className="mb-1 truncate text-[10px] font-black uppercase tracking-[0.14em] text-brand">
            {eyebrow}
          </div>
        )}
        <h2 className="truncate text-lg font-black tracking-tight text-foreground">
          <Trans text={title} />
        </h2>
        {subtitle && <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

