import { useRef, useState, type KeyboardEvent } from "react";
import { toast } from "sonner";

import { ManagerCard } from "@/components/manager-card/ManagerCard";
import type { CardProfile } from "@/components/manager-card/types";
import { radioKeyTarget } from "@/components/shell/radio-keys";
import { ui, UiButton, UiSheet } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import {
  isCardEdition,
  useChooseCardDesign,
  type CardEditionCode,
} from "@/services/use-card-design";

import { usePlusCopy } from "./plus-copy";
import { CARD_STYLES, editionLabel, editionOf } from "./plus-card-style";

/**
 * « Style de la carte » for a member: the card, live, in the style under the finger, and the
 * choice saved with « Enregistrer » through `api.choose_card_design`. Not the sales step: nothing
 * here sells anything, and the standard card is always a way back.
 */
export function PlusStylePicker({
  open,
  onOpenChange,
  profile,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: CardProfile;
}) {
  const { t, lang } = usePlusCopy();
  const current = editionOf(profile);
  const [picked, setPicked] = useState<CardEditionCode>(current);
  const [failed, setFailed] = useState(false);
  const choose = useChooseCardDesign();
  const refs = useRef<Partial<Record<CardEditionCode, HTMLButtonElement | null>>>({});

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = radioKeyTarget(CARD_STYLES, event, picked, lang === "ar");
    if (target === null) return;
    event.preventDefault();
    event.stopPropagation();
    setPicked(target);
    refs.current[target]?.focus();
  };

  const save = () => {
    setFailed(false);
    choose.mutate(picked, {
      onSuccess: (result) => {
        if (result.status === "ok") {
          toast.success(t("plus.pick.saved"));
          onOpenChange(false);
        } else {
          toast.info(t("plus.pick.unavailable"));
        }
      },
      onError: () => setFailed(true),
    });
  };

  // A fresh open starts from the card's own style, not from a choice that was never saved.
  const onOpen = (next: boolean) => {
    if (next) {
      setPicked(current);
      setFailed(false);
    }
    onOpenChange(next);
  };

  const shown: CardProfile = { ...profile, edition: undefined };
  if (picked !== "standard" && isCardEdition(picked)) shown.edition = picked;

  return (
    <UiSheet
      open={open}
      onOpenChange={onOpen}
      title={t("plus.pick.title")}
      footer={
        <div className="flex flex-col gap-2 px-4 pb-3">
          {failed ? (
            <p role="alert" className={cn("text-pretty", ui.text.secondary, ui.tone.default)}>
              {t("plus.pick.failed")}
            </p>
          ) : null}
          <UiButton
            onClick={save}
            disabled={choose.isPending || picked === current}
            data-testid="plus-pick-save"
          >
            {choose.isPending ? t("plus.pick.saving") : t("plus.pick.save")}
          </UiButton>
        </div>
      }
    >
      <div className="flex flex-col items-center gap-4 px-4 py-4" data-testid="plus-style-picker">
        <div
          role="img"
          aria-label={t("plus.pick.preview").replace("{style}", editionLabel(t, picked))}
          className="mx-auto"
        >
          <ManagerCard profile={shown} width={200} />
        </div>
        <div
          role="radiogroup"
          aria-label={t("plus.pick.title")}
          onKeyDown={onKeyDown}
          className="grid w-full grid-cols-2 gap-2"
        >
          {CARD_STYLES.map((style) => {
            const on = style === picked;
            return (
              <button
                key={style}
                ref={(node) => {
                  refs.current[style] = node;
                }}
                type="button"
                role="radio"
                aria-checked={on}
                tabIndex={on ? 0 : -1}
                onClick={() => setPicked(style)}
                className={cn(
                  "min-h-12 px-3 py-2 text-start transition-colors",
                  ui.radius.card,
                  on
                    ? "border-2 border-[color:var(--ui-ink-fg)] bg-[color:var(--ui-surface-sunken)]"
                    : "border border-[color:var(--ui-rule)]",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ui-ink-fg)]",
                )}
              >
                <span className={cn("block", ui.text.bodyStrong, ui.tone.default)}>
                  {editionLabel(t, style)}
                </span>
                {style === "standard" ? (
                  <span className={cn("block text-pretty", ui.text.meta, ui.tone.muted)}>
                    {t("plus.pick.standard_d")}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </UiSheet>
  );
}
