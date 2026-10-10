# Automatic news image stories — 9 October 2026

Owner correction: tighten the spacing; stories must open AI-generated news images
with headlines, never section shortcuts. Generate and publish automatically from
the latest news. Owner supplied the Supabase secret `OpenAI_Image_Gen` for this.

## Preserve

BotolaGO identity, existing Home modules and game rules, French/Arabic and RTL,
light/dark themes, accessible viewer navigation and focus restoration, editorial
permissions and manual upload/unpublish controls. Keep secrets server-side.

## Improve

- Remove section-link fallback and destination controls. Empty feeds render no rail.
- Compact, consistent rail spacing with fixed circles and two-line headline labels.
- Portrait news illustrations with an accessible localized headline over the image.
- A scheduled worker selects the latest published bilingual news, creates one
  illustration, stores it and publishes a story automatically. Preserve exact
  source headlines rather than asking the image model to invent text or news.
- Durable claims, duplicate prevention, bounded attempts, source visibility checks,
  a server-side pause switch, and visible AI attribution. Default daily cap: six
  generation attempts; one image per run; at most two attempts per source story.

## Acceptance

- Before/after mobile and desktop screenshots in French/Arabic, plus dark mode.
- Circles open only the image viewer; no section links in the rail/viewer; headlines
  remain readable and spacing separates the rail from the matchday content.
- Verify scheduler authentication, pause/cap, duplicate/overlap protection, provider
  errors, byte validation, storage failures, source withdrawal and atomic publication.
- Typecheck, lint, relevant unit/browser tests and authoritative database CI.
- Follow the reviewed migration/production single-writer path for release; preserve
  the owner's authorization to deploy and automatically publish news stories.
