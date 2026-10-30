# BotolaGO explainer Reel: Claude Code prompts

Copy-paste prompts for making a BotolaGO explainer Reel with Claude Code and HyperFrames.
The full walkthrough is in [BEGINNER_GUIDE.md](BEGINNER_GUIDE.md).

## Before you start

- Make a **new empty folder** on your computer, e.g. `botolago-reel`. Do **not** run this inside the
  BotolaGO app code: that repo syncs to Lovable, and video files don't belong there.
- Put the logo in that folder: download `src/assets/brand/botolago-wordmark-light.svg` and
  `src/assets/brand/botolago-mark-light.svg` from this repo.
- Open the Claude app → **Code** tab → **Local** → **Open folder…** → `botolago-reel`.
- Permission mode: **Manual**.

## Prompt 1: setup (paste once)

```text
Set up my computer to make animated videos with HyperFrames:
1. Check if I have Node.js 22 or newer and FFmpeg. Install whatever is missing.
2. Add the HyperFrames skills (github.com/heygen-com/hyperframes) so you can make videos.
3. Set up this folder as a HyperFrames project.
Explain each step in simple words before you run it, and tell me if I need to start a new session.
```

When it's done, start a **new session** in the Code tab with the same folder.

## Prompt 2: the BotolaGO Reel (paste in the new session)

```text
You are the best motion designer and sound designer. Use the HyperFrames skills.

Make a 45-second vertical Instagram Reel (1080x1920, 30fps) in this folder that explains BotolaGO.

WHAT BOTOLAGO IS (only use these facts, invent nothing):
- BotolaGO (botolago.com) is a free web app for Moroccan football, in French and Arabic.
- Botola Pro: today's matches, live scores, results and the league table. No account needed.
- Botola news, and you can follow your club.
- BotolaGO Fantasy: build a squad, pick a captain, make transfers before each deadline, and play friends in private leagues.
- Pronostics: predict the scores.
- Prospects: follow the best young players (under 23).
- Brand name is always written "BotolaGO" (capital B, capital GO).

STEP 1 · SCRIPT (do this first, then stop and wait for me):
Write the voiceover in [French]. About 130 words, one idea per sentence.
- Open with a hook that has a number, e.g. "4 raisons d'ouvrir BotolaGO avant chaque journée."
- Then one short line per feature above.
- End with: "Créez votre équipe Fantasy gratuitement sur botolago.com."
Tone: address the viewer as "vous", short, direct and specific, no hype, no exaggerated claims. It should sound like Moroccan football coverage, not an ad.
Give me 3 hook options and the full script. Do NOT build anything until I pick a hook and say "go".

STEP 2 · LOOK (BotolaGO brand, do not invent new brand colours):
- Background: deep navy (#0C3164 to #001C49 gradient) with a faint pitch-line texture.
- Accent: one keyword per sentence in bright turf green (#60FA97). Secondary accent: sky blue (#73EDFA).
- Text: white, font "Changa" weight 800 for headlines, "Manrope" for small text (both free on Google Fonts).
- Logo: use botolago-wordmark-light.svg from this folder in the first and last scene. Logo blue #0151FC is only for the logo, never for text or cards.
- Headline at the top = the spoken sentence; each word appears only when it is said, with a smooth fade-up.
- Below it: one animated card per sentence that shows what the voice says: a phone mockup with a live score ticking, a league table sliding in, a Fantasy pitch with 11 player dots and a captain armband, a score prediction card, a young player card.
- For the phone mockups, take real screenshots of https://botolago.com at phone size (390x844) and use them. If you can't reach the site, make clean mockups and tell me.
- Keep all text inside the middle 80% of the frame (Instagram buttons cover the edges).

STEP 3 · SOUND:
- Voice: the free built-in HyperFrames voice. Let me hear 2 or 3 [French] voices first so I can pick.
- Generate the voice one sentence at a time, then join the clips. Only shorten pauses that are real silence.
- Small sound effects on every pop/tick/whoosh, plus a short crowd cheer on the hook and a referee whistle on the last line.
- Music: find 3 upbeat options on Pixabay that are NOT "Content ID registered" and let me pick. Keep it very low and duck it under the voice (voiceover carve).
- Mix: voice loudest, sound effects next, music lowest.

STEP 4 · PROCESS:
Show me the plan and a few preview frames first. Run hyperframes check. Open the preview in my browser.
Do NOT render the MP4 until I say "render". When I do, also make a cover image from the best frame.
At the end, save what we learned (brand colours, voice, mix) so the next video is faster.
```

### Arabic version

Change `[French]` to `[Modern Standard Arabic]` (no Darija), write the text right-to-left, and use the
Arabic tagline at the end: "أنت تعرف البطولة. الآن دورك." Keep "BotolaGO" in Latin letters.

## Fixing things after the preview

Just talk normally, e.g.:

- "Make the music lower, below the voice and sound effects."
- "Words are showing before they're said. Fix that."
- "Slow down the league table card."
- "Render."
