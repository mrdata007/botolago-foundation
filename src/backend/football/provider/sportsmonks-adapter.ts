import { z } from "zod";
import { FootballError } from "../errors";
import type {
  FootballProvider,
  ProviderAvailability,
  ProviderCompetition,
  ProviderFixture,
  ProviderFreshness,
  ProviderLineup,
  ProviderMatchEvent,
  ProviderMatchStatistic,
  ProviderPage,
  ProviderPageRequest,
  ProviderPlayer,
  ProviderRateLimit,
  ProviderRound,
  ProviderSeason,
  ProviderSquadMembership,
  ProviderStanding,
  ProviderTeam,
} from "./contracts";
import { providerCompetitionSchema, providerFixtureSchema, providerTeamSchema } from "./schemas";

const SPORTSMONKS_BASE_URL = "https://api.sportmonks.com/v3/football";
const MAX_PAGE_SIZE = 50;
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type CompetitionType = ProviderCompetition["type"];
type FixtureState = Pick<ProviderFixture, "status" | "period">;

export interface SportsmonksProviderConfig {
  readonly token: string;
  readonly leagueId: number;
  readonly seasonId: number;
  readonly countryCode: string;
  readonly competitionType: CompetitionType;
  readonly seasonStartsOn: string;
  readonly seasonEndsOn: string;
  readonly fixtureFrom: string;
  readonly fixtureTo: string;
  readonly timeoutMs?: number;
  readonly maxRetries?: number;
  readonly retryBaseMs?: number;
  readonly circuitFailureThreshold?: number;
  readonly circuitResetMs?: number;
  readonly fetch?: FetchLike;
  readonly sleep?: (milliseconds: number) => Promise<void>;
  readonly now?: () => Date;
}

const envelopeSchema = z
  .object({
    data: z.unknown(),
    pagination: z.unknown().optional(),
    meta: z.unknown().optional(),
    rate_limit: z.unknown().optional(),
  })
  .passthrough();

const leagueSchema = z
  .object({
    id: z.number().int().positive(),
    name: z.string().trim().min(2).max(160),
    short_code: z.string().trim().min(1).max(40).nullish(),
  })
  .passthrough();

const seasonSchema = z
  .object({
    id: z.number().int().positive(),
    league_id: z.number().int().positive(),
    name: z.string().trim().min(1).max(120),
    is_current: z.boolean().nullish(),
    starting_at: z.string().nullish(),
    ending_at: z.string().nullish(),
  })
  .passthrough();

const roundSchema = z
  .object({
    id: z.number().int().positive(),
    season_id: z.number().int().positive(),
    name: z.union([z.string(), z.number()]),
    number: z.number().int().nonnegative().nullish(),
    updated_at: z.string().nullish(),
  })
  .passthrough();

const teamSchema = z
  .object({
    id: z.number().int().positive(),
    name: z.string().trim().min(2).max(160),
    short_code: z.string().trim().min(1).max(40).nullish(),
    last_played_at: z.string().nullish(),
    updated_at: z.string().nullish(),
  })
  .passthrough();

const participantSchema = z
  .object({
    id: z.number().int().positive(),
    meta: z.object({ location: z.string() }).passthrough().nullish(),
  })
  .passthrough();

const scoreSchema = z
  .object({
    description: z.string().nullish(),
    score: z
      .object({
        goals: z.number().int().nonnegative(),
        participant: z.string(),
      })
      .passthrough(),
  })
  .passthrough();

const fixtureSchema = z
  .object({
    id: z.number().int().positive(),
    league_id: z.number().int().positive(),
    season_id: z.number().int().positive(),
    round_id: z.number().int().positive().nullish(),
    venue_id: z.number().int().positive().nullish(),
    starting_at: z.string(),
    last_processed_at: z.string().nullish(),
    state: z
      .object({
        developer_name: z.string().nullish(),
        state: z.string().nullish(),
        name: z.string().nullish(),
      })
      .passthrough(),
    participants: z.array(participantSchema),
    scores: z.array(scoreSchema).default([]),
  })
  .passthrough();

interface ParsedEnvelope {
  readonly data: unknown;
  readonly pagination?: unknown;
  readonly meta?: unknown;
  readonly rate_limit?: unknown;
}

interface RequestResult {
  readonly envelope: ParsedEnvelope;
  readonly rateLimit: ProviderRateLimit;
}

export class SportsmonksFootballProvider implements FootballProvider {
  readonly name = "sportsmonks";

