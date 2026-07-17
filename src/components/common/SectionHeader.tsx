import type { ReactNode } from "react";

export function SectionHeader({
  title,
  action,
  subtitle,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-3 pt-6 pb-3">
      <div className="min-w-0">
        <h2 className="truncate text-lg font-black tracking-tight text-foreground">{title}</h2>
        {subtitle && <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
