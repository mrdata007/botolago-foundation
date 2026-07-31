import { describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/backend/generated/database.types";
import type { ProviderCompetition } from "../provider/contracts";
import { SupabaseFootballIngestionGateway } from "./supabase-gateway.server";

interface RpcCall {
  readonly name: string;
  readonly args: Record<string, unknown>;
}

function clientWith(
  result: Readonly<{ data: unknown; error: unknown }>,
  calls: RpcCall[],
): SupabaseClient<Database> {
  const client = {
    schema(schema: string) {
      expect(schema).toBe("api");
      return {
        async rpc(name: string, args: Record<string, unknown>) {
          calls.push({ name, args });
          return result;
        },
      };
    },
  };
  return client as unknown as SupabaseClient<Database>;
}

const competition: ProviderCompetition = {
  externalId: "860",
  name: "Botola Pro",
  shortName: "BPL",
  type: "league",
  countryCode: "MA",
  freshness: {
    updatedAt: "2026-07-31T12:00:00.000Z",
    sourceSequence: 1,
    sourceVersion: "sportsmonks:860:1",
    provisional: false,
  },
};

describe("SupabaseFootballIngestionGateway catalog persistence", () => {
  test("routes a normalized competition to the trusted catalog RPC", async () => {
    const calls: RpcCall[] = [];
    const gateway = new SupabaseFootballIngestionGateway(
      clientWith({ data: { id: "catalog-id", outcome: "inserted" }, error: null }, calls),
    );

    const outcome = await gateway.upsert("competitions", competition, {
      runId: "run-id",
      provider: "sportsmonks",
      job: "competitions",
    });

    expect(outcome).toBe("inserted");
    expect(calls).toEqual([
      {
        name: "ingest_football_catalog_entity",
        args: {
          p_provider_name: "sportsmonks",
          p_entity_type: "competition",
          p_external_id: "860",
          p_entity: competition,
        },
      },
    ]);
  });

  test("accepts the database skipped outcome for idempotent delivery", async () => {
    const gateway = new SupabaseFootballIngestionGateway(
      clientWith({ data: { id: "catalog-id", outcome: "skipped" }, error: null }, []),
    );
    await expect(
      gateway.upsert("competitions", competition, {
        runId: "run-id",
        provider: "sportsmonks",
        job: "competitions",
      }),
    ).resolves.toBe("skipped");
  });

  test("keeps unsupported persistence jobs closed", async () => {
    const gateway = new SupabaseFootballIngestionGateway(
      clientWith({ data: null, error: null }, []),
    );
    await expect(
      gateway.upsert(
        "players",
        { externalId: "1" },
        {
          runId: "run-id",
          provider: "sportsmonks",
          job: "players",
        },
      ),
    ).rejects.toMatchObject({ code: "data_unavailable" });
  });
});
