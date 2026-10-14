import type { TranslationKey } from "@/i18n/dictionaries";

import { usePlusCopy } from "./plus-copy";

/** « Avec <logo> »: a heading whose product name is the logo. */
export function PlusLogoHeading({ id, templateKey }: { id: string; templateKey: TranslationKey }) {
  const { f, logo } = usePlusCopy();
  return (
    <h2 className="plus-h2" id={id}>
      {f(templateKey, { logo })}
    </h2>
  );
}
