import { ArrowLeft, ArrowRight } from "lucide-react";

import { useI18n } from "@/i18n/provider";

import "./plus-trophies.css";

/** The « ‹ Trophées » button of the detail and frame views (the arrow points the reader's way back). */
export function PlusBackButton({ label, onClick }: { label: string; onClick: () => void }) {
  const { dir } = useI18n();
  const Arrow = dir === "rtl" ? ArrowRight : ArrowLeft;
  return (
    <div className="tr-bar">
      <button type="button" className="tr-back" onClick={onClick} data-testid="trophy-back">
        <Arrow aria-hidden />
        {label}
      </button>
    </div>
  );
}