  private readonly token: string;
  private readonly leagueId: number;
  private readonly seasonId: number;
  private readonly countryCode: string;
  private readonly competitionType: CompetitionType;
  private readonly seasonStartsOn: string;
  private readonly seasonEndsOn: string;
  private readonly fixtureFrom: string;
  private readonly fixtureTo: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryBaseMs: number;
  private readonly circuitFailureThreshold: number;
  private readonly circuitResetMs: number;
  private readonly fetchImpl: FetchLike;
  private readonly sleepImpl: (milliseconds: number) => Promise<void>;
  private readonly now: () => Date;
  private consecutiveFailures = 0;
  private openedAtMs: number | null = null;

  constructor(config: SportsmonksProviderConfig) {
    validateConfig(config);
    this.token = config.token.trim();
    this.leagueId = config.leagueId;
    this.seasonId = config.seasonId;
    this.countryCode = config.countryCode.toUpperCase();
    this.competitionType = config.competitionType;
    this.seasonStartsOn = config.seasonStartsOn;
    this.seasonEndsOn = config.seasonEndsOn;
    this.fixtureFrom = config.fixtureFrom;
    this.fixtureTo = config.fixtureTo;
    this.timeoutMs = config.timeoutMs ?? 10_000;
    this.maxRetries = config.maxRetries ?? 3;
    this.retryBaseMs = config.retryBaseMs ?? 250;
    this.circuitFailureThreshold = config.circuitFailureThreshold ?? 5;
    this.circuitResetMs = config.circuitResetMs ?? 30_000;
    this.fetchImpl = config.fetch ?? globalThis.fetch.bind(globalThis);
    this.sleepImpl =
      config.sleep ??
      ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.now = config.now ?? (() => new Date());
  }

  async listCompetitions(request: ProviderPageRequest): Promise<ProviderPage<ProviderCompetition>> {
    const offset = decodeLocalCursor("competitions", request.cursor);
    const result = await this.request(`/leagues/${this.leagueId}`, {}, request.signal);
    const raw = this.parseSingle(result.envelope.data, leagueSchema);
    const all = [
      providerCompetitionSchema.parse({
        externalId: String(raw.id),
        name: raw.name,
        shortName: raw.short_code ?? null,
        type: this.competitionType,
        countryCode: this.countryCode,
        freshness: this.freshness(raw, false),
      }),
    ];
    return localPage("competitions", all, offset, request.limit, result.rateLimit);
  }

  async listSeasons(request: ProviderPageRequest): Promise<ProviderPage<ProviderSeason>> {
    const offset = decodeLocalCursor("seasons", request.cursor);
    const result = await this.request(`/seasons/${this.seasonId}`, {}, request.signal);
    const raw = this.parseSingle(result.envelope.data, seasonSchema);
    if (raw.league_id !== this.leagueId) {
      throw invalidPayload();
    }
    const startsOn = parseDate(raw.starting_at ?? this.seasonStartsOn);
    const endsOn = parseDate(raw.ending_at ?? this.seasonEndsOn);
    const all: ProviderSeason[] = [
      {
        externalId: String(raw.id),
        competitionExternalId: String(raw.league_id),
        label: raw.name,
        startsOn,
        endsOn,
        current: raw.is_current ?? this.isConfiguredSeasonCurrent(),
        freshness: this.freshness(raw, false),
      },
    ];
    return localPage("seasons", all, offset, request.limit, result.rateLimit);
  }

  async listRounds(request: ProviderPageRequest): Promise<ProviderPage<ProviderRound>> {
    const offset = decodeLocalCursor("rounds", request.cursor);
    const result = await this.request(`/rounds/seasons/${this.seasonId}`, {}, request.signal);
    const rows = this.parseArray(result.envelope.data, roundSchema);
    const all = rows.map((raw): ProviderRound => {
      if (raw.season_id !== this.seasonId) throw invalidPayload();
      const name = String(raw.name).trim();
      return {
        externalId: String(raw.id),
        seasonExternalId: String(raw.season_id),
        number: raw.number ?? strictRoundNumber(name),
        name,
        freshness: this.freshness(raw, false),
      };
    });
    return localPage("rounds", all, offset, request.limit, result.rateLimit);
  }

