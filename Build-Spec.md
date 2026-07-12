# Angel & Demons — Implementation Spec (copy this whole file into the build session)

Hermes Buildathon, Virality track. Target: quick working version in ~2 hours.
This file is self-contained — no other context needed. It supersedes
Hermes-Handoff.md.

## STATUS — Track A done, Track B can start now

Track A backend is **built, deployed, and verified end-to-end**. Track B has
no backend blockers.

- **Live backend base URL:** `https://energized-ladybug-532.convex.site`
  (production Convex deployment — one URL all day, redeployed in place).
- All 5 API endpoints below are live, CORS-enabled, and tested: arguments are
  funny/in-character, the Demon cites real Linkup sources, TTS returns valid
  MP3, and custom-character creation works.
- **Background art is ready:** `site-reference.png` in the project root —
  already cleaned (text removed). Use it directly in Higgsfield; **skip the
  cleaning step.**
- **One thing to fetch before the first public deploy:** a PostHog project key
  + host (see the PostHog subsection under Track B). Build with a placeholder,
  swap the real `phc_...` key in before deploying / posting.

## How this file is used

- **Track A (backend + glue): Claude Fable session.** Paste this file, say
  "build Track A". Owns: Convex schema, argument engine, ElevenLabs TTS,
  Linkup, HTTP API, seed characters, curl tests.
- **Track B (front-end): Hermes `/goal` with GPT-5.6 sol + Higgsfield.**
  Higgsfield generates the animated site shell; Hermes wires it to the API.
  Hand Hermes ONLY the "Track B" section below plus the API contract.
- **The API contract section is frozen.** Neither track changes a route or
  JSON shape without updating the other. This is what lets the tracks run in
  parallel.
- Build style: laziest solution that works. No speculative abstractions, no
  extra files, no config for values that never change. If a step can be
  hardcoded today, hardcode it.

## The product (context for both tracks)

