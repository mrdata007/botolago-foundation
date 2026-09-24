import { afterEach, describe, expect, test } from "bun:test";
import { createAppQueryClient } from "./query-client";

describe("app query cache defaults", () => {
  const clients: ReturnType<typeof createAppQueryClient>[] = [];

  afterEach(() => {
    for (const client of clients.splice(0)) client.clear();
  });

  test("reuses fresh data for quick navigation but refetches after invalidation", async () => {
    const client = createAppQueryClient();
    clients.push(client);
    let calls = 0;
    const query = { queryKey: ["football", "matches"], queryFn: async () => ++calls };

    expect(await client.fetchQuery(query)).toBe(1);
    expect(await client.fetchQuery(query)).toBe(1);
    expect(calls).toBe(1);

    await client.invalidateQueries({ queryKey: query.queryKey });
    expect(await client.fetchQuery(query)).toBe(2);
    expect(calls).toBe(2);
  });
});
