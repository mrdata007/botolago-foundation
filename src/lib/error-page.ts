/**
 * The static page served when the app itself failed to render (server.ts,
 * start.ts). It cannot load the app's stylesheet or its theme script, so it
 * follows the phone's setting on its own, like `mobile/www/offline.html`: the
 * `color-scheme` meta gives the browser's own controls and scrollbars the
 * right theme, and the dark block swaps the palette (BG-0149). Dark values:
 * text 16.12:1 and muted 8.65:1 on the page, the button edge 3.21:1.
 *
 * Light is exactly the page it was before BG-0149, value for value: the
 * primary button's text has its own `--on-ink` (#fff in light) rather than
 * borrowing `--paper`, which is #fafafa in light and would have tinted it.
 */
export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>This page didn't load</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light dark" />
    <style>
      :root { --paper: #fafafa; --ink: #111; --on-ink: #fff; --muted: #4b5563; --card: #fff; --edge: #d1d5db; }
      @media (prefers-color-scheme: dark) {
        :root { --paper: #0d1526; --ink: #eef1f8; --on-ink: #0d1526; --muted: #aab3c5; --card: #17213a; --edge: #5b6780; }
      }
      body { font: 15px/1.5 system-ui, -apple-system, sans-serif; background: var(--paper); color: var(--ink); display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 1.5rem; }
      .card { max-width: 28rem; width: 100%; text-align: center; padding: 2rem; }
      h1 { font-size: 1.25rem; margin: 0 0 0.5rem; }
      p { color: var(--muted); margin: 0 0 1.5rem; }
      .actions { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; }
      a, button { padding: 0.5rem 1rem; border-radius: 0.375rem; font: inherit; cursor: pointer; text-decoration: none; border: 1px solid transparent; }
      .primary { background: var(--ink); color: var(--on-ink); }
      .secondary { background: var(--card); color: var(--ink); border-color: var(--edge); }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>This page didn't load</h1>
      <p>Something went wrong on our end. You can try refreshing or head back home.</p>
      <div class="actions">
        <button class="primary" onclick="location.reload()">Try again</button>
        <a class="secondary" href="/">Go home</a>
      </div>
    </div>
  </body>
</html>`;
}
