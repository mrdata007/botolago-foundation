// The whole French dictionary: the core part and every section put back
// together. The app must NOT import this module: it would pull every section
// into the page that does. Pages read the core part (`dictionary-fr-core.ts`)
// and load their sections before they render (`fr-sections.ts`); the shell
// reads French through `useI18n().t`. This module is for the tests, the i18n
// gate and the QA scripts, which need every string at once
// (`fr-sections.test.ts` fails when app code imports it).
//
// The strings themselves live in `dictionary-fr-core.ts` and `fr-sections/`.
import { frCore } from "./dictionary-fr-core";
import { frFantasy } from "./fr-sections/fantasy";
import { frPepites } from "./fr-sections/pepites";
import { frPlus } from "./fr-sections/plus";
import { frPredictions } from "./fr-sections/predictions";
import { frPrizes } from "./fr-sections/prizes";

export const fr = {
  ...frCore,
  ...frFantasy,
  ...frPepites,
  ...frPlus,
  ...frPredictions,
  ...frPrizes,
} as const satisfies Record<string, string>;