  async listTeams(request: ProviderPageRequest): Promise<ProviderPage<ProviderTeam>> {
    const page = decodeRemoteCursor("teams", request.cursor);
    const result = await this.request(
      `/teams/seasons/${this.seasonId}`,
      { page: String(page), per_page: String(pageSize(request.limit)) },
      request.signal,
    );
    const rows = this.parseArray(result.envelope.data, teamSchema);
    const items = rows.map((raw) =>
      providerTeamSchema.parse({
        externalId: String(raw.id),
        name: raw.name,
        shortName: raw.short_code ?? raw.name.slice(0, 40),
        code: normalizedTeamCode(raw.short_code),
        countryCode: this.countryCode,
        freshness: this.freshness(raw, false),
      }),
    );
    return {
      items,
      nextCursor: hasMore(result.envelope, rows.length, pageSize(request.limit))
        ? encodeRemoteCursor("teams", page + 1)
        : null,
      rateLimit: result.rateLimit,
    };
  }

  async listFixtures(request: ProviderPageRequest): Promise<ProviderPage<ProviderFixture>> {
    const page = decodeRemoteCursor("fixtures", request.cursor);
    const result = await this.request(
      `/fixtures/between/${this.fixtureFrom}/${this.fixtureTo}`,
      {
        filters: `fixtureLeagues:${this.leagueId}`,
        include: "participants;state;scores",
        timezone: "UTC",
        page: String(page),
        per_page: String(pageSize(request.limit)),
      },
      request.signal,
    );
    const rows = this.parseArray(result.envelope.data, fixtureSchema);
    const items = rows.map((raw) => this.normalizeFixture(raw));
    return {
      items,
      nextCursor: hasMore(result.envelope, rows.length, pageSize(request.limit))
        ? encodeRemoteCursor("fixtures", page + 1)
        : null,
      rateLimit: result.rateLimit,
    };
  }

  listPlayers(_request: ProviderPageRequest): Promise<ProviderPage<ProviderPlayer>> {
    return unsupported("players");
  }

  listSquads(_request: ProviderPageRequest): Promise<ProviderPage<ProviderSquadMembership>> {
    return unsupported("squads");
  }

  listStandings(_request: ProviderPageRequest): Promise<ProviderPage<ProviderStanding>> {
    return unsupported("standings");
  }

  listLineups(_request: ProviderPageRequest): Promise<ProviderPage<ProviderLineup>> {
    return unsupported("lineups");
  }

  listMatchEvents(_request: ProviderPageRequest): Promise<ProviderPage<ProviderMatchEvent>> {
    return unsupported("match events");
  }

  listMatchStatistics(
    _request: ProviderPageRequest,
  ): Promise<ProviderPage<ProviderMatchStatistic>> {
    return unsupported("match statistics");
  }

  listAvailability(_request: ProviderPageRequest): Promise<ProviderPage<ProviderAvailability>> {
    return unsupported("player availability");
  }

