import { Logo } from "@/components/brand/Logo";
import { LanguageSwitcher } from "./LanguageSwitcher";

export function TopBar({ trailing }: { trailing?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-30 pt-[max(env(safe-area-inset-top),0.25rem)]">
      <div className="glass-surface glass-strong mx-3 mt-2 flex items-center gap-3 rounded-2xl border border-[var(--glass-border)] px-3 py-2 shadow-sm shadow-black/5">
        <Logo />
        <div className="ms-auto flex items-center gap-2">
          {trailing}
          <LanguageSwitcher />
        </div>
      </div>
    </header>
  );
}
