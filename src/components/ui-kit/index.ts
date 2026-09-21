/**
 * BotolaGO UI Kit.
 *
 * The product's shared visual language, extracted from the Fantasy section
 * (the design source of truth) into tokens (`--ui-*`, declared in
 * `src/styles.css`), class tokens (`ui`) and primitives.
 *
 * Adopt it from a page with either level:
 *
 *   import { ui, UiCard, UiButton } from "@/components/ui-kit";
 *
 *   <UiCard><span className={ui.text.meta}>…</span></UiCard>
 *
 * Rules that hold for anything added here (see `ui-kit.contract.test.ts`):
 * logical properties only, every `tracking-*` `ltr:`-prefixed, and colours
 * from `--ui-*`/`currentColor` so light and dark both work.
 */

export { ui, UI_TOKENS, UI_THEMED_TOKENS, type UiToken } from "./tokens";
export {
  UiBadge,
  UiBanner,
  UiButton,
  UiCard,
  UiChip,
  UiDivider,
  UiHeader,
  UiKeyValueRow,
  UiLinkButton,
  UiPill,
  UiScreen,
  UiSegmented,
  UiSkeleton,
  UiStatePanel,
  type UiButtonSize,
  type UiButtonVariant,
} from "./primitives";
