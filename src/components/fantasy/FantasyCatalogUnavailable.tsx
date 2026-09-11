import { Link } from "@tanstack/react-router";
import { AlertTriangle, RefreshCw } from "lucide-react";

import { useI18n } from "@/i18n/provider";
import type { TranslationKey } from "@/i18n/dictionaries";

export function FantasyCatalogUnavailable({
  detailKey = "fantasy.atlas.create.unavailable.catalog",
  onRetry,
  backTo = "/fantasy",
}: {
  detailKey?: TranslationKey;
  onRetry: () => void;
  backTo?: "/" | "/fantasy";
}) {
  const { t } = useI18n();
  return (
    <section
      role="alert"
      aria-labelledby="fantasy-catalog-unavailable-title"
      className="mx-auto mt-6 max-w-xl rounded-3xl border border-amber-500/25 bg-amber-50/85 p-5 text-amber-950 shadow-sm"
    >
      <AlertTriangle className="h-7 w-7 text-amber-700" aria-hidden />
      <h1 id="fantasy-catalog-unavailable-title" className="mt-3 text-xl font-black">
        {t("fantasy.atlas.create.unavailable.title")}
      </h1>
      <p className="mt-2 text-sm leading-relaxed">{t(detailKey)}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-amber-900 px-4 text-sm font-black text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700 focus-visible:ring-offset-2"
        >
          <RefreshCw className="h-4 w-4" aria-hidden />
          {t("state.retry")}
        </button>
        <Link
          to={backTo}
          className="inline-flex min-h-11 items-center rounded-xl border border-amber-900/20 bg-white/70 px-4 text-sm font-black text-amber-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700 focus-visible:ring-offset-2"
        >
          {t("common.back")}
        </Link>
      </div>
    </section>
  );
}
