import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Info,
  Pause,
  Play,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { useAuth } from "@/auth/AuthProvider";
import type {
  AlternativesMember,
  BriefingMember,
  BriefingPlayer,
  FormCell,
} from "@/backend/premium/briefing";
import { countdownText, useDeadlineCountdown } from "@/components/fpl/deadline";
import { FantasyAmount } from "@/components/fantasy/FantasyAmount";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { fantasyService } from "@/services/fantasy-runtime";
import { premiumBriefingService } from "@/services/premium-briefing";
import { useBriefing, useBriefingAlternatives } from "@/services/use-premium-briefing";
import { usePremium } from "@/services/use-premium";
import type { Gameweek } from "@/types/domain";

import { PlusEmbed, PlusLockedSection } from "./PlusLockedSection";
import { PlusLogo } from "./PlusLogo";
import { PLUS_NAME, usePlusCopy } from "./plus-copy";
import { usePlusAccess } from "./plus-access";
import {
  captainCandidates,
  cellFor,
  defaultReplace,
  formatDay,
  formatDeadlineParts,
  formatMillions,
  publishedTotal,
  readVisit,
  snapshotOf,
  squadFacts,
  transferRows,
  visitChanges,
  writeVisit,
  lastMinutes,
  type SquadFacts,
  type VisitChange,
  type VisitSnapshot,
} from "./plus-briefing-data";
import { EXAMPLE_DEADLINE, exampleAlternatives, exampleBriefing } from "./plus-briefing-example";

import "./plus-briefing.css";

/**
 * « Briefing avant la deadline » (docs/product/botolago-plus-deadline-briefing-brief.md): a
 * scoreboard with the countdown and four tallies, a strip of what changed since this device's last
 * visit, and a deck of four decision cards (absences, replacements, captain, transfers).
 *
 *   - off: nothing, no node and no request;
 *   - signed out: the countdown and « Créez un compte pour préparer votre équipe »;
 *   - not a member: the real countdown clear, the example deck blurred under the lock and
 *     « Découvrir ». The paid reads are not made and no member figure is rendered;
 *   - a member: everything, from one read (and one more for the alternatives of a chosen player).
 *
 * Display only: nothing is saved here, the buttons open the transfer and team screens.
 */
export function PlusBriefingScreen() {
  const access = usePlusAccess();
  const premium = usePremium();
  const { status } = useAuth();
  if (access === "off") return <PlusBriefingOff settled={premium.ready} />;
  if (status !== "authenticated") return <GuestBriefing />;
  if (access === "locked") return <LockedBriefing />;
  return <MemberBriefing />;
}

/** Nothing renders while the feature is off; once the answer is in, the reader goes back to Fantasy. */
function PlusBriefingOff({ settled }: { settled: boolean }) {
  const navigate = useNavigate();
  useEffect(() => {
    if (settled) void navigate({ to: "/fantasy", replace: true });
  }, [settled, navigate]);
  return null;
}

// ---------------------------------------------------------------------------
// The clock: the deadline, from the same gameweek the free card uses
// ---------------------------------------------------------------------------

function useDeadlineGameweek(enabled: boolean): Gameweek | null {
  const query = useQuery({
    queryKey: ["gameweek"],
    queryFn: () => fantasyService.getCurrentGameweek(),
    enabled,
    staleTime: 60_000,
    retry: 1,
  });
  return query.data ?? null;
}

export function GuestBriefing() {
  const { t } = usePlusCopy();
  const gw = useGw();
  const gameweek = useDeadlineGameweek(true);
  return (
    <BriefingPanel>
      <TopBar />
      <Board
        gwName={gameweek ? gw(gameweek.number) : null}
        deadlineAt={gameweek?.deadline ?? null}
      />
      <div className="pb-state" data-testid="plus-briefing-guest">
        <Link to="/auth/login" className="pb-btn pb-btn--pri">
          {t("plus.brief.guest_cta")}
          <ArrowRight aria-hidden />
        </Link>
      </div>
    </BriefingPanel>
  );
}

export function LockedBriefing() {
  const { t } = usePlusCopy();
  const gw = useGw();
  const gameweek = useDeadlineGameweek(true);
  const example = useMemo(() => exampleBriefing(), []);
  const deadline = gameweek?.deadline ?? EXAMPLE_DEADLINE;
  const gwName = gw(gameweek ? gameweek.number : example.gameweek.sequence);
  return (
    <div className="pb-page" data-testid="plus-briefing-locked-page">
      <PlusLockedSection
        testId="plus-briefing-locked"
        via="briefing"
        headline={t("plus.brief.locked_title")}
        head={
          <div className="pb">
            <TopBar />
            <Board gwName={gwName} deadlineAt={deadline} />
          </div>
        }
      >
        <div className="pb">
          <Deck
            view={example}
            facts={squadFacts(example)}
            alternatives={exampleAlternatives(example.squad[7]!.fantasyPlayerId)}
            alternativesPending={false}
            preview
          />
        </div>
      </PlusLockedSection>
    </div>
  );
}

