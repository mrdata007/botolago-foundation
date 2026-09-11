import { IS_DEMO_MODE } from "@/config/app-mode";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

/**
 * Design System V2 — Live indicator.
 *
 * The hosted demo intentionally labels the synthetic clock as a simulation and
 * removes the live pulse. Live deployments keep the restrained brand-red pulse.
 */
export function LiveIndicator({
  minute,
  size = "sm",
  className,
}: {
  minute?: number;
  size?: "sm" | "md";
  className?: string;
}) {
  const { t } = useI18n();
  const label = t(IS_DEMO_MODE ? "matches.status.simulation" : "matches.status.live");
  const sizes = size === "md" ? "px-2 py-0.5 text-[11px]" : "px-1.5 py-0.5 text-[10px]";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-black uppercase tracking-[0.14em]",
        IS_DEMO_MODE
          ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
          : "bg-[color:color-mix(in_oklab,var(--color-live)_14%,transparent)] text-[color:var(--color-live)]",
        sizes,
        className,
      )}
    >
      <span className="relative inline-flex h-1.5 w-1.5 items-center justify-center" aria-hidden>
        {!IS_DEMO_MODE && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[color:var(--color-live)] opacity-60 motion-reduce:hidden" />
        )}
        <span
          className={cn(
            "relative inline-flex h-1.5 w-1.5 rounded-full",
            IS_DEMO_MODE ? "bg-amber-500" : "bg-[color:var(--color-live)]",
          )}
        />
      </span>
      <span>{label}</span>
      {typeof minute === "number" && <span className="tabular-nums">{minute}′</span>}
    </span>
  );
}