A single-page web app where an **Angel** and a **Demon** — thumb-sized
clippy-style sprites floating on the page — argue any dilemma the visitor
types. Angel argues from **behavior** (what you've actually done), Demon
argues from **desire** (what you want), and the Demon cites one real
web-sourced stat via Linkup. A verdict strip picks a side. Both characters
speak with ElevenLabs premade voices. Visitors give an email to **save their
verdict history or create a custom character** — that email gate is the
scored signup metric (25x weight). A separate waitlist captures emails for
the "desktop pets" future version.

Scoring context (Virality track): Visitors 10x, Signups/meaningful actions
25x, Reactions 2x, Amplification 3x, Impressions 1x. Anti-spoof: >10%
impressions→visitors CTR or >50% visitor→signup conversion ZEROES that
parameter — no friend-farming, organic only. Analytics (PostHog) must be live
before the first social post or nothing counts.

Partner power-ups (+25 each, +100 planned — Wispr Flow not counted on):
- **ElevenLabs** — both characters audibly speak in the live demo
- **Convex** — real backend with real rows; show repo + dashboard
- **Linkup** — live search in the argument engine; show code + one live query
- **Cloudflare** — site hosted there; show live URL + dashboard
- (**Wispr Flow bonus check** — no partner credits, but the free tier allows
  some dictation: if 500+ words get dictated during the event, screenshot the
  stats page and claim the extra +25. Voice input for the demo works either
  way: Wispr hotkey on the demo laptop, or the site's built-in mic button.)

Hermes eligibility (mandatory, score is zero without it): Hermes is the
front-end coding partner (keep the `/goal` session history open all day as
evidence) and GPT-5.6 generates every argument in production (base-harness
claim).

Hard scope exclusions — do NOT build: payments of any kind (no partner
available; say "$1.99 character packs" as roadmap only), voice upload/cloning,
likeness upload, desktop/Electron app (it's the waitlist promise; a
transparent Electron window that merely loads the live URL is an optional
end-of-day teaser), user accounts/auth (email string is enough), moderation
systems, websockets/streaming.

---

## Architecture (final)

```
[Higgsfield animated site, static]  ──fetch──▶  [Convex HTTP actions]
   deployed: Cloudflare Pages                      https://<deployment>.convex.site
   (one URL all day, redeploy in place)               │
                                          ┌───────────┼───────────────┐
                                     [Convex DB]  [GPT-5.6 sol]  [ElevenLabs TTS]
                                                      │
                                                  [Linkup search]
```

- Front-end is **static** (whatever Higgsfield outputs) + plain `fetch()`
  calls. No Convex client library in the front-end, no codegen coupling —
  the backend exposes plain HTTP endpoints so the two tracks never block
  each other.
- All API keys live in Convex environment variables, never in the browser.
- Audio is returned as base64 MP3 in JSON and played via `new Audio()`.
  Short clips only, this is fine.

## Env vars (set in Convex dashboard → Settings → Environment Variables)

| Var | Value |
|---|---|
| `LLM_API_URL` | OpenAI-compatible chat-completions endpoint for GPT-5.6 sol (from Hermes credits) |
| `LLM_API_KEY` | its key |
| `LLM_MODEL` | the GPT-5.6 sol model id string |
| `ELEVENLABS_API_KEY` | from ElevenLabs dashboard |
| `VOICE_ANGEL` | a premade voice id — pick a calm/warm one |
| `VOICE_DEMON` | a premade voice id — pick a low/gravelly one |
| `LINKUP_API_KEY` | from Linkup dashboard |

First backend task: `GET https://api.elevenlabs.io/v1/voices` (header
`xi-api-key`) to list premade voices; pick two contrasting ones + ~6 for the
character-creator dropdown, hardcode the list.

---

## API CONTRACT (frozen — both tracks build against this)

Base URL (LIVE): `https://energized-ladybug-532.convex.site` — Track A's
production deployment, already deployed and verified. Keep it in one const.
All endpoints: JSON in/out, CORS `Access-Control-Allow-Origin: *`, OPTIONS
preflight handled. All 5 endpoints below are live.

### POST /api/argue
Req: `{ "dilemma": string, "angelId"?: string, "demonId"?: string, "email"?: string }`
(character ids optional — omitted = default Angel/Demon personas)
Res: `{ "dilemmaId": string, "angel": { "name": string, "text": string },
        "demon": { "name": string, "text": string, "source"?: string },
        "verdict": string }`
Behavior: Linkup search on the dilemma (~4s timeout, on failure proceed with
no evidence) → one GPT-5.6 call with both persona MDs + evidence → parse JSON
→ save row to `dilemmas` → return. Text only — audio is fetched separately so
text renders immediately.
Errors: LLM failure → 503 `{ "error": "The court is in recess. Try again." }`

### POST /api/tts
Req: `{ "text": string, "who": "angel" | "demon", "voiceId"?: string }`
(voiceId overrides for custom characters)
Res: `{ "audio": string }`  — base64 MP3
Errors: TTS failure → 502; front-end falls back to text-only silently.

### POST /api/signup
Req: `{ "email": string, "source": "waitlist" | "gate" }`
Res: `{ "ok": true }`  (duplicate email: still `{ok:true}`, no new row)

### POST /api/character
Req: `{ "name": string, "description"?: string, "voiceId": string, "email": string }`
Res: `{ "characterId": string, "name": string, "blurb": string }`
Behavior: requires email (auto-inserts a `gate` signup) → Linkup search
`"<name> personality traits catchphrases speech style"` (skip if description
given and name looks original) → GPT-5.6 writes a persona MD (same section
format as the defaults) → save to `characters`.

### GET /api/characters
Res: `{ "characters": [ { "id": string, "name": string, "blurb": string,
        "voiceId": string, "role": "angel" | "demon" } ] }`
Returns 3 hardcoded presets + all user-created ones.

---

## TRACK A — backend (Claude Fable builds this)

### Setup
Convex is ALREADY initialized in this project directory — do not re-create
it. Just run `npx convex dev` and note the deployment's `.convex.site` URL.
Wrangler + Cloudflare are already installed and logged in.

### Files (keep it to these)
```
convex/schema.ts       three tables
convex/personas.ts     ANGEL_MD, DEMON_MD, PRESETS, VOICES as exported consts
convex/engine.ts       actions: argue, tts, createCharacter (all external calls live here)
convex/db.ts           mutations/queries: saveDilemma, addSignup, saveCharacter, listCharacters
convex/http.ts         httpRouter mapping the 5 routes + CORS/OPTIONS
```

### Schema (Convex gives `_creationTime` free — no createdAt fields)
```ts
signups:    { email: string, source: "waitlist" | "gate" }   index by_email
dilemmas:   { text, angelCase, demonCase, verdict, angelName, demonName, email? }
characters: { name, personaMd, blurb, voiceId, role, byEmail }
```

### External calls (all from Convex actions, keys via process.env)
- **LLM**: `POST ${LLM_API_URL}` OpenAI-compat body
  `{ model, messages, temperature: 0.9 }`. Ask for JSON in the prompt AND
  strip ```json fences before `JSON.parse` — defensive parse, one retry on
  parse failure.
- **Linkup**: `POST https://api.linkup.so/v1/search`, header
  `Authorization: Bearer`, body `{ q, depth: "standard", outputType:
  "searchResults" }`. Take top 3 snippet texts + source names. If the exact
  shape differs, check their docs once — do not build an abstraction.
- **ElevenLabs**: `POST https://api.elevenlabs.io/v1/text-to-speech/{voiceId}`,
  header `xi-api-key`, body `{ text, model_id: "eleven_turbo_v2_5" }` →
  audio/mpeg bytes → base64.

### The argument prompt (system message; tune wording at Gate 1, keep shape)
```
You stage a comic courtroom: two characters argue a human's dilemma.

ANGEL — argues ONLY from BEHAVIOR: habits, track record, what they actually do.
<angel persona md>

DEMON — argues ONLY from DESIRE: what they want, the upside, the bold move.
<demon persona md>

Web evidence (may be empty; if present the Demon cites ONE item, naming the source):
<linkup snippets>

Rules: each case 60–90 words, in character, funny but genuinely persuasive,
PG-13, no moralizing disclaimers. Verdict: max 25 words, picks a side, gives
one concrete next step.
Reply with JSON only: {"angel":"...","demon":"...","verdict":"..."}
```

### Default personas (put in personas.ts verbatim, tune at Gate 1)
```
ANGEL — Seraphina
# Identity
A weary guardian angel who has watched this human for years and keeps receipts.
# Argues from
Behavior. What they have ACTUALLY done — habits, history, abandoned projects, past promises.
# Speech style
Gentle, specific, devastating. Uses "remember when..." often. Audible sighs. Ends warm.
# Iconic phrases
"I say this with love and documentation." / "Your history has opinions."

DEMON — Baz
# Identity
A charming demon of ambition. Not evil — allergic to wasted potential.
# Argues from
Desire. What they WANT, the upside, the version of them that already decided.
# Speech style
Fast, flattering, sharp. Calls the user "champ" or "legend". Loves a statistic. Ends with a dare.
# Iconic phrases
"The graveyard is full of people who waited." / "Desire is data too."
```

### Preset characters (hardcode in personas.ts; only user creations hit the DB)
1. **Disappointed Mom** (role angel) — argues from behavior via guilt; "I'm not angry, I'm just going to bring this up at dinner forever."
2. **Gym Bro** (role demon) — everything is reps and PRs; "Bro, regret is just a skipped set."
3. **Victorian Ghost** (role angel) — ominous warnings from beyond; died of the exact thing you're about to do.

### Track A checkpoints — ALL GREEN (deployed to prod, verified)
Notes from the build: `gpt-5.6-sol` rejects any non-default `temperature`
(param omitted); several ElevenLabs premade voice ids were retired, so preset
and dropdown ids were refreshed against a live `GET /v1/voices`.
- **A1 (T+0:15):** `npx convex dev` up; `/api/signup` live —
  `curl -X POST <base>/api/signup -H "content-type: application/json" -d '{"email":"test@x.com","source":"waitlist"}'`
  → row visible in Convex dashboard. **Post the base URL for Track B now.**
- **A2 (T+0:45): GATE 1** — `/api/argue` with 3 real dilemmas ("quit my job
  for my startup?", "text my ex?", "instant noodles for the 4th night?").
  **Arguments must be funny-sharp and in-character. If not, tune personas +
  prompt NOW — do not move on. Boring arguments kill the whole product.**
- **A3 (T+1:00):** `/api/tts` returns audio; decode base64 → plays.
- **A4 (T+1:20):** `/api/character` — create "Gordon Ramsay", verify Linkup
  fired, persona MD saved, it argues a dilemma via `/api/argue` with its id.
- **A5:** support Track B integration; watch Convex logs for CORS/errors.

---

## TRACK B — front-end (Hermes /goal + GPT-5.6 sol; Higgsfield for the shell)

Give Hermes this section + the API contract above + the base URL from A1.

One page, one URL all day. Higgsfield generates the animated shell (dark
playful theme, Angel sprite floats left with slow CSS bob, Demon floats
right, big centered dilemma input). Hermes wires behavior with plain JS
`fetch()` — no framework requirements, whatever Higgsfield output uses.

**Background art:** the project root contains `site-reference.png` — the
design reference, **already cleaned (embedded text removed)**. Pipeline:
1. In Higgsfield, use `site-reference.png` directly as the reference image and
   animate/stylize from it. No cleaning step needed — the text is already gone.
2. The cleaned art is the full-bleed page background. All real text lives in
   HTML layered on top — never baked into the image (baked text can't change,
   can't be read by judges' phones at odd sizes, and kills the typewriter
   effect).
3. Speech bubbles are HTML/CSS overlays anchored with percentage-based
   positions over wherever the Angel and Demon sit in the artwork, so they
   track the characters at any viewport size. Bubble tails point at the
   characters; text typewriter-fills as each case arrives.

Page states:
1. **Landing/hero:** "Two voices. One verdict." + dilemma textarea +
   "Argue it" button. Below the fold: waitlist block — "Desktop pets version:
   Angel & Demon float on your screen. Get early access." Email field →
   `POST /api/signup {source:"waitlist"}`.
   **Mic button on the textarea:** Web Speech API
   (`webkitSpeechRecognition`, `interimResults: true`, fill the textarea as
   the user speaks; hide the button if the API is unavailable). ~15 lines, no
   keys, Chrome-only is acceptable. Note: on the demo laptop, Wispr Flow also
   dictates into this textarea via its own hotkey — that path needs zero code.
2. **The argument:** on submit → `POST /api/argue` → typewriter-fill Angel's
   speech bubble, then Demon's (show Demon's cited source in small text) →
   verdict strip slides in. IN PARALLEL with the text animation, call
   `POST /api/tts` for each case; play Angel audio, then Demon (sequential,
   never overlapping). TTS failure = silent fallback to text.
3. **Email gate (the scored metric):** after the first verdict, card:
   "Save your verdict history & create your own characters — drop your
   email." → `POST /api/signup {source:"gate"}` → remember in localStorage,
   include email in later `/api/argue` calls. Never blocks a first argument —
   gate the SECOND dilemma and character creation, not the first taste.
4. **Character picker:** row of chips from `GET /api/characters` — swap who
   argues (angelId/demonId). "+ Create your own" → name, optional
   description, voice dropdown (ids from Track A) → `POST /api/character`
   (requires the gate email) → new chip appears, argue with it immediately.
5. **Buttons:** "New dilemma", "Copy link", (stretch) "Argue back" — one
   rebuttal round.

Required in `<head>`: PostHog snippet (free tier) — MUST be live before the
first social post. Track events: `dilemma_argued`, `signup_waitlist`,
`signup_gate`, `character_created`.

PostHog values (get from posthog.com → sign up → pick the JS/HTML web install
snippet; the project key is public and safe to hardcode):
```
POSTHOG_PROJECT_KEY = phc_...                     (from the install screen)
POSTHOG_HOST        = https://us.i.posthog.com    (US region; EU = https://eu.i.posthog.com — copy whichever the install page shows)
```
Wire the standard PostHog web snippet in `<head>` with these two values, then
`posthog.capture('<event>')` on each of the four events above. Build with a
placeholder key now; drop the real `phc_...` in before the B1 deploy/post.

Deploy: `npx wrangler pages deploy <dist> --project-name angel-demons` —
first deploy by T+0:20 with just the hero + waitlist wired, then redeploy the
same project every improvement. Never a second site/URL.

### Track B checkpoints
- **B1 (T+0:20):** hero + waitlist live on Cloudflare URL, test email lands
  in Convex dashboard, PostHog records the visit. ▶ **POST #1 goes out.**
- **B2 (T+1:10): GATE 2** — full loop (dilemma → two bubbles + verdict) on
  the LIVE URL. Behind schedule? Cut in order: (1) Demon speaks / Angel is
  text-only, (2) presets only — no creator UI, (3) screenshots instead of any
  share feature. **Never cut the email gate.**
- **B3 (T+1:40):** both voices audible on a phone.
- **B4 (T+1:55):** gate + character creation work end-to-end. ▶ **POST #2.**

---

## Social posts (the ONE live URL in every post)

- **POST #1 (T+0:20):** "Building an Angel and a Demon that argue your
  dilemmas out loud — live at the GrowthX Hermes Buildathon. Drop a dilemma
  in the replies; first ones get argued by voice today. 👼😈 [URL]"
- **POST #2 (T+1:55):** screenshot of a real verdict + "The Demon cites its
  sources now. Argue yours: [URL]"
- **POST #3 (stretch):** 20-sec screen recording of the two voices arguing;
  link in first reply.
- Reply to every dilemma comment with that person's argued verdict
  (screenshot + link) — that's the amplification engine.
- Never solicit clicks/signups from friends — the anti-spoof caps zero the
  parameter.

## Demo script (rehearse once at T+1:55)

1. Judge states a real dilemma → they SPEAK it in: Wispr Flow hotkey on the
   demo laptop (zero-code path) or the site's mic button. Text appears live.
2. Angel and Demon argue OUT LOUD; point at the Demon's cited source.
3. Verdict lands; judge picks a side.
4. Swap in "Disappointed Mom", rerun 15 seconds of it — laugh beat.
5. Create "Gordon Ramsay" live → Linkup researches → he argues the dilemma.
6. Evidence flip: Convex dashboard (rows ticking), PostHog funnel, Cloudflare
   dashboard, Hermes /goal session history, the Linkup call in code.
7. Roadmap close: desktop pets (show waitlist count), $1.99 character packs,
   voice cloning.

## Stretch goals — strictly in this order, only if all checkpoints green
1. "Argue back" rebuttal button (one more LLM call with thread history).
2. Canvas-rendered verdict share card (PNG download) + POST #3.
3. Electron teaser: transparent always-on-top window loading the live URL.
   Ten demo seconds. Do not port anything into it.
