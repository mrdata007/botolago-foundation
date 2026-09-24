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

export { ui, UI_TOKENS, UI_THEMED_TOKENS, UI_DERIVED_TOKENS, type UiToken } from "./tokens";
export {
  UiAlert,
  UiBackButton,
  UiBadge,
  UiBanner,
  UiButton,
  UiCard,
  UiCheckbox,
  UiChip,
  UiDifficultyCell,
  UiDivider,
  UiEmptyState,
  UiErrorState,
  UiHeader,
  UiIconButton,
  UiIconLinkButton,
  UiInput,
  UiKeyValueRow,
  UiLinkButton,
  UiLivePill,
  UiMenu,
  UiMenuItem,
  UiModal,
  UiPageTitle,
  UiPill,
  UiPitchSurface,
  UiPlayerPlate,
  UiPlayerRow,
  UiRankMovement,
  UiScreen,
  UiSegmented,
  UiSelect,
  UiSheet,
  UiSkeleton,
  UiStatBlock,
  UiStatePanel,
  UiTable,
  UiTabs,
  UiTBody,
  UiTD,
  UiTH,
  UiTextarea,
  UiTHead,
  UiTR,
  type UiAlertTone,
  type UiButtonSize,
  type UiButtonTone,
  type UiButtonVariant,
  type UiDifficulty,
  type UiIconButtonVariant,
  type UiSegmentedSize,
  type UiStatSize,
} from "./primitives";