  private async request(
    path: string,
    parameters: Readonly<Record<string, string>>,
    externalSignal?: AbortSignal,
  ): Promise<RequestResult> {
    this.assertCircuitClosed();
    const url = new URL(`${SPORTSMONKS_BASE_URL}${path}`);
    for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      const abort = () => controller.abort(externalSignal?.reason);
      externalSignal?.addEventListener("abort", abort, { once: true });
      if (externalSignal?.aborted) abort();
      try {
        const response = await this.fetchImpl(url, {
          method: "GET",
          headers: { Accept: "application/json", Authorization: this.token },
          signal: controller.signal,
        });
        const retryAfterMs = retryAfter(response.headers, this.now());
        if (!response.ok) {
          if (RETRYABLE_STATUSES.has(response.status) && attempt < this.maxRetries) {
            await this.sleepImpl(retryAfterMs ?? this.retryBaseMs * 2 ** attempt);
            continue;
          }
          const failure =
            response.status === 429
              ? new FootballError(
                  "provider_rate_limited",
                  "The football provider rate limit was reached.",
                )
              : response.status === 401 || response.status === 403 || response.status >= 500
                ? new FootballError(
                    "provider_unavailable",
                    "The football provider is temporarily unavailable.",
                  )
                : invalidPayload();
          this.recordFailure();
          throw failure;
        }
        const envelope = envelopeSchema.parse(await response.json()) as ParsedEnvelope;
        this.recordSuccess();
        return {
          envelope,
          rateLimit: parseRateLimit(response.headers, envelope.rate_limit, this.now()),
        };
      } catch (error) {
        if (error instanceof FootballError) throw error;
        if (attempt < this.maxRetries) {
          await this.sleepImpl(this.retryBaseMs * 2 ** attempt);
          continue;
        }
        this.recordFailure();
        if (error instanceof z.ZodError || error instanceof SyntaxError)
          throw invalidPayload(error);
        throw new FootballError(
          "provider_unavailable",
          "The football provider is temporarily unavailable.",
          error,
        );
      } finally {
        clearTimeout(timeout);
        externalSignal?.removeEventListener("abort", abort);
      }
    }
    throw new FootballError(
      "provider_unavailable",
      "The football provider is temporarily unavailable.",
    );
  }

  private parseSingle<T>(data: unknown, schema: z.ZodType<T>): T {
    const candidate = Array.isArray(data) ? data[0] : data;
    if (candidate === undefined) throw invalidPayload();
    try {
      return schema.parse(candidate);
    } catch (error) {
      throw invalidPayload(error);
    }
  }

  private parseArray<T>(data: unknown, schema: z.ZodType<T>): T[] {
    if (!Array.isArray(data)) throw invalidPayload();
    try {
      return data.map((item) => schema.parse(item));
    } catch (error) {
      throw invalidPayload(error);
    }
  }

  private normalizeFixture(raw: z.infer<typeof fixtureSchema>): ProviderFixture {
    if (raw.league_id !== this.leagueId || raw.season_id !== this.seasonId) throw invalidPayload();
    const home = exactlyOneParticipant(raw.participants, "home");
    const away = exactlyOneParticipant(raw.participants, "away");
    const state = mapFixtureState(raw.state);
    const scores = currentScore(raw.scores);
    return providerFixtureSchema.parse({
      externalId: String(raw.id),
      competitionExternalId: String(raw.league_id),
      seasonExternalId: String(raw.season_id),
      roundExternalId: raw.round_id == null ? null : String(raw.round_id),
      homeTeamExternalId: String(home.id),
      awayTeamExternalId: String(away.id),
      venueExternalId: raw.venue_id == null ? null : String(raw.venue_id),
      kickoffAt: parseTimestamp(raw.starting_at),
      status: state.status,
      period: state.period,
      minute: null,
      addedTime: null,
      homeScore: scores.home,
      awayScore: scores.away,
      freshness: this.freshness(raw, isProvisionalStatus(state.status)),
    });
  }

  private freshness(raw: Record<string, unknown>, provisional: boolean): ProviderFreshness {
    const sourceTime = [raw.last_processed_at, raw.updated_at, raw.last_played_at].find(
      (value): value is string => typeof value === "string" && value.length > 0,
    );
    const updatedAt = sourceTime ? parseTimestamp(sourceTime) : this.now().toISOString();
    return {
      updatedAt,
      sourceSequence: Math.max(0, Date.parse(updatedAt)),
      sourceVersion: `sportsmonks:${String(raw.id ?? "unknown")}:${Date.parse(updatedAt)}`,
      provisional,
    };
  }

  private isConfiguredSeasonCurrent(): boolean {
    const today = this.now().toISOString().slice(0, 10);
    return this.seasonStartsOn <= today && today <= this.seasonEndsOn;
  }

  private assertCircuitClosed(): void {
    if (this.openedAtMs === null) return;
    if (this.now().getTime() - this.openedAtMs >= this.circuitResetMs) {
      this.consecutiveFailures = 0;
      this.openedAtMs = null;
      return;
    }
    throw new FootballError(
      "provider_unavailable",
      "The football provider is temporarily unavailable.",
    );
  }

  private recordSuccess(): void {
    this.consecutiveFailures = 0;
    this.openedAtMs = null;
  }

  private recordFailure(): void {
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= this.circuitFailureThreshold)
      this.openedAtMs = this.now().getTime();
  }
}

function validateConfig(config: SportsmonksProviderConfig): void {
  const token = config.token.trim();
  if (!token || token.length > 512 || hasControlOrWhitespace(token)) throw configurationError();
  for (const id of [config.leagueId, config.seasonId]) {
    if (!Number.isSafeInteger(id) || id <= 0) throw configurationError();
  }
  if (!/^[A-Za-z]{2}$/.test(config.countryCode)) throw configurationError();
  if (
    !["league", "cup", "super_cup", "international", "friendly"].includes(config.competitionType)
  ) {
    throw configurationError();
  }
  for (const date of [
    config.seasonStartsOn,
    config.seasonEndsOn,
    config.fixtureFrom,
    config.fixtureTo,
  ])
    parseDate(date);
  if (config.seasonStartsOn > config.seasonEndsOn || config.fixtureFrom > config.fixtureTo)
    throw configurationError();
  validateIntegerOption(config.timeoutMs, 250, 60_000);
  validateIntegerOption(config.maxRetries, 0, 8);
  validateIntegerOption(config.retryBaseMs, 10, 60_000);
  validateIntegerOption(config.circuitFailureThreshold, 1, 100);
  validateIntegerOption(config.circuitResetMs, 1_000, 3_600_000);
  if (!config.fetch && typeof globalThis.fetch !== "function") throw configurationError();
}

