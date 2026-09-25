import { Toaster as Sonner } from "sonner";

import { useI18n } from "@/i18n/provider";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * Design System V2 — Toaster.
 *
 * Glass surface, semantic tokens, and type-specific accent stripes for
 * success / warning / error / info. Duration and animation timing are
 * standardized; prefers-reduced-motion is respected globally via styles.css.
 *
 * The landmark around the toasts and a toast's close button are named from
 * the dictionaries: sonner's own names are English ("Notifications",
 * "Close toast"), which is what an Arabic screen reader announced.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const { t } = useI18n();
  return (
    <Sonner
      className="toaster group"
      position="top-center"
      offset={16}
      duration={3600}
      gap={8}
      containerAriaLabel={t("toast.region")}
      toastOptions={{
        closeButtonAriaLabel: t("toast.close"),
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
            "group-[.toaster]:border-s-4 group-[.toaster]:border-s-[color:var(--color-success)]",
          error:
            "group-[.toaster]:border-s-4 group-[.toaster]:border-s-[color:var(--color-danger)]",
          warning:
            "group-[.toaster]:border-s-4 group-[.toaster]:border-s-[color:var(--color-warning)]",
          info: "group-[.toaster]:border-s-4 group-[.toaster]:border-s-[color:var(--brand-accent)]",
          loading:
            "group-[.toaster]:border-s-4 group-[.toaster]:border-s-[color:var(--text-muted)]",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
