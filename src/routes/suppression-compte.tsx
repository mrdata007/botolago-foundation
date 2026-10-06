import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";
import { useEffect } from "react";

import { ui, UiCard } from "@/components/ui-kit";
import { AppShell } from "@/components/shell/AppShell";
import { fr } from "@/i18n/dictionary-fr";
import { useI18n } from "@/i18n/provider";
import { ACCOUNT_DELETION_PATH } from "@/lib/account-deletion";
import { PUBLIC_SITE_ORIGIN } from "@/lib/site-origin";
import { cn } from "@/lib/utils";

const CANONICAL = `${PUBLIC_SITE_ORIGIN}${ACCOUNT_DELETION_PATH}`;

/**
 * `/suppression-compte`: how to delete a BotolaGO account, what goes and what
 * stays. Public, no auth gate: it is the "delete account" URL the Google Play
 * listing gives, for people who no longer have the app, and the page a device
 * lands on once its account asked to be deleted (`?confirmation=1`, from the
 * Profile dialog and from AuthProvider's standing check).
 *
 * The words are the dictionaries' (`account_deletion.*`), not the generated
 * privacy policy's: the policy is the owner's document and is not edited here.
 * As with `/privacy`, `head()` emits the French metadata (the server always
 * renders `fr`) and the reader's language is applied after mount.
 */
export const Route = createFileRoute("/suppression-compte")({
  head: () => ({
    meta: [
      { title: fr["account_deletion.meta_title"] },
      { name: "description", content: fr["account_deletion.meta_description"] },
      { property: "og:title", content: fr["account_deletion.meta_title"] },
      { property: "og:description", content: fr["account_deletion.meta_description"] },
      { property: "og:type", content: "website" },
      { property: "og:url", content: CANONICAL },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: fr["account_deletion.meta_title"] },
      { name: "twitter:description", content: fr["account_deletion.meta_description"] },
    ],
    links: [{ rel: "canonical", href: CANONICAL }],
  }),
  // `1`, not `true`: the router writes the value back into the address, and
  // `?confirmation=1` is the address the app sends people to.
  validateSearch: (search: Record<string, unknown>): { confirmation?: 1 } =>
    search.confirmation === 1 || search.confirmation === "1" || search.confirmation === true
      ? { confirmation: 1 }
      : {},
  component: AccountDeletionPage,
});

const SUPPORT = "support@botolago.com";

function AccountDeletionPage() {
  const { t } = useI18n();
  const { confirmation } = Route.useSearch();
  const title = t("account_deletion.meta_title");
  const description = t("account_deletion.meta_description");

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.document.title = title;
    const meta = window.document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", description);
  }, [title, description]);

  const heading = cn("mt-7 text-balance", ui.display.section, ui.tone.default);
  const prose = cn("mt-3", ui.text.prose, ui.tone.muted);
  const list = cn("mt-3 list-disc space-y-2 ps-5", ui.text.prose, ui.tone.muted);
  const steps = cn("mt-3 list-decimal space-y-2 ps-5", ui.text.prose, ui.tone.muted);

  return (
    <AppShell>
      <article className="min-w-0 pb-6 text-start">
        {confirmation && (
          <UiCard padding="md" className="mb-6" role="status">
            <div className="flex items-start gap-3">
              <CheckCircle2
                className={cn("mt-0.5 h-5 w-5 shrink-0", ui.tone.positive)}
                aria-hidden
              />
              <div className="min-w-0">
                <p className={cn(ui.text.bodyStrong, ui.tone.default)}>
                  {t("account_deletion.done_title")}
                </p>
                <p className={cn("mt-1", ui.text.prose, ui.tone.muted)}>
                  {t("account_deletion.done_body")}
                </p>
              </div>
            </div>
          </UiCard>
        )}

        <h1 className={cn("text-balance", ui.display.title, ui.tone.default)}>
          {t("account_deletion.title")}
        </h1>
        <p className={prose}>{t("account_deletion.intro")}</p>

        <h2 className={heading}>{t("account_deletion.app_title")}</h2>
        <ol className={steps}>
          <li className="ps-1">{t("account_deletion.app_step_1")}</li>
          <li className="ps-1">{t("account_deletion.app_step_2")}</li>
          <li className="ps-1">{t("account_deletion.app_step_3")}</li>
        </ol>

        <h2 className={heading}>{t("account_deletion.email_title")}</h2>
        <p className={prose}>
          {t("account_deletion.email_body")}{" "}
          <a
            href={`mailto:${SUPPORT}?subject=${encodeURIComponent(t("account_deletion.email_subject"))}`}
            className={cn("underline underline-offset-2", ui.tone.default)}
            dir="ltr"
          >
            {SUPPORT}
          </a>
        </p>

        <h2 className={heading}>{t("account_deletion.timing_title")}</h2>
        <ul className={list}>
          <li className="ps-1">{t("account_deletion.timing_now")}</li>
          <li className="ps-1">{t("account_deletion.timing_hold")}</li>
          <li className="ps-1">{t("account_deletion.timing_final")}</li>
        </ul>

        <h2 className={heading}>{t("account_deletion.deleted_title")}</h2>
        <ul className={list}>
          <li className="ps-1">{t("account_deletion.deleted_account")}</li>
          <li className="ps-1">{t("account_deletion.deleted_profile")}</li>
          <li className="ps-1">{t("account_deletion.deleted_game")}</li>
          <li className="ps-1">{t("account_deletion.deleted_settings")}</li>
          <li className="ps-1">{t("account_deletion.deleted_leagues")}</li>
        </ul>

        <h2 className={heading}>{t("account_deletion.kept_title")}</h2>
        <ul className={list}>
          <li className="ps-1">{t("account_deletion.kept_prizes")}</li>
          <li className="ps-1">{t("account_deletion.kept_security")}</li>
          <li className="ps-1">{t("account_deletion.kept_register")}</li>
          <li className="ps-1">{t("account_deletion.kept_support")}</li>
          <li className="ps-1">{t("account_deletion.kept_backups")}</li>
        </ul>

        <p className={cn("mt-7", ui.text.prose, ui.tone.muted)}>
          {t("account_deletion.contact")}{" "}
          <a
            href={`mailto:${SUPPORT}`}
            className={cn("underline underline-offset-2", ui.tone.default)}
            dir="ltr"
          >
            {SUPPORT}
          </a>
        </p>
      </article>
    </AppShell>
  );
}
