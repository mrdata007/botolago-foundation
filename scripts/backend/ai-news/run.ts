import { readFile } from "node:fs/promises";
import { gatherElbotola } from "./elbotola-source";
import { ApiWriter } from "./writer";
import {
  runPipeline,
  type Candidate,
  type Draft,
  type ExistingStory,
  type GeneratedArticle,
  type Store,
  type Writer,
} from "./pipeline";

type Configuration = {
  draftEnabled: boolean;
  sourceProcessingApproved: boolean;
  autoPublishEnabled: boolean;
  dailyLimit: number;
};

async function rpc<T>(
  url: string,
  secret: string,
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const response = await fetch(`${url.replace(/\/$/u, "")}/rest/v1/rpc/${name}`, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
    headers: {
      apikey: secret,
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(args),
  });
  if (!response.ok) throw new Error(`cms_rpc_${name}_${response.status}`);
  return (await response.json()) as T;
}

export class CmsStore implements Store {
  constructor(
    private readonly url: string,
    private readonly secret: string,
    private readonly provider: "openai" | "anthropic",
  ) {}
  configuration(): Promise<Configuration> {
    return rpc<Configuration>(this.url, this.secret, "ai_news_configuration");
  }
  existing(): Promise<ExistingStory[]> {
    return rpc<ExistingStory[]>(this.url, this.secret, "ai_news_existing");
  }
  pendingAutoPublication(): Promise<string[]> {
    return rpc<string[]>(this.url, this.secret, "ai_news_pending_publication");
  }
  async saveDraft(draft: Draft): Promise<"created" | "existing"> {
    const { sourceText: _sourceText, ...candidate } = draft.candidate;
    const result = await rpc<{ created: boolean }>(this.url, this.secret, "ai_news_save_draft", {
      p_key: draft.key,
      p_payload: {
        candidate,
        article: draft.article,
        html: draft.html,
        quality: draft.quality,
        reasons: draft.reasons,
        sanitizerVersion: draft.sanitizerVersion,
        modelProvider: this.provider,
        modelName: draft.model,
        promptVersion: "ai-news-v1",
      },
    });
    return result.created === true ? "created" : "existing";
  }
  async publish(key: string): Promise<void> {
    await rpc<unknown>(this.url, this.secret, "ai_news_publish", { p_key: key });
  }
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`missing_${name.toLowerCase()}`);
  return value;
}

async function main(): Promise<void> {
  if (process.env.AI_NEWS_KILL_SWITCH !== "false") throw new Error("ai_news_kill_switch_active");
  const mode = process.argv[2];
  if (mode !== "--dry-run" && mode !== "--run")
    throw new Error("usage: run.ts --dry-run|--run [--fixture=path]");
  const fixturePath = process.argv.find((arg) => arg.startsWith("--fixture="))?.slice(10);
  if (fixturePath && mode !== "--dry-run") throw new Error("fixture_requires_dry_run");
  const dryRun = mode === "--dry-run";
  let candidates: Candidate[];
  let writer: Writer;
  let store: Store;
  let dailyLimit: number;
  let auto = false;
  if (fixturePath) {
    const fixture = JSON.parse(await readFile(fixturePath, "utf8")) as {
      candidates: Candidate[];
      articles: Record<string, GeneratedArticle>;
    };
    candidates = fixture.candidates;
    writer = {
      model: "synthetic-fixture",
      async generate(_language, _facts, source) {
        const candidate = candidates.find((item) => item.url === source.url);
        const article = candidate && fixture.articles[candidate.sourceId];
        if (!article) throw new Error("fixture_article_missing");
        return article;
      },
      async verify() {
        return true;
      },
    };
    store = {
      async existing() {
        return [];
      },
      async pendingAutoPublication() {
        return [];
      },
      async saveDraft() {
        throw new Error("dry_run_write_attempt");
      },
      async publish() {
        throw new Error("dry_run_publish_attempt");
      },
    };
    dailyLimit = 3;
  } else {
    if (process.env.AI_NEWS_SOURCE_RIGHTS_APPROVED !== "true")
      throw new Error("source_processing_rights_not_approved");
    const url = required(process.env, "SUPABASE_URL");
    const secret = required(process.env, "SUPABASE_SECRET_KEY");
    const provider = required(process.env, "AI_NEWS_PROVIDER");
    if (provider !== "openai" && provider !== "anthropic")
      throw new Error("invalid_ai_news_provider");
    const model = required(process.env, "AI_NEWS_MODEL");
    store = new CmsStore(url, secret, provider);
    const config = await (store as CmsStore).configuration();
    if (!config.draftEnabled || !config.sourceProcessingApproved)
      throw new Error("ai_news_database_switch_disabled");
    dailyLimit = config.dailyLimit;
    const requestedLimit = process.env.AI_NEWS_DAILY_LIMIT
      ? Number(process.env.AI_NEWS_DAILY_LIMIT)
      : dailyLimit;
    if (!Number.isInteger(requestedLimit) || requestedLimit < 0 || requestedLimit > 20)
      throw new Error("invalid_daily_limit");
    dailyLimit = Math.min(dailyLimit, requestedLimit);
    auto = process.env.AI_NEWS_AUTO_PUBLISH === "true" && config.autoPublishEnabled;
    writer = new ApiWriter(
      provider,
      model,
      required(process.env, provider === "openai" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY"),
    );
    const language = process.env.AI_NEWS_LANGUAGE ?? "ar";
    if (language !== "ar" && language !== "fr") throw new Error("invalid_ai_news_language");
    candidates = await gatherElbotola(language, new Date());
  }
  const result = await runPipeline(candidates, store, writer, {
    dailyLimit,
    maximumAgeHours: 72,
    automaticPublication: auto,
    dryRun,
    now: new Date(),
  });
  console.log(JSON.stringify(result));
}

if (import.meta.main)
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "ai_news_failed");
    process.exitCode = 1;
  });
