import { Search } from "lucide-react";
import { useCallback, useEffect, useReducer, useRef, useState, type ReactNode } from "react";

import type { RepositoryContext } from "@/backend/contracts/repository";
import {
  isValidPremiumReason,
  mapPremiumAdminError,
  parsePremiumLookupQuery,
  PREMIUM_GRANT_DURATIONS,
  PREMIUM_REASON_MIN,
  premiumGrantEndsAt,
  PREMIUM_STATES,
  type PremiumAdminEvent,
  type PremiumAdminGrant,
  type PremiumAdminMember,
  type PremiumAdminOverview,
  type PremiumAdminRepository,
  type PremiumGrantDurationKey,
  type PremiumState,
} from "@/backend/premium/admin";
import {
  ADMIN_CARD_CLASS,
  ADMIN_LABEL_CLASS,
  AdminDate,
  AdminDatum,
  AdminEmptyState,
  AdminField,
  AdminFilterChips,
  AdminNotice,
  AdminSkeletonList,
  AdminSummaryCard,
} from "@/components/admin/AdminSurfaces";
import { AdminDestructiveAction } from "@/components/admin/AdminDestructiveAction";
import {
  destructiveActionReducer,
  IDLE_DESTRUCTIVE_ACTION,
} from "@/components/admin/destructive-action";
import {
  eventAmount,
  EVENT_TYPE_LABELS,
  formatProductPrice,
  GRANT_DURATION_LABELS,
  MODE_HINTS,
  MODE_LABELS,
  OUTCOME_LABELS,
  premiumAdminErrorMessage,
  productName,
  recordedStateLabel,
  renewalLabel,
  SOURCE_LABELS,
  STATE_HINTS,
  STATE_LABELS,
  STATE_NAMES,
  type Lang,
} from "@/components/admin/plus/plus-presentation";
import { formatUserDate, formatUserDateTime } from "@/components/admin/users/user-presentation";
import { ui, UiBadge, UiButton, UiCard, UiInput } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

/**
 * The BotolaGO+ admin screen (`/admin/plus`).
 *
 * It shows what the database answers and decides nothing: counts by state and by product, the
 * switches and the prices read-only, one audited member lookup, and a grant or a revoke through the
 * admin console's two-press confirm step. The database re-checks the permission, MFA and recent
 * authentication on every call and writes the audit row; `canGrant` only decides what is drawn.
 *
 * No customer card, no Fantasy figure, no payment card data and no billing payload is read or shown.
 */

export interface PlusAdminScreenProps {
  repository: PremiumAdminRepository;
  /** The caller holds premium.grant. The database checks it again on every grant and revoke. */
  canGrant: boolean;
  lang: Lang;
  /** A fresh context per call: its request id is the audit row's. */
  makeContext: () => RepositoryContext;
}

type OverviewState =
  | { status: "loading" }
  | { status: "ready"; data: PremiumAdminOverview }
  | { status: "error"; code: string };

type LookupPhase = "idle" | "loading" | "ready" | "error";
type Notice = { tone: "info" | "alert"; text: string } | null;

function errorCode(error: unknown): string {
  return mapPremiumAdminError(error).code;
}

/**
 * A status word. Positive and negative are not drawn as the kit's coloured badge here: its green
 * text on a green tint measures 3.9:1 at this size, under the 4.5:1 a 12px label needs. They sit on
 * the sunken surface in the default text colour, with a coloured dot beside the word; the meaning
 * is in the word, never in the colour alone. Caution and neutral are the kit's own.
 */
function StatusBadge({
  tone,
  children,
}: {
  tone: "positive" | "warning" | "neutral" | "danger";
  children: ReactNode;
}) {
  if (tone === "warning") return <UiBadge tone="caution">{children}</UiBadge>;
  if (tone === "neutral") return <UiBadge tone="neutral">{children}</UiBadge>;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 px-3 py-1",
        ui.radius.full,
        ui.text.label,
        ui.surface.sunken,
        ui.tone.default,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "h-2 w-2 shrink-0 rounded-full",
          tone === "positive" ? "bg-[color:var(--ui-positive)]" : "bg-[color:var(--ui-negative)]",
        )}
      />
      {children}
    </span>
  );
}