function MemberBriefing() {
  const { t } = usePlusCopy();
  const gw = useGw();
  const { user } = useAuth();
  const gameweek = useDeadlineGameweek(true);
  const briefing = useBriefing(true);
  const state = briefing.data;
  if (briefing.isPending) {
    return (
      <BriefingPanel>
        <TopBar />
        <div className="pb-skeleton" aria-hidden />
        <span className="sr-only">{t("plus.brief.loading")}</span>
      </BriefingPanel>
    );
  }
  if (briefing.isError || !state || state.kind === "unavailable") {
    return (
      <BriefingPanel>
        <TopBar />
        <p className="pb-note" role="status">
          {t("plus.brief.failed")}
        </p>
      </BriefingPanel>
    );
  }
  if (state.kind === "empty") {
    return (
      <BriefingPanel>
        <TopBar />
        <Board
          gwName={gameweek ? gw(gameweek.number) : null}
          deadlineAt={gameweek?.deadline ?? null}
        />
        <p className="pb-note" role="status" data-testid="plus-briefing-empty">
          {t("plus.brief.empty")}
        </p>
      </BriefingPanel>
    );
  }
  return (
    <MemberView
      view={state.view}
      userId={user?.id ?? null}
      displayName={user?.displayName ?? null}
    />
  );
}

// ---------------------------------------------------------------------------
// The member's briefing
// ---------------------------------------------------------------------------

/** What this device saw last time, and what changed: read on this device, never from the server. */
function useSinceLastVisit(view: BriefingMember, userId: string | null) {
  const [previous, setPrevious] = useState<VisitSnapshot | null>(null);
  const [ready, setReady] = useState(false);
  const gameweekId = view.gameweek.id;
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void (async () => {
      const stored = readVisit(userId);
      const seed = stored ?? (await premiumBriefingService.previousVisitSeed());
      if (cancelled) return;
      setPrevious(seed);
      setReady(true);
      writeVisit(userId, snapshotOf(view, new Date().toISOString()));
    })();
    return () => {
      cancelled = true;
    };
    // The snapshot is taken once per gameweek per visit; `view` is read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameweekId, userId]);
  const changes = useMemo(() => visitChanges(previous, view), [previous, view]);
  return { previous, changes, ready };
}

export function MemberView({
  view,
  userId,
  displayName,
}: {
  view: BriefingMember;
  userId: string | null;
  displayName: string | null;
}) {
  const gw = useGw();
  const facts = useMemo(() => squadFacts(view), [view]);
  const visit = useSinceLastVisit(view, userId);
  const [replaceId, setReplaceId] = useState<string | null>(null);
  const chosen = replaceId ?? defaultReplace(facts, view);
  const alternatives = useBriefingAlternatives(true, chosen);
  return (
    <BriefingPanel>
      <TopBar who={displayName ? `${displayName} · ${view.team.name}` : view.team.name} />
      <Board
        gwName={gw(view.gameweek.sequence)}
        deadlineAt={view.gameweek.deadlineAt}
        view={view}
        facts={facts}
      />
      <Ticker visit={visit} view={view} />
      <Deck
        view={view}
        facts={facts}
        replaceId={chosen}
        onReplace={setReplaceId}
        alternatives={alternatives.data ?? null}
        alternativesPending={alternatives.isPending && alternatives.fetchStatus !== "idle"}
      />
    </BriefingPanel>
  );
}

// ---------------------------------------------------------------------------
// Frame, top bar, scoreboard
// ---------------------------------------------------------------------------

function BriefingPanel({ children }: { children: ReactNode }) {
  const { t } = usePlusCopy();
  return (
    <div className="pb-page" data-testid="plus-briefing">
      <PlusEmbed
        className="plus-embed--night"
        aria-label={t("plus.brief.aria")}
        data-testid="plus-briefing-panel"
      >
        <div className="pb">{children}</div>
      </PlusEmbed>
    </div>
  );
}

