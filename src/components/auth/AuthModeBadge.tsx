// Development-only badge shown when explicit mock auth mode is active.
// Silent in production Supabase mode.
import { IS_MOCK_AUTH } from "@/services/auth";
import { useI18n } from "@/i18n/provider";
import { ui } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

export function AuthModeBadge() {
  const { t } = useI18n();
  if (!IS_MOCK_AUTH) return null;
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none fixed bottom-2 start-2 z-[100] px-2 py-0.5",
        ui.radius.full,
        ui.text.label,
        // The kit's caution token rather than a raw amber, so the badge stays
        // legible in dark mode too.
        "bg-[color:var(--ui-caution)] text-[color:var(--ui-ink-deep)] shadow-[var(--ui-shadow-card)]",
      )}
    >
      {t("auth.mode.mock")}
    </div>
  );
}