/** A titled block on the raised surface, as on the user detail page. */
function Section({
  heading,
  intro,
  children,
  testId,
  headingId,
}: {
  heading: string;
  intro?: string;
  children: ReactNode;
  testId: string;
  headingId: string;
}) {
  return (
    <section aria-labelledby={headingId} data-testid={testId} className="mt-8">
      <h3 id={headingId} className={cn(ui.display.section, ui.tone.default)}>
        {heading}
      </h3>
      {intro && <p className={cn("mt-1", ui.text.secondary, ui.tone.muted)}>{intro}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function PlusAdminScreen({ repository, canGrant, lang, makeContext }: PlusAdminScreenProps) {
  const rtl = lang === "ar";
  const [overview, setOverview] = useState<OverviewState>({ status: "loading" });

  const loadOverview = useCallback(async () => {
    try {
      const data = await repository.overview(makeContext());
      setOverview({ status: "ready", data });
    } catch (error) {
      setOverview({ status: "error", code: errorCode(error) });
    }
    // `makeContext` is a fresh closure per render in the route; the repository is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repository]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  return (
    <div className="grid grid-cols-1" data-testid="admin-plus-screen">
      <Section
        headingId="admin-plus-overview-heading"
        testId="admin-plus-overview"
        heading={rtl ? "نظرة عامة" : "Vue d’ensemble"}
        intro={
          rtl
            ? "أعداد فقط، بلا قائمة بالأعضاء. تُحتسب الحالة بحسب التواريخ، لا بحسب آخر حدث وحده."
            : "Des nombres seulement, aucune liste de membres. L’état tient compte des dates, pas seulement du dernier événement."
        }
      >
        {overview.status === "loading" && (
          <>
            <AdminSkeletonList rows={3} surface="card" testId="admin-plus-overview-loading" />
            <p className="sr-only" role="status">
              {rtl ? "جارٍ تحميل الأعداد…" : "Chargement des chiffres…"}
            </p>
          </>
        )}
        {overview.status === "error" && (
          <div data-testid="admin-plus-overview-error">
            <AdminNotice tone="alert" role="alert">
              {premiumAdminErrorMessage(overview.code, lang)}
            </AdminNotice>
            <UiButton
              variant="soft"
              size="sm"
              className="mt-3"
              onClick={() => {
                setOverview({ status: "loading" });
                void loadOverview();
              }}
              data-testid="admin-plus-overview-retry"
            >
              {rtl ? "إعادة المحاولة" : "Réessayer"}
            </UiButton>
          </div>
        )}
        {overview.status === "ready" && <OverviewBody data={overview.data} lang={lang} />}
      </Section>

      <LookupSection
        repository={repository}
        canGrant={canGrant}
        lang={lang}
        makeContext={makeContext}
        onChanged={loadOverview}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

function OverviewBody({ data, lang }: { data: PremiumAdminOverview; lang: Lang }) {
  const rtl = lang === "ar";
  const total = PREMIUM_STATES.reduce((sum, state) => sum + (data.membersByState[state] ?? 0), 0);
  return (
    <div className="grid grid-cols-1 gap-6">
      <div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="admin-plus-states">
          {PREMIUM_STATES.map((state) => (
            <AdminSummaryCard
              key={state}
              title={STATE_LABELS[state][lang]}
              testId={`admin-plus-state-${state}`}
            >
              <p className={ui.stat.lg}>{data.membersByState[state] ?? 0}</p>
              <p className={cn("mt-1", ui.text.meta, ui.tone.muted)}>{STATE_HINTS[state][lang]}</p>
            </AdminSummaryCard>
          ))}
          <AdminSummaryCard
            title={rtl ? "منح سارية" : "Offres en cours"}
            testId="admin-plus-live-grants"
          >
            <p className={ui.stat.lg}>{data.liveGrants}</p>
            <p className={cn("mt-1", ui.text.meta, ui.tone.muted)}>
              {rtl
                ? "حسابات لها منحة من الطاقم سارية الآن، إضافة إلى الاشتراكات."
                : "Comptes avec une offre du personnel valable aujourd’hui, en plus des abonnements."}
            </p>
          </AdminSummaryCard>
        </div>
        <p className={cn("mt-3", ui.text.meta, ui.tone.muted)} data-testid="admin-plus-total">
          {rtl ? "عدد الحسابات التي لها اشتراك: " : "Comptes ayant un abonnement : "}
          <span className={cn(ui.stat.sm, ui.tone.default)}>{total}</span>
          {" · "}
          {rtl ? "آخر حدث فوترة: " : "Dernier événement de facturation : "}
          {data.lastEventAt ? (
            <AdminDate>{formatUserDateTime(data.lastEventAt, lang)}</AdminDate>
          ) : rtl ? (
            "لا شيء بعد"
          ) : (
            "aucun pour l’instant"
          )}
        </p>
      </div>

      <div data-testid="admin-plus-products">
        <h4 className={cn(ui.display.header, ui.tone.default)}>
          {rtl ? "المنتجات والأسعار" : "Produits et prix"}
        </h4>
        <p className={cn("mt-1", ui.text.secondary, ui.tone.muted)}>
          {rtl
            ? "للقراءة فقط. يغيّرها المالك بالسكربتات وحدها، والأسعار تأتي من قاعدة البيانات."
            : "Lecture seule. Seul le propriétaire les change, par script ; les prix viennent de la base de données."}
        </p>
        <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {data.products.map((product) => {
            const counts = data.membersByProduct?.[product.code];
            const present = PREMIUM_STATES.filter((state) => (counts?.[state] ?? 0) > 0);
            return (
              <li key={product.code}>
                <UiCard
                  padding="md"
                  className="h-full"
                  testId={`admin-plus-product-${product.code}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h5 className={cn(ui.text.bodyStrong, ui.tone.default)}>
                      {productName(product.code, lang)}
                    </h5>
                    <StatusBadge tone={product.active ? "positive" : "neutral"}>
                      {product.active
                        ? rtl
                          ? "للبيع"
                          : "En vente"
                        : rtl
                          ? "غير معروض"
                          : "Retiré de la vente"}
                    </StatusBadge>
                  </div>
                  <p className={cn("mt-2", ui.stat.md)} data-testid="admin-plus-product-price">
                    <bdi>{formatProductPrice(product, lang)}</bdi>
                  </p>
                  <p className={cn("mt-1", ui.text.meta, ui.tone.muted)}>
                    {renewalLabel(product, lang)}
                  </p>
                  <p className={cn("mt-1", ui.text.meta, ui.tone.faint)}>
                    <AdminDatum>{product.code}</AdminDatum>
                  </p>
                  <div className="mt-3" data-testid="admin-plus-product-members">
                    <p className={ADMIN_LABEL_CLASS}>
                      {rtl ? "الحسابات بحسب الحالة" : "Comptes par état"}
                    </p>
                    {data.membersByProduct === undefined ? (
                      <p className={cn("mt-1", ui.text.meta, ui.tone.muted)}>
                        {rtl
                          ? "غير متاح قبل تطبيق الترحيل 20261013100500."
                          : "Indisponible avant l’application de la migration 20261013100500."}
                      </p>
                    ) : present.length === 0 ? (
                      <p className={cn("mt-1", ui.text.secondary, ui.tone.muted)}>
                        {rtl ? "لا عضو بعد." : "Aucun compte pour l’instant."}
                      </p>
                    ) : (
                      <ul className="mt-2 flex flex-wrap gap-2">
                        {present.map((state) => (
                          <li
                            key={state}
                            className={cn(
                              "inline-flex items-baseline gap-1.5 px-3 py-1",
                              ui.radius.full,
                              ui.surface.sunken,
                              ui.text.meta,
                              ui.tone.default,
                            )}
                          >
                            <span>{STATE_LABELS[state][lang]}</span>
                            <span className={ui.stat.sm}>{counts?.[state]}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </UiCard>
              </li>
            );
          })}
        </ul>
        {data.products.length === 0 && (
          <AdminEmptyState testId="admin-plus-products-empty" className={ADMIN_CARD_CLASS}>
            {rtl ? "لا منتج مُعرَّف." : "Aucun produit n’est défini."}
          </AdminEmptyState>
        )}
      </div>

      <div data-testid="admin-plus-settings">
        <h4 className={cn(ui.display.header, ui.tone.default)}>
          {rtl ? "المفاتيح الحالية" : "Interrupteurs actuels"}
        </h4>
        <p className={cn("mt-1", ui.text.secondary, ui.tone.muted)}>
          {rtl
            ? "للقراءة فقط. يغيّرها المالك بالسكربتات وحدها."
            : "Lecture seule. Seul le propriétaire les change, par script."}
        </p>
        <UiCard padding="md" className="mt-3">
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <AdminField label={rtl ? "الوضع" : "Mode"} testId="admin-plus-setting-mode">
              <StatusBadge tone={data.settings.mode === "off" ? "neutral" : "positive"}>
                {MODE_LABELS[data.settings.mode][lang]}
              </StatusBadge>
              <p className={cn("mt-2", ui.text.meta, ui.tone.muted)}>
                {MODE_HINTS[data.settings.mode][lang]}
              </p>
            </AdminField>
            <AdminField
              label={rtl ? "الدفع عبر الموقع" : "Paiement en ligne"}
              testId="admin-plus-setting-checkout"
            >
              <StatusBadge tone={data.settings.checkoutEnabled ? "positive" : "neutral"}>
                {data.settings.checkoutEnabled
                  ? rtl
                    ? "مفعّل"
                    : "Ouvert"
                  : rtl
                    ? "مغلق"
                    : "Fermé"}
              </StatusBadge>
              <p className={cn("mt-2", ui.text.meta, ui.tone.muted)}>
                {data.settings.checkoutEnabled
                  ? rtl
                    ? "يمكن بدء الدفع من الموقع."
                    : "Le paiement peut être lancé depuis le site."
                  : rtl
                    ? "لا يمكن بدء أي دفع."
                    : "Aucun paiement ne peut être lancé."}
              </p>
            </AdminField>
            <AdminField label={rtl ? "الفوترة" : "Facturation"} testId="admin-plus-setting-billing">
              <StatusBadge tone={data.settings.billingPaused ? "warning" : "positive"}>
                {data.settings.billingPaused
                  ? rtl
                    ? "متوقفة مؤقتاً"
                    : "En pause"
                  : rtl
                    ? "جارية"
                    : "En marche"}
              </StatusBadge>
              <p className={cn("mt-2", ui.text.meta, ui.tone.muted)}>
                {data.settings.billingPaused
                  ? rtl
                    ? "تُرفض أحداث المزوّد (وتُعاد لاحقاً) أثناء عملية على قاعدة البيانات."
                    : "Les événements du prestataire sont refusés (et rejoués plus tard) le temps d’une opération sur la base."
                  : rtl
                    ? "تُطبَّق أحداث المزوّد فور وصولها."
                    : "Les événements du prestataire sont appliqués dès leur arrivée."}
              </p>
            </AdminField>
          </dl>
        </UiCard>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Member lookup, grant and revoke
// ---------------------------------------------------------------------------

function LookupSection({
  repository,
  canGrant,
  lang,
  makeContext,
  onChanged,
}: Pick<PlusAdminScreenProps, "repository" | "canGrant" | "lang" | "makeContext"> & {
  onChanged: () => Promise<void>;
}) {
  const rtl = lang === "ar";
  const [query, setQuery] = useState("");
  const [reason, setReason] = useState("");
  const [phase, setPhase] = useState<LookupPhase>("idle");
  const [failure, setFailure] = useState<string | null>(null);
  const [member, setMember] = useState<PremiumAdminMember | null>(null);
  const generation = useRef(0);

  const read = useCallback(
    async (userId: string | null, email: string | null, why: string) => {
      const issued = ++generation.current;
      setPhase("loading");
      setFailure(null);
      try {
        let id = userId;
        if (id === null && email !== null) {
          const found = await repository.resolveAccount(email, makeContext());
          if (found.status === "not_found") {
            if (issued !== generation.current) return;
            setMember(null);
            setFailure("premium_lookup_not_found");
            setPhase("error");
            return;
          }
          id = found.userId;
        }
        if (id === null) return;
        const result = await repository.member(id, why, makeContext());
        if (issued !== generation.current) return;
        setMember(result);
        setPhase("ready");
      } catch (error) {
        if (issued !== generation.current) return;
        setMember(null);
        setFailure(errorCode(error));
        setPhase("error");
      }
    },
    [makeContext, repository],
  );

  const parsed = parsePremiumLookupQuery(query);
  const reasonOk = isValidPremiumReason(reason);

  const submit = () => {
    if (parsed.kind === "invalid") {
      setMember(null);
      setFailure("premium_lookup_invalid");
      setPhase("error");
      return;
    }
    if (!reasonOk) return;
    void read(
      parsed.kind === "id" ? parsed.userId : null,
      parsed.kind === "email" ? parsed.email : null,
      reason,
    );
  };

  return (
    <Section
      headingId="admin-plus-lookup-heading"
      testId="admin-plus-lookup"
      heading={rtl ? "البحث عن عضو" : "Consulter un membre"}
      intro={
        rtl
          ? "كل قراءة تُسجَّل في سجل التدقيق مع سببها. لا تظهر بيانات بطاقة الدفع ولا بطاقات اللعبة."
          : "Chaque consultation est consignée dans l’audit avec son motif. Aucune donnée de carte bancaire, de carte Manager ni de Fantasy n’apparaît ici."
      }
    >
      <UiCard padding="md" role="search" aria-label={rtl ? "البحث عن عضو" : "Rechercher un membre"}>
        <form
          className="grid grid-cols-1 gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <UiInput
            type="search"
            label={rtl ? "معرّف الحساب أو بريده الإلكتروني" : "Identifiant du compte ou e-mail"}
            hint={
              rtl
                ? "معرّف UUID أو البريد الكامل. البحث بالبريد يمر عبر دليل المستخدمين."
                : "Un UUID, ou l’adresse e-mail complète. La recherche par e-mail passe par l’annuaire des utilisateurs."
            }
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            leading={<Search className={cn("h-4 w-4", ui.tone.muted)} aria-hidden />}
            autoComplete="off"
            spellCheck={false}
            dir="auto"
            data-testid="admin-plus-lookup-query"
          />
          <UiInput
            label={rtl ? "سبب الاطلاع (مطلوب)" : "Motif de la consultation (requis)"}
            hint={
              rtl
                ? `${PREMIUM_REASON_MIN} أحرف على الأقل. يُسجَّل في التدقيق.`
                : `${PREMIUM_REASON_MIN} caractères minimum. Consigné dans l’audit.`
            }
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={500}
            autoComplete="off"
            data-testid="admin-plus-lookup-reason"
          />
          <div>
            <UiButton
              type="submit"
              variant="ink"
              size="sm"
              className="w-full sm:w-auto"
              disabled={phase === "loading" || query.trim() === "" || !reasonOk}
              aria-busy={phase === "loading"}
              data-testid="admin-plus-lookup-submit"
            >
              {phase === "loading"
                ? rtl
                  ? "جارٍ البحث…"
                  : "Recherche…"
                : rtl
                  ? "اطلاع (يُسجَّل)"
                  : "Consulter (consigné)"}
            </UiButton>
          </div>
        </form>
      </UiCard>

      {phase === "error" && failure && (
        <div className="mt-4" data-testid="admin-plus-lookup-error">
          <AdminNotice tone="alert" role="alert">
            {premiumAdminErrorMessage(failure, lang)}
          </AdminNotice>
        </div>
      )}

      {phase === "loading" && (
        <div className="mt-4">
          <AdminSkeletonList rows={2} surface="card" testId="admin-plus-member-loading" />
          <p className="sr-only" role="status">
            {rtl ? "جارٍ تحميل العضو…" : "Chargement du membre…"}
          </p>
        </div>
      )}

      {member && phase !== "loading" && (
        <MemberPanel
          key={member.userId}
          member={member}
          canGrant={canGrant}
          lang={lang}
          repository={repository}
          makeContext={makeContext}
          onChanged={async (why) => {
            // The refresh is itself an audited read: it carries the reason of the action. It
            // updates the panel in place, so the message about the action stays on screen.
            const issued = ++generation.current;
            try {
              const fresh = await repository.member(member.userId, why, makeContext());
              if (issued === generation.current) setMember(fresh);
            } catch (error) {
              return errorCode(error);
            } finally {
              await onChanged();
            }
            return null;
          }}
        />
      )}
    </Section>
  );
}

function MemberPanel({
  member,
  canGrant,
  lang,
  repository,
  makeContext,
  onChanged,
}: {
  member: PremiumAdminMember;
  canGrant: boolean;
  lang: Lang;
  repository: PremiumAdminRepository;
  makeContext: () => RepositoryContext;
  /** Re-reads the member after an action; resolves to an error code if that read failed. */
  onChanged: (reason: string) => Promise<string | null>;
}) {
  const rtl = lang === "ar";
  const [notice, setNotice] = useState<Notice>(null);
  const [duration, setDuration] = useState<PremiumGrantDurationKey>("month");
  const [actionState, dispatchAction] = useReducer(
    destructiveActionReducer,
    IDLE_DESTRUCTIVE_ACTION,
  );
  const entitlement = member.entitlement;
  const now = Date.now();
  const liveGrants = member.grants.filter(
    (grant) =>
      grant.revokedAt === null &&
      Date.parse(grant.startsAt) <= now &&
      Date.parse(grant.endsAt) > now,
  );

  const grant = async (reasonText: string) => {
    setNotice(null);
    const reason = reasonText.trim();
    try {
      const result = await repository.grant(
        member.userId,
        premiumGrantEndsAt(duration, new Date()),
        reason,
        crypto.randomUUID(),
        makeContext(),
      );
      const refreshFailure = await onChanged(reason);
      setNotice(
        withRefreshOutcome(
          {
            tone: "info",
            text: rtl
              ? `مُنحت العضوية حتى ${formatUserDate(result.endsAt, lang)}. سُجّل الإجراء في التدقيق.`
              : `Offre accordée jusqu’au ${formatUserDate(result.endsAt, lang)}. L’action est consignée dans l’audit.`,
          },
          refreshFailure,
          lang,
        ),
      );
    } catch (error) {
      setNotice({ tone: "alert", text: premiumAdminErrorMessage(errorCode(error), lang) });
    }
  };

  const revoke = async (grantId: string, reasonText: string) => {
    setNotice(null);
    const reason = reasonText.trim();
    try {
      await repository.revoke(grantId, reason, crypto.randomUUID(), makeContext());
      const refreshFailure = await onChanged(reason);
      setNotice(
        withRefreshOutcome(
          {
            tone: "info",
            text: rtl
              ? "سُحبت المنحة. سُجّل الإجراء في التدقيق."
              : "Offre retirée. L’action est consignée dans l’audit.",
          },
          refreshFailure,
          lang,
        ),
      );
    } catch (error) {
      setNotice({ tone: "alert", text: premiumAdminErrorMessage(errorCode(error), lang) });
    }
  };

  return (
    <div className="mt-4 grid grid-cols-1 gap-4" data-testid="admin-plus-member">
      <UiCard padding="md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className={ADMIN_LABEL_CLASS}>{rtl ? "الحساب" : "Compte"}</p>
            <p className={cn("mt-1 break-all", ui.text.secondary, ui.tone.default)}>
              <AdminDatum>{member.userId}</AdminDatum>
            </p>
          </div>
          <StatusBadge tone={member.isMember ? "positive" : "neutral"}>
            <span data-testid="admin-plus-member-status">
              {member.isMember
                ? rtl
                  ? "عضو الآن"
                  : "Membre actuellement"
                : rtl
                  ? "ليس عضواً الآن"
                  : "Pas membre actuellement"}
            </span>
          </StatusBadge>
        </div>
        <p className={cn("mt-2", ui.text.meta, ui.tone.muted)}>
          {rtl
            ? "يشمل الاشتراك والمنح الساريتين."
            : "Compte l’abonnement et les offres du personnel valables aujourd’hui."}
        </p>
      </UiCard>

      {notice && (
        <AdminNotice
          tone={notice.tone}
          role={notice.tone === "alert" ? "alert" : "status"}
          testId="admin-plus-member-message"
        >
          {notice.text}
        </AdminNotice>
      )}

      <UiCard padding="md" testId="admin-plus-entitlement">
        <h4 className={cn(ui.display.header, ui.tone.default)}>
          {rtl ? "الاشتراك" : "Abonnement"}
        </h4>
        {entitlement === null ? (
          <p className={cn("mt-2", ui.text.secondary, ui.tone.muted)}>
            {rtl ? "لم يشترك هذا الحساب قط." : "Ce compte n’a jamais souscrit d’abonnement."}
          </p>
        ) : (
          <dl className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <AdminField label={rtl ? "الحالة الآن" : "État actuel"} testId="admin-plus-ent-state">
              <StatusBadge tone={stateTone(entitlement.effectiveState)}>
                {STATE_NAMES[entitlement.effectiveState][lang]}
              </StatusBadge>
              {entitlement.effectiveState !== entitlement.state && (
                <p className={cn("mt-1", ui.text.meta, ui.tone.muted)}>
                  {rtl ? "الحالة المسجّلة: " : "État enregistré : "}
                  {STATE_NAMES[entitlement.state][lang]}
                </p>
              )}
            </AdminField>
            <AdminField label={rtl ? "المنتج" : "Produit"}>
              {productName(entitlement.productCode, lang)}
            </AdminField>
            <AdminField label={rtl ? "المصدر" : "Source"}>
              {SOURCE_LABELS[entitlement.source][lang]}
            </AdminField>
            <AdminField label={rtl ? "بداية الفترة" : "Début de période"}>
              <AdminDate>{formatUserDateTime(entitlement.currentPeriodStart, lang)}</AdminDate>
            </AdminField>
            <AdminField label={rtl ? "نهاية الفترة" : "Fin de période"}>
              <AdminDate>{formatUserDateTime(entitlement.currentPeriodEnd, lang)}</AdminDate>
            </AdminField>
            {entitlement.graceUntil && (
              <AdminField label={rtl ? "نهاية السماح" : "Fin de la grâce"}>
                <AdminDate>{formatUserDateTime(entitlement.graceUntil, lang)}</AdminDate>
              </AdminField>
            )}
            {entitlement.cancelRequestedAt && (
              <AdminField label={rtl ? "طلب الإلغاء" : "Résiliation demandée le"}>
                <AdminDate>{formatUserDateTime(entitlement.cancelRequestedAt, lang)}</AdminDate>
              </AdminField>
            )}
            <AdminField label={rtl ? "آخر حدث" : "Dernier événement"}>
              <AdminDate>{formatUserDateTime(entitlement.lastEventAt, lang)}</AdminDate>
            </AdminField>
          </dl>
        )}
      </UiCard>

      <UiCard padding="md" testId="admin-plus-grants">
        <h4 className={cn(ui.display.header, ui.tone.default)}>
          {rtl ? "المنح من الطاقم" : "Offres du personnel"}
        </h4>
        {member.grants.length === 0 ? (
          <p className={cn("mt-2", ui.text.secondary, ui.tone.muted)}>
            {rtl ? "لا منحة لهذا الحساب." : "Aucune offre pour ce compte."}
          </p>
        ) : (
          <ul className="mt-3 grid grid-cols-1 gap-3">
            {member.grants.map((item) => (
              <GrantRow
                key={item.grantId}
                item={item}
                live={liveGrants.some((g) => g.grantId === item.grantId)}
                lang={lang}
                canGrant={canGrant}
                actionState={actionState}
                dispatchAction={dispatchAction}
                onRevoke={revoke}
              />
            ))}
          </ul>
        )}

        <div className={cn("mt-5 pt-4", ui.rule.blockStart)}>
          {canGrant ? (
            <div className="grid grid-cols-1 gap-4" data-testid="admin-plus-grant-form">
              <h5 className={cn(ui.text.bodyStrong, ui.tone.default)}>
                {rtl ? "منح عضوية مجانية" : "Offrir BotolaGO+"}
              </h5>
              <AdminFilterChips
                label={rtl ? "مدة المنحة" : "Durée de l’offre"}
                options={PREMIUM_GRANT_DURATIONS.map((option) => ({
                  value: option.key,
                  label: GRANT_DURATION_LABELS[option.key][lang],
                }))}
                value={duration}
                onSelect={setDuration}
                data-testid="admin-plus-grant-duration"
              />
              <AdminDestructiveAction
                actionKey={`grant:${member.userId}`}
                state={actionState}
                dispatch={dispatchAction}
                minimumReasonLength={PREMIUM_REASON_MIN}
                rtl={rtl}
                tone="primary"
                triggerLabel={rtl ? "منح العضوية" : "Offrir l’abonnement"}
                confirmPrompt={
                  rtl ? (
                    <>
                      منح BotolaGO+ للحساب <AdminDatum>{member.userId}</AdminDatum> لمدة{" "}
                      {GRANT_DURATION_LABELS[duration].ar}؟ يصبح عضواً فوراً. يكفي مشرف واحد،
                      ويُسجَّل الإجراء في التدقيق.
                    </>
                  ) : (
                    <>
                      Offrir BotolaGO+ au compte <AdminDatum>{member.userId}</AdminDatum> pour{" "}
                      {GRANT_DURATION_LABELS[duration].fr} ? Il devient membre aussitôt. Une seule
                      personne suffit ; l’action est consignée dans l’audit.
                    </>
                  )
                }
                confirmLabel={rtl ? "تأكيد المنح" : "Confirmer l’offre"}
                onConfirm={grant}
                triggerTestId="admin-plus-grant"
                testId="admin-plus-grant"
              />
            </div>
          ) : (
            <p className={cn(ui.text.meta, ui.tone.muted)} data-testid="admin-plus-read-only">
              {rtl
                ? "يسمح دورك بالاطلاع على الأعضاء، لا بمنح العضوية أو سحبها."
                : "Votre rôle permet de consulter les membres, pas d’offrir ni de retirer un abonnement."}
            </p>
          )}
        </div>
      </UiCard>

      <UiCard padding="md" testId="admin-plus-events">
        <h4 className={cn(ui.display.header, ui.tone.default)}>
          {rtl ? "سجل أحداث الفوترة" : "Historique de facturation"}
        </h4>
        <p className={cn("mt-1", ui.text.meta, ui.tone.muted)}>
          {rtl
            ? "آخر 20 حدثاً: النتيجة فقط، دون محتوى خام."
            : "Les 20 derniers événements : leur issue seulement, jamais leur contenu brut."}
        </p>
        {member.events.length === 0 ? (
          <p className={cn("mt-3", ui.text.secondary, ui.tone.muted)}>
            {rtl ? "لا حدث فوترة لهذا الحساب." : "Aucun événement de facturation pour ce compte."}
          </p>
        ) : (
          <ol className="mt-3 grid grid-cols-1 gap-2">
            {member.events.map((event) => (
              <EventRow key={event.eventId} event={event} lang={lang} />
            ))}
          </ol>
        )}
      </UiCard>
    </div>
  );
}

/** The action succeeded; if re-reading the member failed, say so rather than show stale data as fresh. */
function withRefreshOutcome(
  notice: NonNullable<Notice>,
  refreshFailure: string | null,
  lang: Lang,
): NonNullable<Notice> {
  if (refreshFailure === null) return notice;
  const rtl = lang === "ar";
  return {
    tone: "alert",
    text: `${notice.text} ${
      rtl
        ? "تعذّر تحديث بيانات الحساب، فقد تكون المعروضة قديمة: "
        : "Le compte n’a pas pu être relu, les données affichées peuvent être périmées : "
    }${premiumAdminErrorMessage(refreshFailure, lang)}`,
  };
}

function stateTone(state: PremiumState): "positive" | "warning" | "neutral" | "danger" {
  if (state === "active") return "positive";
  if (state === "cancelling" || state === "grace" || state === "on_hold") return "warning";
  if (state === "refunded" || state === "revoked") return "danger";
  return "neutral";
}

function GrantRow({
  item,
  live,
  lang,
  canGrant,
  actionState,
  dispatchAction,
  onRevoke,
}: {
  item: PremiumAdminGrant;
  live: boolean;
  lang: Lang;
  canGrant: boolean;
  actionState: Parameters<typeof AdminDestructiveAction>[0]["state"];
  dispatchAction: Parameters<typeof AdminDestructiveAction>[0]["dispatch"];
  onRevoke: (grantId: string, reason: string) => Promise<void>;
}) {
  const rtl = lang === "ar";
  const status = item.revokedAt
    ? { tone: "neutral" as const, label: rtl ? "مسحوبة" : "Retirée" }
    : live
      ? { tone: "positive" as const, label: rtl ? "سارية" : "En cours" }
      : Date.parse(item.endsAt) <= Date.now()
        ? { tone: "neutral" as const, label: rtl ? "منتهية" : "Terminée" }
        : { tone: "warning" as const, label: rtl ? "لم تبدأ بعد" : "À venir" };
  return (
    <li
      className={cn("grid gap-2 p-3", ui.radius.track, ui.surface.sunken)}
      data-testid="admin-plus-grant-item"
      data-live={live ? "true" : "false"}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
        <p className={cn(ui.text.meta, ui.tone.muted)}>
          {rtl ? "من " : "Du "}
          <AdminDate>{formatUserDate(item.startsAt, lang)}</AdminDate>
          {rtl ? " إلى " : " au "}
          <AdminDate>{formatUserDate(item.endsAt, lang)}</AdminDate>
        </p>
      </div>
      <p className={cn("break-words", ui.text.secondary, ui.tone.default)}>
        <span className={ADMIN_LABEL_CLASS}>{rtl ? "السبب" : "Motif"}</span>{" "}
        <bdi>{item.reason}</bdi>
      </p>
      {item.revokedAt && (
        <p className={cn(ui.text.meta, ui.tone.muted)}>
          {rtl ? "سُحبت في " : "Retirée le "}
          <AdminDate>{formatUserDateTime(item.revokedAt, lang)}</AdminDate>
        </p>
      )}
      {live && canGrant && (
        <AdminDestructiveAction
          actionKey={`revoke:${item.grantId}`}
          state={actionState}
          dispatch={dispatchAction}
          minimumReasonLength={PREMIUM_REASON_MIN}
          rtl={rtl}
          triggerLabel={rtl ? "سحب المنحة" : "Retirer l’offre"}
          confirmPrompt={
            rtl
              ? "سحب هذه المنحة الآن؟ يفقد الحساب عضويته إن لم يكن له اشتراك ساري. يُسجَّل الإجراء في التدقيق."
              : "Retirer cette offre maintenant ? Le compte cesse d’être membre s’il n’a pas d’abonnement en cours. L’action est consignée dans l’audit."
          }
          confirmLabel={rtl ? "تأكيد السحب" : "Confirmer le retrait"}
          onConfirm={(reason) => onRevoke(item.grantId, reason)}
          triggerTestId="admin-plus-revoke"
          testId="admin-plus-revoke"
        />
      )}
    </li>
  );
}

function EventRow({ event, lang }: { event: PremiumAdminEvent; lang: Lang }) {
  const rtl = lang === "ar";
  const amount = eventAmount(event.amountMinor, event.currency, lang);
  const tone =
    event.outcome === "applied"
      ? "positive"
      : event.outcome === "rejected_signature"
        ? "danger"
        : "warning";
  return (
    <li
      className={cn("grid gap-1.5 p-3", ui.radius.track, ui.surface.sunken)}
      data-testid="admin-plus-event"
      data-outcome={event.outcome}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={cn(ui.text.bodyStrong, ui.tone.default)}>
          {EVENT_TYPE_LABELS[event.eventType][lang]}
        </p>
        <StatusBadge tone={tone}>{OUTCOME_LABELS[event.outcome][lang]}</StatusBadge>
      </div>
      <p className={cn(ui.text.meta, ui.tone.muted)}>
        <AdminDate>{formatUserDateTime(event.occurredAt, lang)}</AdminDate>
        {" · "}
        {SOURCE_LABELS[event.source][lang]}
        {event.productCode && (
          <>
            {" · "}
            {productName(event.productCode, lang)}
          </>
        )}
        {amount && (
          <>
            {" · "}
            <bdi>{amount}</bdi>
          </>
        )}
      </p>
      <p className={cn(ui.text.meta, ui.tone.muted)}>
        {rtl ? "الحالة: " : "État : "}
        {recordedStateLabel(event.stateBefore, lang)}
        {" → "}
        {recordedStateLabel(event.stateAfter, lang)}
      </p>
      <p className={cn(ui.text.meta, ui.tone.faint)}>
        <AdminDatum>{event.providerEventId}</AdminDatum>
      </p>
    </li>
  );
}
