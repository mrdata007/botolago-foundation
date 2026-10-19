import { expect, test } from "bun:test";
import { loseOneScoringReply } from "./staging-response-loss-drill";

test("the first real scoring reply stays unconfirmed until client abort; later RPCs remain usable", async () => {
  const controller = new AbortController();
  let realCalls = 0;
  let consumed = 0;
  const transport = loseOneScoringReply(
    async () => {
      realCalls++;
      return new Response('{"ok":true}');
    },
    () => {
      consumed++;
    },
  );
  let settled = false;
  const first = transport(
    "https://stage.invalid/rest/v1/rpc/service_persist_fantasy_scoring_results",
    { signal: controller.signal },
  );
  void first.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(consumed).toBe(1);
  expect(settled).toBe(false);
  controller.abort();
  await expect(first).rejects.toThrow("Injected response loss");
  expect(
    (await transport("https://stage.invalid/rest/v1/rpc/service_fantasy_worker_lease_extend"))
      .status,
  ).toBe(200);
  expect(
    (await transport("https://stage.invalid/rest/v1/rpc/service_persist_fantasy_scoring_results"))
      .status,
  ).toBe(200);
  expect(realCalls).toBe(3);
});

test("a database failure is never turned into an injected ambiguous commit", async () => {
  let consumed = false;
  const transport = loseOneScoringReply(
    async () => new Response("{}", { status: 400 }),
    () => {
      consumed = true;
    },
  );
  expect(
    (await transport("https://stage.invalid/rest/v1/rpc/service_persist_fantasy_scoring_results"))
      .status,
  ).toBe(400);
  expect(consumed).toBe(false);
});
