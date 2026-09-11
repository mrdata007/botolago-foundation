import { useI18n } from "@/i18n/provider";
import { IS_DEMO_MODE } from "@/config/app-mode";
import { IS_MOCK_AUTH } from "@/services/auth";

export function AuthModeBadge() {
  const { t } = useI18n();

  if (IS_DEMO_MODE) {
    return (
      <aside
        aria-label={t("app.demo_label")}
        data-testid="demo-data-notice"
        className="relative z-50 w-full border-b border-amber-300/40 bg-slate-950 px-3 py-2 text-center text-[11px] font-bold leading-4 text-amber-100 shadow-lg sm:text-xs"
      >
        {t("app.demo_notice")}
      </aside>
    );
  }

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
