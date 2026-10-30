# Make animated explainer Reels with Claude

*Beginner guide · Level zero · No editing app · by @aygramm.ai*

This is the exact workflow behind my "7 GitHub repos" Reel. You describe the video, Claude writes it as code, and a free tool turns that code into an MP4. No camera, no timeline, no After Effects.

**Idea → Script → Prompt → Preview → MP4**

## Inside

1. What you need
2. Open Claude Code
3. Let Claude set up the tools
4. Get your script
5. The copy-paste prompt
6. Voice
7. Music & sound
8. Preview, fix, render
9. Beginner mistakes
10. Cheat sheet

---

## 01 · What you need

*Time: ~1 hour*

### Required

- A computer: Mac or Windows
- The Claude app with a paid plan (Pro or Max). Claude Code lives in its **Code** tab
- That's it. Claude installs the video tools for you (Node.js, FFmpeg, HyperFrames)

### Optional

- ElevenLabs for a realistic voice (or use the free built-in voice)
- Pixabay / Openverse for free music and sound effects
- A photo of you, if you want a cartoon mascot

### How it works (in plain words)

Claude Code is Claude working inside a folder on your computer. It can create files and run commands for you. HyperFrames is a free, open-source tool that renders a web page into a video, frame by frame. Claude designs every scene as a web page, HyperFrames films it.

> You never write code yourself. You talk to Claude in normal sentences and approve what it does.

---

## 02 · Step 1/7 — Open Claude Code in the Claude app

Claude Code is already inside the Claude app. Nothing to install.

1. Make an empty folder on your desktop called `my-first-reel`.
2. Open the Claude app and click the **Code** tab at the top of the sidebar.
3. In the row under the message box, pick **Local**, then click the folder button, choose **Open folder…** and select `my-first-reel`.
4. Type your first message. That's it, you're in.

**See "Upgrade"?** The Code tab needs a paid plan (Pro or Max). It isn't on the free plan.

**Beginner setting:** Set the permission mode to **Manual**. Claude asks before every change, so nothing happens without your OK.

---

## 03 · Step 2/7 — Let Claude install the rest

You never type a command. In the Code tab, paste this message and approve each step Claude asks about:

```text
Set up my computer to make animated videos with HyperFrames:
1. Check if I have Node.js 22 or newer and FFmpeg. Install whatever is missing.
2. Add the HyperFrames skills (github.com/heygen-com/hyperframes) so you can make videos.
3. Set up this folder as a HyperFrames project.
Explain each step in simple words before you run it, and tell me if I need to start a new session.
```

### What happens

- Claude checks what's already on your computer
- It shows each command and waits for your yes
- It fixes its own errors along the way

### One thing to know

When the skills are added, start a new session in the Code tab with the same folder, so Claude loads them.

---

## 04 · Step 3/7 — Get your script

Every scene and sound follows the voice. Write it with this shape, or ask Claude to write it for you (below).

### The formula

1. **Number hook:** "These 7 GitHub repos make Claude 10x better."
2. **Twist:** "Number 7 made this video."
3. **Items:** a name, then one short line each.
4. **Call to action:** "Comment KEYWORD and I'll send you…"

**Length:** ~130 words ≈ 45–55 seconds. One idea per sentence.

### Or let Claude write it — paste this

```text
Write me a 45-second Instagram Reel script about [your topic]. Open with a hook that has a number, give one short line per point, and end with: Comment [KEYWORD] and I'll send you [your freebie]. About 130 words. Give me 3 hook options to pick from.
```

> Read it out loud before you use it. Write acronyms as normal words (HTML, not H T M L).

---

## 05 · Step 4/7 — Paste this into Claude

Fill in the [brackets]. Everything else can stay as it is.

