# Stories repair evidence

Before captures are from the fresh live audit, not an earlier release session.
After captures exercise actual components in an isolated preview with local media.
The media is a landscape fixture; the full-production check will use the regenerated
1024×1536 portraits. Do not interpret the fixture as the final generated artwork.

12 combinations passed: FR/AR × 320×568, 390×844, 1440×900 × light/dark.
Measured `object-fit: contain`, zero body overflow at normal text size, caption fully
inside the visible body, readable labels, no provider credit. Buttons, directional
arrows/swipes, Escape and focus return passed. Empty feed, slow/broken media and
preserved manual photo credits also passed. No page errors.

Worker suite: 17 passed; UI-kit contract: 188 passed. TypeScript and changed-source
ESLint passed. Isolated PostgreSQL exercised the real forward migration, original
publication scenario and replacement scenario, including paused/drained requirements,
budget refusal, visible old image until replacement, retained history and editorial
unpublish during generation. Full-schema CI and final live checks are release gates.