function validateIntegerOption(value: number | undefined, minimum: number, maximum: number): void {
  if (value !== undefined && (!Number.isInteger(value) || value < minimum || value > maximum))
    throw configurationError();
}

function hasControlOrWhitespace(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0x20 || codePoint === 0x7f) return true;
  }
  return false;
}

function configurationError(): FootballError {
  return new FootballError(
    "provider_unavailable",
    "The SportsMonks server configuration is incomplete or invalid.",
  );
}

function invalidPayload(cause?: unknown): FootballError {
  return new FootballError(
    "invalid_provider_payload",
    "The football provider returned invalid data.",
    cause,
  );
}

function unsupported(capability: string): Promise<never> {
  return Promise.reject(
    new FootballError(
      "data_unavailable",
      `SportsMonks ${capability} ingestion is not activated until Gate 2B.`,
    ),
  );
}

function pageSize(limit: number): number {
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw invalidPayload();
  return Math.min(limit, MAX_PAGE_SIZE);
}

function encodeRemoteCursor(resource: string, page: number): string {
  return `sm:v1:${resource}:${page}`;
}

function decodeRemoteCursor(resource: string, cursor?: string | null): number {
  if (!cursor) return 1;
  const match = /^sm:v1:([a-z_]+):(\d+)$/.exec(cursor);
  if (!match || match[1] !== resource) throw invalidPayload();
  const page = Number(match[2]);
  if (!Number.isSafeInteger(page) || page < 1) throw invalidPayload();
  return page;
}

function decodeLocalCursor(resource: string, cursor?: string | null): number {
  if (!cursor) return 0;
  const match = /^sm:v1:([a-z_]+):(\d+)$/.exec(cursor);
  if (!match || match[1] !== resource) throw invalidPayload();
  const offset = Number(match[2]);
  if (!Number.isSafeInteger(offset) || offset < 0) throw invalidPayload();
  return offset;
}

function localPage<T>(
  resource: string,
  all: readonly T[],
  offset: number,
  limit: number,
  rateLimit: ProviderRateLimit,
): ProviderPage<T> {
  const size = pageSize(limit);
  if (offset > all.length) throw invalidPayload();
  const items = all.slice(offset, offset + size);
  const nextOffset = offset + items.length;
  return {
    items,
    nextCursor: nextOffset < all.length ? encodeRemoteCursor(resource, nextOffset) : null,
    rateLimit,
  };
}

function hasMore(envelope: ParsedEnvelope, count: number, size: number): boolean {
  const root = asRecord(envelope.pagination);
  const meta = asRecord(asRecord(envelope.meta)?.pagination);
  const pagination = root ?? meta;
  if (pagination) {
    if (typeof pagination.has_more === "boolean") return pagination.has_more;
    if (pagination.next_page !== null && pagination.next_page !== undefined) return true;
  }
  return count === size;
}

function parseRateLimit(headers: Headers, body: unknown, now: Date): ProviderRateLimit {
  const rate = asRecord(body);
  const limit = integerHeader(headers.get("x-ratelimit-limit")) ?? integerValue(rate?.limit);
  const remaining =
    integerHeader(headers.get("x-ratelimit-remaining")) ?? integerValue(rate?.remaining);
  const retryAfterMs = retryAfter(headers, now);
  const resetHeader = headers.get("x-ratelimit-reset");
  const resetSeconds = integerHeader(resetHeader) ?? integerValue(rate?.resets_in_seconds);
  const resetsAt =
    resetSeconds === null
      ? null
      : new Date(
          resetSeconds > now.getTime() / 1_000
            ? resetSeconds * 1_000
            : now.getTime() + resetSeconds * 1_000,
        ).toISOString();
  return { limit, remaining, resetsAt, retryAfterMs };
}

function retryAfter(headers: Headers, now: Date): number | null {
  const value = headers.get("retry-after");
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1_000);
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : Math.max(0, timestamp - now.getTime());
}

function integerHeader(value: string | null): number | null {
  if (value === null || value.trim() === "") return null;
  return integerValue(Number(value));
}

