// Design System V2 — Top bar.
// Glass surface with soft elevation and safe-area padding.

import { Logo } from "@/components/brand/Logo";
import { LanguageSwitcher } from "./LanguageSwitcher";

export function TopBar({ trailing }: { trailing?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-30 pt-[max(env(safe-area-inset-top),0.25rem)]">
      <div
        className="surface-4 mx-3 mt-2 flex items-center gap-3 px-3 py-2"
        style={{ boxShadow: "var(--shadow-navigation)" }}
      >
        <Logo />
        <div className="ms-auto flex items-center gap-2">
          {trailing}
          <LanguageSwitcher />
        </div>
      </div>
    </header>
  );
}