function TopBar({ who }: { who?: string }) {
  const { t } = usePlusCopy();
  return (
    <div className="pb-top">
      <Link to="/fantasy" className="pb-back">
        <ArrowLeft aria-hidden />
        {t("common.back")}
      </Link>
      <PlusLogo label={PLUS_NAME} className="pb-logo" />
      {who ? (
        <span className="pb-who">
          <b>{who}</b>
        </span>
      ) : null}
    </div>
  );
}

function Digits({ value }: { value: number | null }) {
  const text = value === null ? "––" : String(value).padStart(2, "0");
  return (
    <div className="pb-digits">
      {[...text].map((char, index) => (
        <div className="pb-d" key={`${index}-${char}`}>
          <span className="pb-num">{char}</span>
        </div>
      ))}
    </div>
  );
}

/** The scoreboard: the title, the LED-style countdown and, for a member, four tally cells. */
function Board({
  gwName,
  deadlineAt,
  view,
  facts,
}: {
  gwName: string | null;
  deadlineAt: string | null;
  view?: BriefingMember;
  facts?: SquadFacts;
}) {
  const { t, f, text, lang } = usePlusCopy();
  const left = useDeadlineCountdown(deadlineAt);
  const now = useMemo(() => new Date(), []);
  const when = deadlineAt ? formatDeadlineParts(lang, deadlineAt) : null;
  const passed = left?.passed === true;
  return (
    <section className="pb-board" aria-labelledby="pb-title" data-testid="plus-briefing-board">
      <span className="pb-bolt pb-bolt--a" aria-hidden />
      <span className="pb-bolt pb-bolt--b" aria-hidden />
      <div>
        <p className="pb-eyebrow">
          <span className="pb-dot" aria-hidden />
          <span suppressHydrationWarning>
            {text("plus.brief.eyebrow", {
              gw: gwName ?? "",
              date: formatDay(lang, now.toISOString()),
            })}
          </span>
        </p>
        <h1 className="pb-title" id="pb-title">
          {when
            ? f("plus.brief.title", { gw: gwName ?? "", date: when.date, time: when.time })
            : t("plus.brief.title_nodate")}
        </h1>
      </div>
      {passed ? (
        <p className="pb-passed" role="status">
          {t("plus.brief.passed")}
        </p>
      ) : (
        <>
          <span className="sr-only">{left ? countdownText(left, t) : null}</span>
          <div className="pb-clock" aria-hidden>
            <div className="pb-unit">
              <Digits value={left ? left.days : null} />
              <small>{t("plus.brief.unit_days")}</small>
            </div>
            <span className="pb-colon">:</span>
            <div className="pb-unit">
              <Digits value={left ? left.hours : null} />
              <small>{t("plus.brief.unit_hours")}</small>
            </div>
            <span className="pb-colon">:</span>
            <div className="pb-unit">
              <Digits value={left ? left.minutes : null} />
              <small>{t("plus.brief.unit_minutes")}</small>
            </div>
          </div>
        </>
      )}
      {view && facts ? (
        <dl className="pb-cells">
          <Cell
            tone={facts.absent.length > 0 ? "red" : undefined}
            label={t("plus.brief.cell_absent")}
            value={facts.absent.length}
          />
          <Cell
            tone={facts.noInfo.length > 0 ? "amber" : undefined}
            label={t("plus.brief.cell_noinfo")}
            value={facts.noInfo.length}
          />
          <Cell tone="mint" label={t("plus.brief.cell_free")} value={view.team.freeTransfers} />
          <div className="pb-cell">
            <dt>{t("plus.brief.cell_rank")}</dt>
            <dd>
              {view.league ? (
                <>
                  {view.league.rank}
                  <small>/{view.league.size}</small>
                </>
              ) : (
                "–"
              )}
            </dd>
          </div>
        </dl>
      ) : null}
    </section>
  );
}

