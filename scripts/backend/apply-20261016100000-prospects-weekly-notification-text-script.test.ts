import { describe, expect, test } from "bun:test";
import { dictionaries } from "../../src/i18n/dictionaries";
import {
  between,
  bodyOf,
  commonApplyScriptTests,
  lastDefinerBefore,
  migrationFiles,
  read,
  statementsOf,
} from "./apply-script-kit";

/**
 * The guarded script that puts 20261016100000 (the weekly list's in-app
 * notification says Prospects / المواهب instead of Pépites; audit LOC-09,
 * owner decision 2026-10-15) on production, after 20260926110100 (the weekly
 * e-mail, which created the template rows). The text is data in
 * app.notification_templates, not a function body, so the pins here are the
 * rows' text, recomputed from the repository files.
 */

const VERSION = "20261016100000";
const NAME = "prospects_weekly_notification_text";
const SCRIPT_PATH = `scripts/backend/apply-${VERSION}-prospects-weekly-notification-text.sql`;
const OLD_FILE = "20260926110100_pepites_weekly_email.sql";
const script = read(SCRIPT_PATH);
const migration = read(`supabase/migrations/${VERSION}_${NAME}.sql`);
const oldMigration = read(`supabase/migrations/${OLD_FILE}`);
const preflight = between(script, "do $preflight$", "$preflight$;");
const postflight = between(script, "do $postflight$", "$postflight$;");

const OLD = {
  fr: {
    title: "Pépites : le Top 10 de la semaine {{week}}",
    body: "Les dix meilleurs jeunes de Botola Pro cette semaine.",
  },
  ar: {
    title: "Pépites: توب 10 للأسبوع {{week}}",
    body: "أفضل عشرة لاعبين شباب في البطولة الاحترافية هذا الأسبوع.",
  },
};
const NEW = {
  fr: { title: "Prospects : le Top 10 de la semaine {{week}}", body: OLD.fr.body },
  ar: { title: "المواهب: توب 10 للأسبوع {{week}}", body: OLD.ar.body },
};

