import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeft, ArrowRight, FileText, ShieldCheck } from "lucide-react";

import { AppShell } from "@/components/shell/AppShell";
import { useI18n } from "@/i18n/provider";
import type { TranslationKey } from "@/i18n/dictionaries";

export type LegalDocumentKind = "terms" | "privacy";

type LegalSection = {
  title: TranslationKey;
  body: TranslationKey;
};

const sections: Record<LegalDocumentKind, LegalSection[]> = {
  terms: [
    { title: "legal.terms.eligibility.title", body: "legal.terms.eligibility.body" },
    { title: "legal.terms.accounts.title", body: "legal.terms.accounts.body" },
    { title: "legal.terms.fantasy.title", body: "legal.terms.fantasy.body" },
    { title: "legal.terms.content.title", body: "legal.terms.content.body" },
    { title: "legal.terms.availability.title", body: "legal.terms.availability.body" },
    { title: "legal.terms.termination.title", body: "legal.terms.termination.body" },
  ],
  privacy: [
    { title: "legal.privacy.collection.title", body: "legal.privacy.collection.body" },
    { title: "legal.privacy.use.title", body: "legal.privacy.use.body" },
    { title: "legal.privacy.sharing.title", body: "legal.privacy.sharing.body" },
    { title: "legal.privacy.retention.title", body: "legal.privacy.retention.body" },
    { title: "legal.privacy.rights.title", body: "legal.privacy.rights.body" },
    { title: "legal.privacy.children.title", body: "legal.privacy.children.body" },
    { title: "legal.privacy.changes.title", body: "legal.privacy.changes.body" },
  ],
};

const metadata: Array<{
  label: TranslationKey;
  value: TranslationKey;
  testId: string;
}> = [
  {
    label: "legal.meta.effective_date",
    value: "legal.value.effective_date",
    testId: "legal-effective-date",
  },
  { label: "legal.meta.entity", value: "legal.value.entity", testId: "legal-entity" },
  { label: "legal.meta.contact", value: "legal.value.contact", testId: "legal-contact" },
  {
    label: "legal.meta.minimum_age",
    value: "legal.value.minimum_age",
    testId: "legal-minimum-age",
  },
  {
    label: "legal.meta.governing_law",
    value: "legal.value.governing_law",
    testId: "legal-governing-law",
  },
];

export function LegalDocumentPage({ kind }: { kind: LegalDocumentKind }) {
  const { t, dir } = useI18n();
  const BackIcon = dir === "rtl" ? ArrowRight : ArrowLeft;
  const titleKey = `legal.${kind}.title` as TranslationKey;
  const summaryKey = `legal.${kind}.summary` as TranslationKey;

  return (
    <AppShell contentWidth="compact">
      <Link
        to="/"
        className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-accent)]"
      >
        <BackIcon className="h-4 w-4" aria-hidden />
        {t("legal.back_home")}
      </Link>

      <header className="mt-4">
        <div className="inline-flex items-center gap-2 text-[color:var(--brand-accent)]">
          {kind === "terms" ? (
            <FileText className="h-5 w-5" aria-hidden />
          ) : (
            <ShieldCheck className="h-5 w-5" aria-hidden />
          )}
          <span className="text-xs font-black uppercase tracking-[0.16em]">BotolaGO</span>
        </div>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-foreground">{t(titleKey)}</h1>
        <p className="mt-3 text-sm leading-7 text-[color:var(--text-secondary)]">{t(summaryKey)}</p>
      </header>

      <section
        role="status"
        data-testid="legal-placeholder-banner"
        className="mt-6 rounded-2xl border border-amber-400/70 bg-amber-50 p-4 text-amber-950 shadow-sm"
      >
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <div>
            <h2 className="text-sm font-black">{t("legal.placeholder.badge")}</h2>
            <p className="mt-1 text-xs leading-5">{t("legal.placeholder.notice")}</p>
          </div>
        </div>
      </section>

      <dl className="mt-5 grid gap-3">
        {metadata.map((item) => (
          <div
            key={item.testId}
            className="rounded-2xl border border-[var(--border-subtle)] bg-[color:var(--surface)] p-4 shadow-subtle"
          >
            <dt className="text-[11px] font-black uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
              {t(item.label)}
            </dt>
            <dd
              data-testid={item.testId}
              className="mt-1 break-words text-sm font-bold leading-6 text-foreground"
            >
              {t(item.value)}
            </dd>
          </div>
        ))}
      </dl>

      <article className="mt-7 space-y-6 rounded-[var(--radius-hero)] border border-[var(--border-subtle)] bg-[color:var(--background-elevated)] p-5 shadow-card sm:p-7">
        {sections[kind].map((section) => (
          <section key={section.title}>
            <h2 className="text-lg font-black tracking-tight text-foreground">
              {t(section.title)}
            </h2>
            <p className="mt-2 text-sm leading-7 text-[color:var(--text-secondary)]">
              {t(section.body)}
            </p>
          </section>
        ))}
      </article>
    </AppShell>
  );
}