function Cell({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "red" | "amber" | "mint";
}) {
  return (
    <div className={cn("pb-cell", tone && `pb-cell--${tone}`)}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// « Depuis votre visite »
// ---------------------------------------------------------------------------

function changeText(
  change: VisitChange,
  view: BriefingMember,
  text: ReturnType<typeof usePlusCopy>["text"],
  lang: string,
  gwOf: (sequence: number) => string,
): string {
  switch (change.kind) {
    case "published": {
      return text("plus.brief.chg_published", {
        gw: gwOf(change.sequence),
        date: change.publishedAt ? formatDay(lang, change.publishedAt) : "",
        rated: change.rated,
        waiting: change.waiting,
      });
    }
    case "absent":
      return text("plus.brief.chg_absent", { names: change.names.join(", ") });
    case "overtaken":
      return text("plus.brief.chg_overtaken", {
        names: change.names.join(", "),
        rank: change.rank,
        size: change.size,
      });
    case "rank":
      return text("plus.brief.chg_rank", {
        from: change.from,
        rank: change.rank,
        size: change.size,
      });
  }
}

function Ticker({
  visit,
  view,
}: {
  visit: { previous: VisitSnapshot | null; changes: VisitChange[]; ready: boolean };
  view: BriefingMember;
}) {
  const { t, text, lang } = usePlusCopy();
  const gw = useGw();
  const [paused, setPaused] = useState(false);
  if (!visit.ready) return null;
  const items = visit.changes.map((change) => changeText(change, view, text, lang, gw));
  if (items.length === 0) {
    items.push(visit.previous ? t("plus.brief.chg_none") : t("plus.brief.chg_first"));
  }
  const label = visit.previous
    ? text("plus.brief.since", { date: formatDay(lang, visit.previous.at) })
    : t("plus.brief.since_first");
  return (
    <section className="pb-ticker" aria-label={label} data-testid="plus-briefing-ticker">
      <p className="pb-tlabel">
        <span>{label}</span>
        <small>{t("plus.brief.device")}</small>
      </p>
      <button
        type="button"
        className="pb-pause"
        aria-pressed={paused}
        aria-label={paused ? t("plus.brief.ticker_play") : t("plus.brief.ticker_pause")}
        onClick={() => setPaused((value) => !value)}
      >
        {paused ? <Play aria-hidden /> : <Pause aria-hidden />}
      </button>
      <div className="pb-twin">
        <ul className="pb-track pb-track--crawl" data-paused={paused}>
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
          {items.map((item) => (
            <li key={`dup-${item}`} className="pb-dup" aria-hidden>
              {item}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// The deck
// ---------------------------------------------------------------------------

const CARD_IDS = ["absences", "replace", "captain", "transfers"] as const;
type CardId = (typeof CARD_IDS)[number];

function Deck({
  view,
  facts,
  replaceId = null,
  onReplace,
  alternatives,
  alternativesPending,
  preview = false,
}: {
  view: BriefingMember;
  facts: SquadFacts;
  replaceId?: string | null;
  onReplace?: (id: string) => void;
  alternatives: AlternativesMember | null;
  alternativesPending: boolean;
  /** The blurred example under the lock: nothing in it is interactive or live. */
  preview?: boolean;
}) {
  const { t } = usePlusCopy();
  const deckRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<CardId>("absences");
  const labels: Record<CardId, string> = {
    absences: t("plus.brief.tab_absences"),
    replace: t("plus.brief.tab_replace"),
    captain: t("plus.brief.tab_captain"),
    transfers: t("plus.brief.tab_transfers"),
  };
  useEffect(() => {
    const deck = deckRef.current;
    if (!deck || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            setActive(entry.target.getAttribute("data-card") as CardId);
          }
        }
      },
      { root: deck, threshold: [0.6] },
    );
    deck.querySelectorAll("[data-card]").forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, []);
  const go = (id: CardId) => {
    setActive(id);
    const card = deckRef.current?.querySelector(`[data-card="${id}"]`);
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
    card?.scrollIntoView({
      behavior: reduce ? "auto" : "smooth",
      inline: "start",
      block: "nearest",
    });
  };
  const alert = facts.absent.length > 0;
  return (
    <>
      <nav className="pb-pager" aria-label={t("plus.brief.pager_aria")}>
        {CARD_IDS.map((id, index) => (
          <button
            key={id}
            type="button"
            className="pb-pg"
            aria-current={active === id ? "true" : undefined}
            tabIndex={preview ? -1 : undefined}
            onClick={() => go(id)}
          >
            <span className="pb-num">{index + 1}</span>
            {labels[id]}
            {id === "absences" && alert ? <i className="pb-alert" aria-hidden /> : null}
          </button>
        ))}
      </nav>
      <div className="pb-deck" ref={deckRef} data-testid="plus-briefing-deck">
        <AbsencesCard view={view} facts={facts} number={1} />
        <SwapCard
          view={view}
          number={2}
          replaceId={replaceId}
          onReplace={onReplace}
          alternatives={alternatives}
          pending={alternativesPending}
          preview={preview}
        />
        <CaptainCard view={view} number={3} preview={preview} />
        <TransfersCard view={view} number={4} preview={preview} />
      </div>
    </>
  );
}

function CardHead({ number, label }: { number: number; label: string }) {
  const { text } = usePlusCopy();
  return (
    <p className="pb-no">
      <span>{text("plus.brief.card_of", { n: number })}</span>
      <span className="pb-sr-only sr-only">{label}</span>
    </p>
  );
}

function useKnownLabels() {
  const { t } = useI18n();
  return (position: BriefingPlayer["position"]): string => {
    switch (position) {
      case "GK":
        return t("pepites.position.gk");
      case "DEF":
        return t("pepites.position.def");
      case "MID":
        return t("pepites.position.mid");
      case "FWD":
        return t("pepites.position.fwd");
    }
  };
}

/** « J11 » / « الجولة 11 »: a journée by its number, never by the name stored with it. */
function useGw() {
  const { text } = usePlusCopy();
  return (sequence: number) => text("plus.brief.gw_short", { n: sequence });
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join("");
}

// ---- 1. Absences -----------------------------------------------------------

function AbsencesCard({
  view,
  facts,
  number,
}: {
  view: BriefingMember;
  facts: SquadFacts;
  number: number;
}) {
  const { t, f, text, lang } = usePlusCopy();
  const gw = useGw();
  const position = useKnownLabels();
  const [open, setOpen] = useState(false);
  const listed = facts.feedListed > 0;
  return (
    <section className="pb-card" data-card="absences" aria-labelledby="pb-c1">
      <CardHead number={number} label={t("plus.brief.tab_absences")} />
      <h2 id="pb-c1">
        {f("plus.brief.abs_title", { n: view.squad.length, a: facts.absent.length })}
      </h2>
      <div className="pb-rows">
        {facts.absent.map((player) => (
          <div className="pb-row pb-row--abs" key={player.fantasyPlayerId}>
            <span className="pb-av" aria-hidden>
              {initials(player.name)}
            </span>
            <div>
              <p className="pb-nm">
                <bdi>{player.name}</bdi>
              </p>
              <p className="pb-meta">
                {player.club.shortName} · {position(player.position)}
              </p>
              <p className="pb-st">
                {player.absence?.category === "suspension"
                  ? t("plus.brief.abs_suspension")
                  : t("plus.brief.abs_injury")}
                {" · "}
                {player.absence
                  ? text("plus.brief.abs_source", { date: formatDay(lang, player.absence.asOf) })
                  : null}
                {player.absence?.expectedReturnOn
                  ? ` · ${text("plus.brief.abs_return", { date: formatDay(lang, player.absence.expectedReturnOn) })}`
                  : null}
              </p>
            </div>
          </div>
        ))}
        {facts.noInfo.map((player) => {
          const last = lastMinutes(player);
          return (
            <div className="pb-row pb-row--unk" key={player.fantasyPlayerId}>
              <span className="pb-av" aria-hidden>
                {initials(player.name)}
              </span>
              <div>
                <p className="pb-nm">
                  <bdi>{player.name}</bdi>
                </p>
                <p className="pb-meta">
                  {player.club.shortName} · {position(player.position)}
                </p>
                <p className="pb-st">
                  {text("plus.brief.abs_noinfo", {
                    n: last?.minutes ?? 0,
                    gw: last ? gw(last.sequence) : "",
                  })}
                </p>
              </div>
            </div>
          );
        })}
        {facts.absent.length === 0 && facts.noInfo.length === 0 ? (
          <p className="pb-note">
            {listed ? t("plus.brief.abs_none_listed") : t("plus.brief.abs_no_feed")}
          </p>
        ) : null}
      </div>
      {facts.others.length > 0 ? (
        <>
          <button
            type="button"
            className="pb-fold"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            <span>
              {f("plus.brief.abs_others", { n: facts.others.length })}
              {" · "}
              {listed ? t("plus.brief.abs_others_ok") : t("plus.brief.abs_others_nofeed")}
            </span>
            <ChevronDown aria-hidden />
          </button>
          {open ? (
            <ul className="pb-rows">
              {facts.others.map((player) => (
                <li className="pb-note" key={player.fantasyPlayerId}>
                  <bdi>{player.name}</bdi>
                  <span className="pb-meta">
                    {" "}
                    · {player.club.shortName} · {position(player.position)}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
      <p className="pb-honest">
        <Info aria-hidden />
        <span>{listed ? t("plus.brief.abs_honest") : t("plus.brief.abs_honest_nofeed")}</span>
      </p>
    </section>
  );
}

// ---- shared: published stamps and form cells -------------------------------

function Stamps({ view }: { view: BriefingMember }) {
  const { text } = usePlusCopy();
  const { lang } = useI18n();
  const gw = useGw();
  return (
    <div className="pb-stamps">
      {view.published.map((g) => (
        <span
          className={cn("pb-stamp", g.state !== "published" && "pb-stamp--part")}
          key={g.sequence}
        >
          {g.state === "pending" || !g.publishedAt
            ? text("plus.brief.stamp_pending", { gw: gw(g.sequence) })
            : g.state === "partial"
              ? text("plus.brief.stamp_partial", {
                  gw: gw(g.sequence),
                  date: formatDay(lang, g.publishedAt),
                })
              : text("plus.brief.stamp_published", {
                  gw: gw(g.sequence),
                  date: formatDay(lang, g.publishedAt),
                })}
        </span>
      ))}
    </div>
  );
}

function FormCells({ view, form }: { view: BriefingMember; form: FormCell[] }) {
  const { t } = usePlusCopy();
  const gw = useGw();
  return (
    <div className="pb-gw">
      {view.published.map((g) => {
        const cell = cellFor({ form }, g.sequence);
        if (!cell || cell.state === "pending") {
          return (
            <div className="pb-g pb-g--wait" key={g.sequence}>
              <small>{gw(g.sequence)}</small>
              <b>{t("plus.brief.pending")}</b>
            </div>
          );
        }
        if (cell.state === "no_rating") {
          return (
            <div className="pb-g pb-g--none" key={g.sequence}>
              <small>{gw(g.sequence)}</small>
              <b>{t("plus.brief.no_rating")}</b>
            </div>
          );
        }
        return (
          <div className="pb-g" key={g.sequence}>
            <small>{gw(g.sequence)}</small>
            <span className="pb-num">{cell.points}</span>
          </div>
        );
      })}
    </div>
  );
}

function MoneyText({ value }: { value: number }) {
  return <FantasyAmount value={value} className="pb-num" />;
}

// ---- 2. Remplacer -----------------------------------------------------------

function SwapCard({
  view,
  number,
  replaceId,
  onReplace,
  alternatives,
  pending,
  preview,
}: {
  view: BriefingMember;
  number: number;
  replaceId: string | null;
  onReplace?: (id: string) => void;
  alternatives: AlternativesMember | null;
  pending: boolean;
  preview: boolean;
}) {
  const { t, f, text, count, lang } = usePlusCopy();
  const gw = useGw();
  const position = useKnownLabels();
  const [pick, setPick] = useState<string | null>(null);
  const out = view.squad.find((p) => p.fantasyPlayerId === replaceId) ?? view.squad[0] ?? null;
  const rows = transferRows(view.team.freeTransfers);
  const first = rows[0]!;
  const second = rows[1]!;
  const known = (id: string) => view.squad.some((p) => p.fantasyPlayerId === id);
  return (
    <section className="pb-card" data-card="replace" aria-labelledby="pb-c2">
      <CardHead number={number} label={t("plus.brief.tab_replace")} />
      <h2 id="pb-c2">
        {out ? f("plus.brief.swap_title", { name: out.name }) : t("plus.brief.tab_replace")}
      </h2>
      <label className="pb-select">
        {t("plus.brief.swap_pick")}
        <select
          value={out?.fantasyPlayerId ?? ""}
          disabled={preview}
          onChange={(event) => {
            setPick(null);
            if (known(event.target.value)) onReplace?.(event.target.value);
          }}
        >
          {view.squad.map((player) => (
            <option key={player.fantasyPlayerId} value={player.fantasyPlayerId}>
              {player.name} · {player.club.shortName}
              {player.absence ? ` · ${t("plus.brief.abs_injury_short")}` : ""}
            </option>
          ))}
        </select>
      </label>
      {alternatives ? (
        <p className="pb-budget">
          {f("plus.brief.swap_budget", {
            sale: formatMillions(lang, alternatives.budget.salePrice),
            bank: formatMillions(lang, alternatives.budget.bank),
            max: formatMillions(lang, alternatives.budget.max),
            unit: t("fantasy.players.price_unit"),
          })}
        </p>
      ) : null}
      <Stamps view={view} />
      {pending ? <div className="pb-skeleton" aria-hidden /> : null}
      {alternatives && alternatives.items.length === 0 ? (
        <p className="pb-note">{t("plus.brief.swap_none")}</p>
      ) : null}
      {alternatives && alternatives.items.length > 0 ? (
        <div className="pb-sheet" role="radiogroup" aria-label={t("plus.brief.swap_list")}>
          {alternatives.items.map((item) => (
            <button
              type="button"
              role="radio"
              aria-checked={pick === item.fantasyPlayerId}
              tabIndex={preview ? -1 : undefined}
              className="pb-pl"
              key={item.fantasyPlayerId}
              onClick={() => setPick(item.fantasyPlayerId)}
            >
              <span className="pb-radio" aria-hidden />
              <span className="pb-n">
                <bdi>{item.name}</bdi>
                <small>
                  {item.club.shortName} · {position(item.position)} ·{" "}
                  {text("plus.brief.club_after", {
                    k: item.clubInSquadAfter,
                    n: alternatives.maxPerClub,
                  })}
                </small>
              </span>
              <span className="pb-p">
                <FantasyAmount value={item.price} />
              </span>
              <FormCells view={view} form={item.form} />
            </button>
          ))}
        </div>
      ) : null}
      <p className="pb-footnote">
        <b>{t("plus.brief.no_rating")}</b> {t("plus.brief.swap_footnote")}
      </p>
      <div className="pb-cost">
        <p className={first.paid === 0 ? "pb-ok" : "pb-warn"}>
          {first.paid === 0 ? <Check aria-hidden /> : <TriangleAlert aria-hidden />}
          <span>
            {first.paid === 0
              ? t("plus.brief.cost_first_free")
              : text("plus.brief.cost_first_paid", { pts: count(first.hitPoints, "points") })}
          </span>
        </p>
        <p className="pb-warn">
          <TriangleAlert aria-hidden />
          <span>
            {text("plus.brief.cost_second", {
              pts: count(Math.max(0, second.hitPoints - first.hitPoints), "points"),
              gw: gw(view.gameweek.sequence),
            })}
          </span>
        </p>
      </div>
      <Link
        to="/fantasy/transfers"
        className="pb-btn pb-btn--pri"
        tabIndex={preview ? -1 : undefined}
      >
        {t("plus.brief.swap_cta")}
        <ArrowRight aria-hidden />
      </Link>
      <p className="pb-honest">
        <Info aria-hidden />
        <span>{t("plus.brief.opens_transfers")}</span>
      </p>
    </section>
  );
}

// ---- 3. Capitaine -----------------------------------------------------------

function CaptainCard({
  view,
  number,
  preview,
}: {
  view: BriefingMember;
  number: number;
  preview: boolean;
}) {
  const { t, f, text } = usePlusCopy();
  const gw = useGw();
  const position = useKnownLabels();
  const [pick, setPick] = useState<string | null>(null);
  const candidates = captainCandidates(view);
  const total = view.published.filter((g) => g.state !== "pending").length;
  return (
    <section className="pb-card" data-card="captain" aria-labelledby="pb-c3">
      <CardHead number={number} label={t("plus.brief.tab_captain")} />
      <h2 id="pb-c3">{text("plus.brief.cap_title", { gw: gw(view.gameweek.sequence) })}</h2>
      <Stamps view={view} />
      <p className="pb-x2">
        <span className="pb-num">×{view.team.captainMultiplier}</span>
        <span>
          {text("plus.brief.cap_x2", {
            m: view.team.captainMultiplier,
            gw: gw(view.gameweek.sequence),
          })}
        </span>
      </p>
      <div className="pb-cands" role="radiogroup" aria-label={t("plus.brief.cap_list")}>
        {candidates.map((player) => {
          const sum = publishedTotal(player);
          const next = player.nextFixture;
          return (
            <button
              type="button"
              role="radio"
              aria-checked={pick === player.fantasyPlayerId}
              tabIndex={preview ? -1 : undefined}
              className="pb-cand"
              key={player.fantasyPlayerId}
              onClick={() => setPick(player.fantasyPlayerId)}
            >
              <span className="pb-ch">
                <span className="pb-radio" aria-hidden />
                <span className="pb-nm">
                  <bdi>{player.name}</bdi>
                  <small>
                    {player.club.shortName} · {position(player.position)}
                  </small>
                </span>
                <span className="pb-tot">
                  <span className="pb-num">{sum.total}</span>
                  <small>
                    {text("plus.brief.cap_total", {
                      k: sum.journees,
                      n: Math.max(total, sum.journees),
                    })}
                  </small>
                </span>
              </span>
              {player.captain ? (
                <span className="pb-current">{t("plus.brief.cap_current")}</span>
              ) : null}
              {player.viceCaptain ? (
                <span className="pb-current">{t("plus.brief.cap_vice")}</span>
              ) : null}
              <FormCells view={view} form={player.form} />
              <span className="pb-fx">
                {next ? (
                  <>
                    <span className="pb-opp">
                      <span>
                        {f("plus.brief.cap_vs", {
                          gw: gw(view.gameweek.sequence),
                          club: next.opponent.shortName,
                        })}
                      </span>
                      <small>{next.isHome ? t("plus.brief.home") : t("plus.brief.away")}</small>
                    </span>
                    <span className="pb-diff">
                      <b>{f("plus.brief.cap_diff", { d: next.difficulty })}</b>
                      <span className="pb-dp" aria-hidden>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <i key={n} className={n <= next.difficulty ? "pb-on" : undefined} />
                        ))}
                      </span>
                      <small>
                        {next.confidence === "high"
                          ? t("plus.brief.conf_high")
                          : next.confidence === "medium"
                            ? t("plus.brief.conf_medium")
                            : t("plus.brief.conf_low")}
                      </small>
                    </span>
                  </>
                ) : (
                  <span className="pb-meta">{t("plus.brief.cap_nofixture")}</span>
                )}
              </span>
            </button>
          );
        })}
        {candidates.length === 0 ? <p className="pb-note">{t("plus.brief.cap_none")}</p> : null}
      </div>
      <p className="pb-honest">
        <Info aria-hidden />
        <span>{t("plus.brief.cap_honest")}</span>
      </p>
      <Link to="/fantasy/team" className="pb-btn pb-btn--pri" tabIndex={preview ? -1 : undefined}>
        {t("plus.brief.cap_cta")}
        <ArrowRight aria-hidden />
      </Link>
      <p className="pb-honest">
        <Info aria-hidden />
        <span>{t("plus.brief.opens_team")}</span>
      </p>
    </section>
  );
}

// ---- 4. Transferts ----------------------------------------------------------

function TransfersCard({
  view,
  number,
  preview,
}: {
  view: BriefingMember;
  number: number;
  preview: boolean;
}) {
  const { t, f, text, count } = usePlusCopy();
  const gw = useGw();
  const rows = transferRows(view.team.freeTransfers);
  return (
    <section className="pb-card" data-card="transfers" aria-labelledby="pb-c4">
      <CardHead number={number} label={t("plus.brief.tab_transfers")} />
      <h2 id="pb-c4">{text("plus.brief.tr_title", { gw: gw(view.gameweek.sequence) })}</h2>
      <div className="pb-big2">
        <div>
          <span className="pb-num">{view.team.freeTransfers}</span>
          <small>{t("plus.brief.cell_free")}</small>
        </div>
        <div>
          <FantasyAmount value={view.team.bank} className="pb-num" />
          <small>{t("plus.brief.tr_bank")}</small>
        </div>
      </div>
      <ul className="pb-cost">
        {rows.map((row) => (
          <li className={row.paid === 0 ? "pb-ok" : "pb-warn"} key={row.transfers}>
            {row.paid === 0 ? <Check aria-hidden /> : <TriangleAlert aria-hidden />}
            <span>
              {row.transfers === 1
                ? t("plus.brief.tr_one")
                : row.transfers === 2
                  ? t("plus.brief.tr_two")
                  : f("plus.brief.tr_many", { n: row.transfers })}
              {" : "}
              <b>
                {row.paid === 0 ? t("plus.brief.cost_free") : `−${count(row.hitPoints, "points")}`}
              </b>
            </span>
          </li>
        ))}
      </ul>
      <p className="pb-honest">
        <Info aria-hidden />
        <span>{text("plus.brief.tr_honest", { gw: gw(view.gameweek.sequence) })}</span>
      </p>
      <Link
        to="/fantasy/transfers"
        className="pb-btn pb-btn--pri"
        tabIndex={preview ? -1 : undefined}
      >
        {t("plus.brief.tr_cta")}
        <ArrowRight aria-hidden />
      </Link>
      <p className="pb-honest">
        <Info aria-hidden />
        <span>{t("plus.brief.opens_transfers")}</span>
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// The Fantasy hub's entry
// ---------------------------------------------------------------------------

/**
 * The way in, under the free deadline card on the Fantasy hub: nothing while the feature is off,
 * and for everyone else a link to the briefing (the screen decides what the reader sees there).
 */
export function PlusBriefingEntry({ gameweekNumber }: { gameweekNumber: number }) {
  const access = usePlusAccess();
  const { t, text } = usePlusCopy();
  if (access === "off") return null;
  return (
    <Link to="/fantasy/briefing" className="pb-entry" data-testid="plus-briefing-entry">
      <PlusLogo label={PLUS_NAME} height={16} />
      <span className="pb-entry-text">
        <b>{text("plus.brief.entry_title", { gw: gameweekNumber })}</b>
        <small>{t("plus.brief.entry_sub")}</small>
      </span>
      <ArrowRight className="pb-entry-go" aria-hidden />
    </Link>
  );
}