describe(`apply-${VERSION}-prospects-weekly-notification-text.sql`, () => {
  commonApplyScriptTests({
    version: VERSION,
    name: NAME,
    scriptPath: SCRIPT_PATH,
    runbook: "docs/audits/2026-10-15-audit-remediation-phase-d.md",
    guards: [
      "migration 20260926110100 (the weekly e-mail, which created the templates) is not recorded",
      "the database is missing the notification template table or functions this update needs",
      "the pepites_weekly in_app templates are not exactly the reviewed version 1",
      "functions write app.notification_templates",
      "cron jobs mention the template table",
      "does not read the active in_app template of the event''s type",
      "perform set_config('bg.templates_other_before'",
      "perform set_config('bg.fanouts_before'",
      "perform set_config('bg.cron_jobs_before'",
    ],
  });

  test("the old text in the script is what 20260926110100 inserted, and nothing later changed it", () => {
    for (const language of ["fr", "ar"] as const) {
      expect(oldMigration).toContain(`'${OLD[language].title}'`);
      expect(oldMigration).toContain(`'${OLD[language].body}'`);
      expect(preflight).toContain(OLD[language].title);
      expect(preflight).toContain(OLD[language].body);
    }
    // No migration between the first edition and this one writes a template row for this key.
    const touching = migrationFiles().filter((file) => {
      if (file.split("_")[0]! >= VERSION || file === OLD_FILE) return false;
      const text = statementsOf(read(`supabase/migrations/${file}`));
      return (
        /\bnotification_templates\b/.test(text) &&
        read(`supabase/migrations/${file}`).includes("pepites_weekly") &&
        /\b(insert\s+into|update|delete\s+from)\s+app\.notification_templates\b/i.test(text)
      );
    });
    expect(touching).toEqual([]);
  });

  test("the new text is Prospects / المواهب, only the title changes, and the script carries the same text", () => {
    for (const language of ["fr", "ar"] as const) {
      expect(migration).toContain(`'${NEW[language].title}'`);
      expect(migration).toContain(`'${NEW[language].body}'`);
      expect(postflight).toContain(NEW[language].title);
      expect(postflight).toContain(NEW[language].body);
      expect(NEW[language].body).toBe(OLD[language].body);
      // The same placeholder, so the fan-out's required variable is still satisfied.
      expect(NEW[language].title).toContain("{{week}}");
      expect(NEW[language].title.length).toBeLessThanOrEqual(120);
    }
    // The name is the one the app settled on (src/i18n/prospects-rename.test.ts).
    const fr = dictionaries.fr as Record<string, string>;
    const ar = dictionaries.ar as Record<string, string>;
    expect(NEW.fr.title.startsWith(fr["pepites.brand"]!)).toBe(true);
    expect(NEW.ar.title.startsWith(ar["pepites.brand"]!)).toBe(true);
    // The new text names the old section nowhere.
    for (const text of [NEW.fr.title, NEW.fr.body, NEW.ar.title, NEW.ar.body]) {
      expect(text).not.toMatch(/p[ée]pites?/i);
      expect(text).not.toContain("جواهر");
    }
    // The e-mail copy already says the same.
    const render = read("supabase/functions/_shared/notification-email-render.ts");
    expect(render).toContain('t(ctx, "Prospects", "المواهب")');
  });

  test("the migration retires version 1 and adds version 2, and does nothing else", () => {
    const statements = statementsOf(migration);
    // One update (retire), one insert (version 2), one guard block.
    expect([...statements.matchAll(/\bupdate\s+([a-z_.]+)/gi)].map((m) => m[1])).toEqual([
      "app.notification_templates",
    ]);
    expect([...statements.matchAll(/\binsert\s+into\s+([a-z_.]+)/gi)].map((m) => m[1])).toEqual([
      "app.notification_templates",
    ]);
    expect(migration).toContain(
      "update app.notification_templates set\n  active = false,\n  retired_at = statement_timestamp()\n" +
        "where template_key = 'pepites_weekly' and channel = 'in_app' and version = 1 and active;",
    );
    expect(statements).not.toMatch(
      /\bdelete\b|\bdrop\b|\bcreate\b|\balter\b|\bgrant\b|\brevoke\b|\bcron\.|\btruncate\b/i,
    );
    // Both new rows are version 2 and active, with the old key, type, category, limits.
    expect(migration).toMatch(
      /'pepites_weekly', 'pepites_weekly', 'football', 'in_app', 'fr', 2,[^;]*array\['week'\], 120, 300, true, statement_timestamp\(\)\)/,
    );
    expect(migration).toMatch(
      /'pepites_weekly', 'pepites_weekly', 'football', 'in_app', 'ar', 2,[^;]*array\['week'\], 120, 300, true, statement_timestamp\(\)\)/,
    );
    // Its own guard names the reviewed version-1 text, so it cannot run on anything else.
    for (const language of ["fr", "ar"] as const) {
      expect(migration).toContain(OLD[language].title);
      expect(migration).toContain(OLD[language].body);
    }
    expect(migration).toContain(
      "raise exception 'pepites_weekly in_app templates are not the reviewed version 1",
    );
  });

  test("version 1 is kept, not deleted: stored notifications point at it", () => {
    const catalog = read("supabase/migrations/20260720121725_notification_catalog.sql");
    expect(catalog).toMatch(
      /template_id uuid not null references app\.notification_templates\(id\) on delete restrict/,
    );
    expect(statementsOf(script.replace(migration, ""))).not.toMatch(
      /\bdelete\s+from\s+app\.notification_templates\b/i,
    );
    expect(postflight).toContain("version 1 is not retired with its text untouched");
  });

  test("the latest fan-out reads the active template of the event's type, as the preflight requires", () => {
    // The last definition before this migration is what production runs once the Morocco-time
    // scripts are applied; the earlier one (20260926110100) reads templates the same way.
    expect(
      lastDefinerBefore(VERSION, /\bfunction\s+app_private\.notification_email_fanout\s*\(/i),
    ).toBe("20261016090100");
    const fanout = bodyOf(
      read("supabase/migrations/20261016090100_morocco_time_deadline_text.sql"),
      /create or replace function app_private\.notification_email_fanout\(/,
    );
    for (const needle of [
      "template.template_key = target.event_type::text",
      "template.channel = 'in_app'",
      "template.language = audience.language",
      "and template.active",
      "'pepites_weekly'",
    ]) {
      expect(fanout).toContain(needle);
    }
    for (const needle of [
      "template\\.template_key = target\\.event_type::text",
      "template\\.channel = ''in_app''",
      "template\\.language = audience\\.language",
      "and template\\.active",
      "'''pepites_weekly'''",
    ]) {
      expect(preflight).toContain(needle);
    }
    // The first edition of the e-mail fan-out wrote the title and body straight from the template.
    expect(fanout).toContain(
      "app_private.render_notification_template(rendered.title_template, rendered.required_variables, rendered.variables)",
    );
  });

  test("nothing but migrations writes the template table, so nothing needs pausing", () => {
    const writers = migrationFiles().filter((file) => {
      const text = statementsOf(read(`supabase/migrations/${file}`));
      // A write inside a function body would be inside $$ ... $$; look for one anywhere that is
      // not a top-level statement of a data migration by checking the dollar-quoted bodies.
      const bodies = [...text.matchAll(/\$\$([\s\S]*?)\$\$/g)].map((match) => match[1]!);
      return bodies.some((body) =>
        /\b(insert\s+into|update|delete\s+from)\s+app\.notification_templates\b/i.test(body),
      );
    });
    expect(writers).toEqual([]);
    for (const file of migrationFiles()) {
      const text = read(`supabase/migrations/${file}`).replace(/--[^\n]*/g, "");
      for (const schedule of text.matchAll(/cron\.schedule\s*\([^;]*?\)\s*;/gis)) {
        expect({ file, mentionsTemplates: /notification_templates/i.test(schedule[0]) }).toEqual({
          file,
          mentionsTemplates: false,
        });
      }
    }
    const header = script.slice(0, script.indexOf("\nbegin;\n"));
    expect(header).toContain("Nothing needs pausing.");
    expect(header).toContain("notification-email-tick");
    expect(header).toContain("Notifications already in readers' bells are NOT rewritten");
    expect(preflight).toContain(
      "(insert\\s+into|update|delete\\s+from)\\s+app\\.notification_templates\\y",
    );
    expect(preflight).toContain("from cron.job j where j.command ~* 'notification_templates'");
  });

  test("never calls a fan-out: that would write notifications", () => {
    expect(statementsOf(script.replace(migration, ""))).not.toMatch(
      /\bnotification_(email|push)_(fanout|tick|plan)\s*\(/,
    );
  });
});
