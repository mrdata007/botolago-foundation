// Development-only badge shown when explicit mock auth mode is active.
// Silent in production Supabase mode.
import { IS_MOCK_AUTH } from "@/services/auth";
import { useI18n } from "@/i18n/provider";

export function AuthModeBadge() {
  const { t } = useI18n();
  if (!IS_MOCK_AUTH) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed bottom-2 start-2 z-[100] rounded-full bg-amber-500/90 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-black shadow-lg"
    >
      {t("auth.mode.mock")}
    </div>
  );
}
