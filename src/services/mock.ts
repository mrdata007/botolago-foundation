// Typed mock service layer. A future Codex-built backend replaces the
// implementation of these functions without touching UI components.

import type {
  Article,
  ArticleCategory,
  Club,
  FantasyAlert,
  FantasySummary,
  Gameweek,
  Match,
  Player,
  PrivateLeague,
  TableRow,
} from "@/types/domain";
import * as db from "@/mocks/data";

const delay = <T>(v: T, ms = 120) => new Promise<T>((r) => setTimeout(() => r(v), ms));

export const botolaService = {
  async getClubs(): Promise<Club[]> {
    return delay(db.clubs);
  },
  async getClub(id: string): Promise<Club | undefined> {
    return delay(db.clubs.find((c) => c.id === id));
  },
  async getArticles(opts?: { category?: ArticleCategory; clubId?: string }): Promise<Article[]> {
    let list = db.articles;
    if (opts?.category && opts.category !== "for_you") {
      list = list.filter((a) => a.category === opts.category);
    }
    if (opts?.clubId) list = list.filter((a) => a.clubIds.includes(opts.clubId!));
    return delay(list);
  },
  async getLeadArticle(): Promise<Article | undefined> {
    return delay(db.articles.find((a) => a.isLead));
  },
  async getMatches(status?: "live" | "upcoming" | "results"): Promise<Match[]> {
    const all = db.matches;
    if (status === "live") return delay(all.filter((m) => m.status === "live"));
    if (status === "upcoming") return delay(all.filter((m) => m.status === "scheduled"));
    if (status === "results") return delay(all.filter((m) => m.status === "finished"));
    return delay(all);
  },
  async getLiveOrUpcoming(): Promise<Match[]> {
    return delay(db.matches.filter((m) => m.status === "live" || m.status === "scheduled").slice(0, 3));
  },
  async getTable(): Promise<TableRow[]> {
    return delay(db.tableRows);
  },
  async getCurrentGameweek(): Promise<Gameweek> {
    return delay(db.gameweek);
  },
  async getFantasySummary(): Promise<FantasySummary> {
    return delay(db.fantasySummary);
  },
  async getFantasyAlerts(): Promise<FantasyAlert[]> {
    return delay(db.fantasyAlerts);
  },
  async getTrendingPlayers(): Promise<Player[]> {
    return delay(db.trendingPlayers.map((id) => db.players.find((p) => p.id === id)!).filter(Boolean));
  },
  async getPlayer(id: string): Promise<Player | undefined> {
    return delay(db.players.find((p) => p.id === id));
  },
  async getFollowedClubs(): Promise<Club[]> {
    return delay(db.followedClubs.map((id) => db.clubs.find((c) => c.id === id)!).filter(Boolean));
  },
  async getPrivateLeagues(): Promise<PrivateLeague[]> {
    return delay(db.privateLeagues);
  },
};

export type BotolaService = typeof botolaService;
