import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * Design System V2 — Toaster.
 *
 * Glass surface, semantic tokens, and type-specific accent stripes for
 * success / warning / error / info. Duration and animation timing are
 * standardized; prefers-reduced-motion is respected globally via styles.css.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      position="top-center"
      offset={16}
      duration={3600}
      gap={8}
      toastOptions={{
        classNames: {
          toast: [
            "group toast pointer-events-auto",
            "group-[.toaster]:bg-[color:var(--glass-bg-strong)]",
            "group-[.toaster]:text-[color:var(--text-primary)]",
            "group-[.toaster]:border group-[.toaster]:border-[color:var(--glass-border)]",
            "group-[.toaster]:rounded-2xl",
            "group-[.toaster]:shadow-[var(--shadow-floating)]",
            "group-[.toaster]:backdrop-blur-xl group-[.toaster]:backdrop-saturate-150",
            "group-[.toaster]:px-4 group-[.toaster]:py-3",
            "group-[.toaster]:text-sm group-[.toaster]:font-medium",
          ].join(" "),
          title: "text-[color:var(--text-primary)] font-semibold",
          description: "group-[.toast]:text-[color:var(--text-muted)] text-xs mt-0.5",
          actionButton:
            "group-[.toast]:bg-[color:var(--brand-accent)] group-[.toast]:text-[color:var(--primary-foreground)] group-[.toast]:rounded-lg group-[.toast]:px-3 group-[.toast]:py-1.5 group-[.toast]:text-xs group-[.toast]:font-semibold",
          cancelButton:
            "group-[.toast]:bg-[color:var(--surface-hover)] group-[.toast]:text-[color:var(--text-secondary)] group-[.toast]:rounded-lg group-[.toast]:px-3 group-[.toast]:py-1.5 group-[.toast]:text-xs",
          success:
            "group-[.toaster]:border-l-4 group-[.toaster]:border-l-[color:var(--color-success)]",
          error:
            "group-[.toaster]:border-l-4 group-[.toaster]:border-l-[color:var(--color-danger)]",
          warning:
            "group-[.toaster]:border-l-4 group-[.toaster]:border-l-[color:var(--color-warning)]",
          info: "group-[.toaster]:border-l-4 group-[.toaster]:border-l-[color:var(--brand-accent)]",
          loading:
            "group-[.toaster]:border-l-4 group-[.toaster]:border-l-[color:var(--text-muted)]",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
