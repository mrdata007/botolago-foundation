# Header logo returns home

Preserve the header layout, responsive full/GO marks, BotolaGO+ member mark,
theme colours, auth photo band and existing controls. Keep decorative logos
as artwork elsewhere; the landing and admin headers already link home.

The product TopBar and AuthShell currently draw their logos without a link.
Wrap each header's logo in one router link to `/`, with a localized accessible
home label, visible keyboard focus and a 44 px minimum tap area. The member
mark and small-screen icon must share the same destination.

Acceptance: logo clicks from a product page and sign-in go home, in French
and Arabic at phone/desktop sizes. Verify the GO fallback at 320 px, no nested
links, keyboard activation and header control bounds. Capture before/after
screenshots and run existing header tests, typechecking and scoped checks.
Add this follow-up to the home refinement draft PR; do not merge or deploy.
