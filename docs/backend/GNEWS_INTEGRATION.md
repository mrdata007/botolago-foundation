# GNews production integration

GNews is the transport provider for French and Arabic Botola news discovery.
The server authenticates with `X-Api-Key`; the API key is never placed in a URL,
browser bundle, database row, log, response, or evidence artifact.

BotolaGO stores article metadata, a sanitized description excerpt, and an
outbound link to the original publisher. It does not copy GNews `content` or
remote images. Original publishers are attributed and begin in
`review_required`; blocked sources cannot be ingested.

Each run is bounded to ten results per language, retries only transient errors,
and records sanitized counters and row-level rejections. Canonical URLs and
content fingerprints deduplicate retries and syndicated results. The public
News RPCs expose only published, public editions.

Production requires a GNews plan that permits commercial production use and a
server-side `GNEWS_API_KEY` secret. Activation uses a temporary trigger secret
that is removed after the canary.
