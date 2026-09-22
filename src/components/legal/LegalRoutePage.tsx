import { useEffect } from "react";

import { AppShell } from "@/components/shell/AppShell";
import { LEGAL_DOCUMENTS } from "@/content/legal/documents";
import { useI18n } from "@/i18n/provider";
import { LegalDocumentView } from "./LegalDocumentView";

/**
 * The page body shared by `/terms` and `/privacy`.
 *
 * Both routes are public: nothing here consults `useAuth()`, so the documents
 * render for a signed-out reader exactly as they do for a signed-in one. That
 * is a requirement rather than an accident — a visitor has to be able to read
 * what they are agreeing to *before* they have an account.
 *
 * LANGUAGE AND `head()`. The reader's language lives in `localStorage`, not in
 * the URL, so a route's `head()` — which runs at match time, on the server as
 * well as the client, with no i18n context — cannot know it. `head()`
 * therefore emits the French metadata, which is what the server renders and
 * what a crawler sees, matching every other route in the app. The reader's own
 * language is applied here instead, after mount, where `useI18n()` is
 * available. See the note in `src/routes/terms.tsx`.
 */
export function LegalRoutePage({ document: which }: { document: "terms" | "privacy" }) {
  const { t, lang } = useI18n();
  const doc = LEGAL_DOCUMENTS[which][lang];

  // Spelled out per document rather than looked up through a key variable.
  // The i18n gate reads translation call sites statically: it can only see a
  // key that appears as a string literal at the call site, and a call whose
  // argument is a variable counts as drift (W4) while leaving the keys looking
  // unreferenced (W3). Two branches is a small price for keeping the gate
  // honest.
  const title = which === "terms" ? t("legal.terms.meta_title") : t("legal.privacy.meta_title");
  const description =
    which === "terms" ? t("legal.terms.meta_description") : t("legal.privacy.meta_description");

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.document.title = title;
    const meta = window.document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", description);
  }, [title, description]);

  return (
    <AppShell>
      <LegalDocumentView doc={doc} tableScrollHint={t("legal.table_scroll_hint")} />
    </AppShell>
  );
}
