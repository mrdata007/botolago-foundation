/* Critique, refinement and comparison content shown in the gallery.
   Scores and verdicts come from the critique phase (see CRITIQUE.md). */
window.MC.REVIEW = {
  about: `
<h3>What this is</h3>
<p>A second, independent exploration of the BotolaGO Manager Card: ten directions for a manager's permanent football identity, each with its own silhouette, material, place for the 84, stat treatment and Founder 2026 mark. The first exploration (Codex, draft PR #377) is compared in its own tab, from renders of its own branch.</p>
<p>Every card shows the same fictional manager, so the directions can be compared fairly: ALI, 84 OVR, PRO, Morocco, 2026/27, BOT #004821, FOUNDER 2026, CAP 91, SEL 82, TRF 86, CON 78, a neutral placeholder crest and one shared avatar: the manager seen from behind, hood up, at the touchline. Five other managers exist only to test leaderboards. Nothing here is real data.</p>
<h3>How it was made</h3>
<p>Research came first: the brand system, the app's ranking, profile and share surfaces, a critique of the first exploration, Moroccan football youth culture with sources, and how collectible and status systems keep people attached without pay-to-win. Five designer lenses then proposed thirty directions. Impeccable's direction roll and six catalog challengers were weighed against them, and a curator chose ten. Three adversarial critics attacked that slate (clone check; small size, right-to-left and truth; belonging, for a 16-year-old from Casablanca and a 38-year-old Fantasy veteran). Three directions were cut and replaced, and fifteen binding rules came out of it.</p>
<p>Each direction was then built in code by its own designer-engineer, checked by a fresh reviewer who had not built it, and fixed. A second pass applied the final spec and the rules, and another fresh reviewer verified it. After that, four independent critics scored all ten on thirteen criteria, a judge chose the top three, and those three were refined.</p>
<h3>The installed design tools</h3>
<p>Impeccable loaded the product and design context (PRODUCT.md, DESIGN.md), ran the direction roll (seed 1eb4cb75, which assigned Lucarne), supplied the craft floor every builder and reviewer worked to, the critique method, the mechanical detector run over the finished lab, and the finish review. The frontend-design skill set the plan-then-critique process and the bans on template defaults, and it was given to every builder.</p>
<h3>What it does not touch</h3>
<p>This lab lives in design-lab/manager-cards-claude. It has no imports into the app, no links from it, no network calls and no database. Production UI, routes, navigation, Supabase, migrations, the profile schema, Fantasy scoring, points, XP, ranking and OVR logic are all unchanged. Tier previews hold ALI's data constant; there is no progression logic.</p>
<h3>Faces and assets</h3>
<p>The product faces are Changa, Manrope and Noto Sans Arabic. The lab adds six OFL display faces: Handjet, Big Shoulders Display, Reem Kufi, Lalezar, Saira Stencil One and Alexandria. The BotolaGO logo is read unchanged from src/assets/brand. Club crests are a neutral placeholder, and there are no player photos.</p>
`,
};
