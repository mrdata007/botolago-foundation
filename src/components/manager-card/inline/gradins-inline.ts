/**
 * The one door the existing Fantasy pages use to reach the card's inline surfaces. Every page
 * loads what it needs from here with `React.lazy` or a dynamic `import()` and only while the
 * section is live, so with the switch off no page downloads any of it.
 *
 * It is a module of its own, named for the section, for the built chunk's sake: the production
 * gate (`scripts/qa/manager-card-off-bundle-gate.ts`) lets the section's own chunks (`gradins-…`)
 * hold the card's code and fails any other chunk that reaches it. The surfaces below, the card
 * read's invalidation and the session's hero flag all land in this one lazy chunk (and the shared
 * card and data-layer chunks it imports), and nowhere else.
 */
export { CardHint } from "./CardHint";
export { BuilderReturnLine, CardSaveLine } from "./CardSaveLine";
export { FirstTransferLine } from "./FirstTransferLine";
export { GuestIntroCardPoint } from "./GuestIntroCardPoint";
export { HubCardBlock } from "./HubCardBlock";
export { LeagueCardBand, LeagueCompareLink } from "./LeagueCardBand";
export { LeagueRowMini } from "./LeagueRowMini";
export { PepitesHubTile } from "./PepitesHubTile";
export { RankCardToken } from "./RankCardToken";
export { RecapCardLine } from "./RecapCardLine";
export { TeamBornSlot } from "./TeamBornSlot";
export { heroShownThisSession } from "../storage";
export { invalidateMyManagerCard } from "@/services/use-manager-card";