```text
You are the best motion designer and sound designer. Use the HyperFrames skills.

Make a [45]-second vertical Instagram Reel (1080x1920, 30fps) in this folder.

SCRIPT (voiceover, word for word):
[paste your script, or write: "use the script you just wrote for me"]

LOOK: warm paper background with a faint dot texture. Headline at the top = the spoken sentence; each word appears only when it is said, with a smooth fade-up. One keyword per sentence in [red] italic serif. Below it: one animated card per sentence (app windows, checklists, phone mockups, counters) that shows what the voice says. Keep text inside the middle 80% of the frame.
[Optional: a cartoon mascot of me in the bottom-right corner, based on my photo at photo.jpg, that changes pose on every sentence and lip-syncs.]

SOUND: voiceover on top, small sound effects on every pop/tick/whoosh, music very low underneath.

PROCESS: show me the plan and a few preview frames first. Run hyperframes check. Do NOT render the MP4 until I say "render".
```

---

## 06 · Step 5/7 — Give it a voice

### Option A · Free, built in

HyperFrames has a free voice that runs on your computer. Tell Claude:

> "Use the free built-in HyperFrames voice. Let me hear 2 or 3 voices first so I can pick."

### Option B · More realistic: ElevenLabs

Make an ElevenLabs account, create an API key, and tell Claude to use it (keep the key in your computer's settings, never paste it into a post). Ask for the voice by name.

### The trick that saved my video

Tell Claude:

> "Generate the voice one sentence at a time, then join the clips. Only shorten pauses that are real silence."

When I cut pauses out of one long take, it chopped the ends off words.

---

## 07 · Step 6/7 — Music & sound effects

| Source | What it's good for |
|---|---|
| **Pixabay** | Free music and sound effects. Best for upbeat tracks, pops, whooshes and UI clicks. |
| **Openverse** | Free real-world recordings. Pick CC0 (no credit needed) and avoid "NonCommercial". |

### Avoid copyright claims

On Pixabay, skip tracks marked **"Content ID registered"**. Instagram or YouTube can flag them even though they're free.

### Get the mix right

- Voice loudest, sound effects next, music lowest
- Ask Claude to duck the music under the voice (HyperFrames calls it a "voiceover carve")
- Every sound should match something you see. No random whooshes

Ask Claude:

> "Find 3 music options on Pixabay that aren't Content ID registered and let me pick."

---

## 08 · Step 7/7 — Preview, fix, render

You don't need to run anything here either. Just tell Claude:

```text
# to watch it
Open the preview so I can watch the video in my browser.

# when you're happy
Render the final MP4 and make me a cover from the best frame.
```

Fix things by talking normally. These are real messages I sent while making mine:

- "Let the music be lower, below the voiceover and sound effects."
- "Reduce the stamp sound effect, it's too loud."
- "I don't want words that haven't been said to show yet. Make the entry smooth."
- "The numbering isn't clear and some words are missing."

Your MP4 lands in the `renders` folder of your project.

---

## 09 · Beginner mistakes — Mistakes I already made for you

*Save this.*

- ✕ **Music too loud.** Keep it far under the voice and duck it while you talk.
- ✕ **Words showing before they're said.** It spoils the line. Reveal each word on the voice.
- ✕ **Cutting one long voice take.** It clips words. Do one sentence per clip.
- ✕ **Text near the edges.** Instagram's buttons cover the sides. Keep words in the middle.
- ✕ **Rendering too early.** Check preview frames first. A render is slow, a fix is fast.
- ✕ **Copying someone's style 1:1, mascot included.** Borrow the layout, make your own character.

### Pro tip

Ask Claude to "save what we learned" at the end. Next video, it already knows your voice, colours and mix.

---

## 10 · Cheat sheet

*Keep this.*

**Claude app → Code tab → Local → Open folder… → my-reel**

### Then just ask Claude

- "Install everything I need to make videos with HyperFrames."
- "Write me a Reel script about [topic] with a number hook."
- "Make a new video project and open the preview."
- "Show me preview frames before you render."
- "Each word appears only when it's spoken."
- "Music below the voice and sound effects."
- "Make me a cover from the best frame."

---

*Made one with this guide? Tag @aygramm.ai. I want to see it.*
