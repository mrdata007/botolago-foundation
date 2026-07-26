## Diagnosis

`https://botolago.lovable.app/` returns HTTP 500 with the app's own `renderErrorPage()` fallback (the HTML served is byte-for-byte the one in `src/lib/error-page.ts`, reached via the `src/server.ts` wrapper). Published worker logs show, for every request:

```
Error: h3 swallowed SSR error: {"status":500,"unhandled":true,"message":"HTTPError"}
GET https://botolago.lovable.app/ → 500
```

That is the masked-error path: the original throw never reached the wrapper's `console.error`, so it happens during SSR module evaluation.

### Root cause (verified by reading the code and the env file)

`src/services/auth.ts` runs mode detection at **module scope**:

```ts
export function selectAuthMode(configuredMode, hasSupabase, production) {
  const explicit = configuredMode?.toLowerCase();
  if (production && explicit !== "supabase") {
    throw new Error("Production Auth requires VITE_AUTH_MODE=supabase.");
  }
  ...
}
export const AUTH_MODE: Mode = detectMode();          // executes on import
export const authService: AuthService = createService();
```

`detectMode()` passes `import.meta.env.VITE_AUTH_MODE` and `import.meta.env.PROD`.

- The project's `.env` contains only `SUPABASE_*` / `VITE_SUPABASE_*`. **`VITE_AUTH_MODE` is not set anywhere** (only `.env.example` has `VITE_AUTH_MODE=mock`).
- In a published build `import.meta.env.PROD === true` and `VITE_AUTH_MODE` inlines to `undefined`, so the guard throws immediately.

This module is on the root import chain — `src/routes/__root.tsx` → `@/auth/AuthProvider` → `@/services/auth` (plus `AuthModeBadge`, `FantasyOwnedProvider`, `routes/index.tsx`) — so **every route** 500s, not just one. It does not reproduce in preview/dev because `import.meta.env.PROD` is `false` there, which is exactly why the audit's typecheck/tests/build all passed.

## Precise blocker

Missing production environment variable `VITE_AUTH_MODE=supabase`. It is a configuration gap, not a code defect.

## Smallest safe next action

Add `VITE_AUTH_MODE=supabase` to the project's environment (the `.env` used for the published build) and re-publish. Nothing else changes: `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are already present, so `selectAuthMode` resolves to the Supabase adapter — the exact mode the guard was written to enforce.

### Verify after re-publish
1. `curl -o /dev/null -w "%{http_code}" https://botolago.lovable.app/` → expect `200`.
2. Re-read published worker logs; the `h3 swallowed SSR error` lines should stop.
3. Spot-check `/news`, `/matches`, `/fantasy` for 200s.

### If it still 500s
The next-smallest step is to unmask the real error rather than guess: the current `error-capture.ts` `globalThis` listeners are not catching this class of throw. A temporary local production build (`bun run build` + running the built worker) reproduces the same PROD-inlined env and surfaces the stack directly.

## Explicitly not doing
No code edits, no Supabase changes, no UI changes, no commits — this plan only identifies the env var to set and the verification steps.
