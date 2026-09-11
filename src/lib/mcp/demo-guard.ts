export function demoDisabledMcpHandler(): Response {
  return new Response(JSON.stringify({ error: "not_available_in_demo" }), {
    status: 404,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
    },
  });
}