function integerValue(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw invalidPayload();
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value)
    throw invalidPayload();
  return value;
}

function parseTimestamp(value: string): string {
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? `${value.replace(" ", "T")}Z`
    : value;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) throw invalidPayload();
  return parsed.toISOString();
}

function normalizedTeamCode(value: string | null | undefined): string | null {
  if (!value) return null;
  const code = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /^[A-Z0-9]{2,8}$/.test(code) ? code : null;
}

function strictRoundNumber(name: string): number | null {
  const match = /^(?:ROUND\s+)?(\d{1,3})$/i.exec(name);
  return match ? Number(match[1]) : null;
}

function exactlyOneParticipant(
  participants: readonly z.infer<typeof participantSchema>[],
  location: "home" | "away",
): z.infer<typeof participantSchema> {
  const matches = participants.filter(
    (participant) => participant.meta?.location?.toLowerCase() === location,
  );
  if (matches.length !== 1) throw invalidPayload();
  return matches[0];
}

function currentScore(scores: readonly z.infer<typeof scoreSchema>[]): {
  home: number | null;
  away: number | null;
} {
  const current = scores.filter((score) => score.description?.toUpperCase() === "CURRENT");
  if (current.length === 0) return { home: null, away: null };
  const home =
    current.find((score) => score.score.participant.toLowerCase() === "home")?.score.goals ?? null;
  const away =
    current.find((score) => score.score.participant.toLowerCase() === "away")?.score.goals ?? null;
  if ((home === null) !== (away === null)) throw invalidPayload();
  return { home, away };
}

function mapFixtureState(raw: z.infer<typeof fixtureSchema>["state"]): FixtureState {
  const source = raw.developer_name ?? raw.state ?? raw.name;
  if (!source) throw invalidPayload();
  const state = source
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  if (state === "AWAITING_UPDATES" || state === "PENDING") {
    throw new FootballError(
      "provider_unavailable",
      "The football provider is awaiting a verified fixture update.",
    );
  }
  const mappings: Readonly<Record<string, FixtureState>> = {
    NS: { status: "not_started", period: "pre_match" },
    TBA: { status: "scheduled", period: "pre_match" },
    TBD: { status: "scheduled", period: "pre_match" },
    INPLAY_1ST_HALF: { status: "live_first_half", period: "first_half" },
    FIRST_HALF: { status: "live_first_half", period: "first_half" },
    HT: { status: "half_time", period: "half_time" },
    HALF_TIME: { status: "half_time", period: "half_time" },
    BREAK: { status: "extra_time", period: "extra_time" },
    INPLAY_2ND_HALF: { status: "live_second_half", period: "second_half" },
    SECOND_HALF: { status: "live_second_half", period: "second_half" },
    INPLAY_ET: { status: "extra_time", period: "extra_time" },
    EXTRA_TIME: { status: "extra_time", period: "extra_time" },
    EXTRA_TIME_BREAK: { status: "extra_time", period: "extra_time" },
    INPLAY_PENALTIES: { status: "penalties", period: "penalties" },
    PEN_LIVE: { status: "penalties", period: "penalties" },
    PEN_BREAK: { status: "penalties", period: "penalties" },
    FT: { status: "finished", period: "post_match" },
    AET: { status: "finished", period: "post_match" },
    FTP: { status: "finished", period: "post_match" },
    FT_PEN: { status: "finished", period: "post_match" },
    WO: { status: "finished", period: "post_match" },
    AWARDED: { status: "finished", period: "post_match" },
    POSTP: { status: "postponed", period: "pre_match" },
    POSTPONED: { status: "postponed", period: "pre_match" },
    CANCL: { status: "cancelled", period: "pre_match" },
    CANCELLED: { status: "cancelled", period: "pre_match" },
    DELETED: { status: "cancelled", period: "pre_match" },
    SUSP: { status: "suspended", period: "pre_match" },
    SUSPENDED: { status: "suspended", period: "pre_match" },
    DELAYED: { status: "delayed", period: "pre_match" },
    ABAN: { status: "abandoned", period: "post_match" },
    ABANDONED: { status: "abandoned", period: "post_match" },
    INTERRUPTED: { status: "suspended", period: "pre_match" },
  };
  const mapped = mappings[state];
  if (!mapped) throw invalidPayload();
  return mapped;
}

function isProvisionalStatus(status: ProviderFixture["status"]): boolean {
  return !["finished", "cancelled", "abandoned"].includes(status);
}
