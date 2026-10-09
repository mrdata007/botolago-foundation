# Isolated stories verification

Run from the repository root with Bun, Node, Docker and Chromium installed.
Use a **local Docker daemon**, never a shared database. The container has no
network and the scripts refuse to overwrite an existing test container.

## SQL authorization and publication

```sh
bash scripts/qa/home-stories/run-db.sh
```

This loads the real admin authorization foundation, real editorial audit
helper and new stories migration into disposable PostgreSQL. It checks
anonymous/no-session/AAL1 denial, editor/publisher separation, draft visibility,
invalid media/destinations, stale writes, publish/unpublish and auditing.
The Auth and media table shapes are minimal local fixtures; this does not
replace a deployed Supabase smoke check.

## Actual component/upload journey

Start with no other browser test writing to this container:

```sh
bash scripts/qa/home-stories/run-db.sh --keep
docker exec -i botolago-stories-test psql -U postgres -v ON_ERROR_STOP=1 < scripts/qa/home-stories/browser-seed.sql
bun scripts/qa/home-stories/local-server.ts
```

In another terminal:

```sh
VITE_SUPABASE_URL=http://127.0.0.1:4319 VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_local_stories_fixture node_modules/.bin/vite --config scripts/qa/home-stories/vite.config.ts
```

Then:

```sh
mkdir -p /tmp/botolago-stories
node scripts/qa/home-stories/browser.mjs
```

The browser script uses `/usr/bin/chromium`. It uploads real repository images
through the existing `handleNewsMediaUploadRequest`, persists drafts, reloads,
publishes two stories, navigates the viewer, checks Escape/focus restoration,
checks FR/AR at 390/1440px in light/dark themes, and unpublishes both. Screenshots
are saved under `/tmp/botolago-stories`.

This is a component harness, not a production admin session. It supplies a
synthetic local session and local filesystem storage. Story RPCs and staff
context are real SQL; media registration is an adapter for the minimal local
media table. No shared Supabase project is contacted. Run soon after seeding
because the real publisher recent-auth check expires after 15 minutes.
Stop both local servers, then remove only this fixture:

```sh
docker rm -f botolago-stories-test
```
