#!/usr/bin/env bash
# Every capture of WP4's INDEX.md, in order. Run it through the host wrapper, with the dev server of
# the package's port running (see INDEX.md):
#   docs/product/manager-card-section/wp4/capture/with-host.sh docs/product/manager-card-section/wp4/capture/capture-all.sh
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"
C=docs/product/manager-card-section/wp4/capture/capture.mjs
export OUT_DIR="${OUT_DIR:-docs/product/manager-card-section/wp4}"
run() { node "$C" "$@" | cut -c1-260; }

# G1 heroes, French light and Arabic dark for every one; the other two pairings for the main ones.
HEROES="born0 born0Serial rated launchArrival returning tierUp legend founder seasonClosed"
for f in $HEROES; do
  run hero --fixture=$f --lang=fr --theme=light
  run hero --fixture=$f --lang=ar --theme=dark
done
for f in rated founder tierUp born0Serial; do
  run hero --fixture=$f --lang=fr --theme=dark
  run hero --fixture=$f --lang=ar --theme=light
done
run hero --fixture=forming1 --arrival --out=hero-forming1Arrival-fr-light-390
run hero --fixture=forming1 --arrival --lang=ar --theme=dark --out=hero-forming1Arrival-ar-dark-390
run hero --fixture=born0 --host=team --lang=fr --theme=light
run hero --fixture=born0Serial --host=team --lang=ar --theme=dark
run hero --fixture=born0Serial --host=team --lang=fr --theme=dark --out=hero-born0Serial-team-fr-dark-390
# The one-line state (a cleared label) and the new-season state, with the page around them.
run hero --fixture=cleared --plain --lang=fr --theme=light
run hero --fixture=cleared --plain --lang=ar --theme=dark
run hero --fixture=seasonStarted --plain --lang=fr --theme=light
# Desktop.
run hero --fixture=rated --lang=fr --theme=light --w=1440 --h=900
run hero --fixture=born0Serial --host=team --lang=fr --theme=light --w=1440 --h=900
# Share sheet and the picture itself (1080 x 1920).
run share --fixture=rated --share --lang=fr --theme=light
run share --fixture=rated --share --lang=ar --theme=dark
run share --fixture=founder --share --lang=fr --theme=dark
run picture --fixture=rated --share --lang=fr --theme=light --out=share-picture-rated-fr-1080
run picture --fixture=rated --share --lang=ar --theme=light --out=share-picture-rated-ar-1080
run picture --fixture=founder --share --lang=fr --theme=light --out=share-picture-founder-fr-1080
run picture --fixture=legend --share --lang=ar --theme=light --out=share-picture-legend-ar-1080
run picture --fixture=arabicName --share --lang=ar --theme=light --out=share-picture-arabicName-ar-1080
run picture --fixture=longNameLatin --share --lang=fr --theme=light --out=share-picture-longNameLatin-fr-1080
run picture --fixture=cleared --share --lang=fr --theme=light --out=share-picture-cleared-fr-1080
# Replay sheet.
run replay --fixture=returning --replay=0 --lang=fr --theme=light
run replay --fixture=returning --replay=1 --lang=ar --theme=dark
run replay --fixture=founder --replay=0 --lang=fr --theme=dark
run replay --fixture=seasonClosed --replay=0 --lang=fr --theme=light
# The first frame of each beat, with the number measured, and the beat part-way.
for f in rated founder born0Serial tierUp legend seasonClosed; do
  run frame --fixture=$f --at=0
done
for t in 120 250 400; do run frame --fixture=rated --at=$t; done
for t in 150 300 480; do run frame --fixture=founder --at=$t; done
for t in 150 350 600; do run frame --fixture=born0Serial --at=$t; done
# Reduced motion: the hero still shows, with its finished card, and nothing animates.
run probe --fixture=rated --reduced --out=probe-rated-reduced
run hero --fixture=rated --reduced --lang=fr --theme=light --out=hero-rated-reduced-fr-light-390
