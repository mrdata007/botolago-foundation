// Builds the lab's self-contained pages: inlines every stylesheet, script, font and referenced
// review image. No network. Run from the repository root:
//   node design-lab/manager-cards-claude/build.mjs [outDir=design-lab/manager-cards-claude/dist]
// → manager-cards-claude.html          the gallery (index.html), one standalone page
// → manager-card-exploration-b.html    the same page as a fragment, for publishing
// → onboarding.html                    the onboarding screens (onboarding-page.html) with a toolbar:
//                                      direction, language, theme, motion and a screen filter
// → onboarding-artifact.html           the same page as a fragment, for publishing
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(process.argv[2] || join(here, "dist"));
const read = (p) => readFileSync(join(here, p), "utf8");
const mime = {
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};
const dataUri = (abs) =>
  `data:${mime[extname(abs)]};base64,${readFileSync(abs).toString("base64")}`;

/** One source page → one standalone page: <!--build:css--> and <!--build:js--> blocks inlined. */
function inlinePage(file) {
  let html = read(file);

  // Stylesheets: inline, with url(...) assets resolved relative to each sheet.
  html = html.replace(/<!--build:css-->([\s\S]*?)<!--\/build:css-->/, (_, block) => {
    const hrefs = [...block.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    const css = hrefs
      .filter((h) => existsSync(join(here, h)))
      .map((h) =>
        read(h).replace(/url\(([^)]+)\)/g, (m, u) => {
          const clean = u.replace(/["']/g, "");
          if (clean.startsWith("data:") || clean.startsWith("#")) return m;
          return `url(${dataUri(resolve(join(here, dirname(h)), clean))})`;
        }),
      )
      .join("\n");
    return `<style>\n${css}\n</style>`;
  });

  // Scripts: inline in order; review images referenced as "review/..." become data URIs.
  html = html.replace(/<!--build:js-->([\s\S]*?)<!--\/build:js-->/, (_, block) => {
    const srcs = [...block.matchAll(/src="([^"]+)"/g)].map((m) => m[1]);
    const js = srcs
      .filter((s) => existsSync(join(here, s)))
      .map((s) =>
        read(s)
          .replace(/"(review\/[^"]+\.(?:png|jpg|webp))"/g, (m, p) =>
            existsSync(join(here, p)) ? JSON.stringify(dataUri(join(here, p))) : m,
          )
          .replace(/<\/script/gi, "<\\/script"),
      )
      .join("\n;\n");
    return `<script>\n${js}\n</script>`;
  });
  return html;
}

/** The artifact page: the host wraps the page in its own doctype/html/head/body, so the fragment
    keeps the title, description, styles, body content and scripts only. */
function fragmentOf(html) {
  const title = html.match(/<title>[\s\S]*?<\/title>/)[0];
  const desc = (html.match(/<meta\s+name="description"[^>]*>/) || [""])[0].replace(/\s+/g, " ");
  // the styles are in the head; a script may mention "<style>" in a comment or a string
  const head = html.slice(0, html.search(/<body[\s>]/));
  const styles = [...head.matchAll(/<style>[\s\S]*?<\/style>/g)].map((m) => m[0]).join("\n");
  const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/)[1];
  return `${title}\n${desc}\n${styles}\n${body}`;
}

mkdirSync(outDir, { recursive: true });
const mb = (s) => (Buffer.byteLength(s) / 1024 / 1024).toFixed(2);
const write = (name, text) => {
  const out = join(outDir, name);
  writeFileSync(out, text);
  console.log(`wrote ${out} (${mb(text)} MB)`);
};

const gallery = inlinePage("index.html");
write("manager-cards-claude.html", gallery);
write("manager-card-exploration-b.html", fragmentOf(gallery));

const onboarding = inlinePage("onboarding-page.html");
write("onboarding.html", onboarding);
write("onboarding-artifact.html", fragmentOf(onboarding));
