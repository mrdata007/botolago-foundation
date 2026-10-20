# BotolaGO notification email design options — brief

The owner requested a design correction, then explicitly requested five branded
versions for each notification email, to choose a version independently per type.

## Preserve

Keep the eight notification types and the current French/Arabic content,
subjects, preheaders, dates, timezone labels, scores, ranks, fixture status and
favourite-club emphasis. Keep the existing CTA destinations, preference and
unsubscribe links, consent/readiness/delivery logic and all production renderers.
Use the official colour/light PNG wordmarks and existing branded stadium JPEG.
Do not recreate the logo, invent data, send email or change shared databases.

## Observed problems and improvements

Fresh rendered captures cover 22 current language/family cases at 320, 390 and
1280px. Two visual systems coexist: football uses a text approximation of the
wordmark, while manager emails use the official raster asset. Repeated large
navy panels compete with the primary action. Typography and footers vary.

Build five substantially different HTML directions for all eight types:
1. Club — compact navy branding, mint/cyan highlight and rounded action.
2. Journal — white editorial masthead, restrained borders and typographic data.
3. Stadium — existing branded stadium image and a clean white reading area.
4. Ticket — perforated match-ticket structure and a focused event/score panel.
5. Scoreboard — dark navy canvas, cyan figures and a strong light action.

Use the production content as the source for the HTML alternatives. Include
both languages for every direction, the three current automated Fantasy
moments, and real match/news/prospect layouts. Provide a comparison gallery
with language/width controls, independent selections for all eight types and
an exportable selection summary. All samples must be identified outside the
emails as fictional. No production design is selected by default.

## Acceptance and evidence

Render every option in French and Arabic at 320/390/desktop widths; measure
visible element and text boxes, image loading, CTA target/size, direction and
content/link preservation. Inspect representative screenshots from all five
directions, football and Fantasy, both languages, mobile and desktop. Check
inline-only rendering and image-blocked fallback. Keep tables/inline styles and
Outlook width constraints; no email JavaScript, web fonts or layout grids.

Open a draft PR containing the brief, reproducible local generator/gallery,
and verification report. The user chooses designs before production adaptation.
Browser previews establish layout, not Gmail/Outlook/Apple Mail delivery.
