# ✦ Twilio_Aurebesh_public — How It Works

A step-by-step guide to the codebase, its features, and the thinking behind how it was built.

---

## Overview

This is a web-based Star Wars Aurebesh translator. It converts English text to Aurebesh (the in-universe writing system), generates visual glyph images, provides an AI-powered Star Wars Q&A droid (HK-47), and can scan uploaded photos to read Aurebesh from real-world objects (Galaxy's Edge merchandise, movie screenshots, departure boards, etc).

The scanner sends the photo plus a reference chart (`chart.jpg`) to a vision model (`gpt-6.1-sol` by default) and asks for a strict glyph-by-glyph transcription.

---

## Architecture at a Glance

```
index.js              → Express server, API routes, lazy loading, shutdown logic
aurebesh.js           → Pure translation logic (English ↔ Aurebesh name mapping)
aurebeshOCR.js        → Local template-matching OCR module (sharp + pixelmatch)
imageGenerator.js     → Canvas-based glyph rendering (produces PNG images)
hk47Call.js           → Twilio TwiML builders for HK-47 voice calls
stop.js               → Stops other running copies and clears generated images (npm run stop)
starwars_vocab.json   → Known vocabulary: planets, locations, board data, routes
known_contacts.json   → Call allowlist, re-read on each call (edited from the page or by hand)
public/index.html     → Full frontend (HTML + CSS + JS, single-page app)
ref_glyphs/           → Generated 32x32 reference glyph PNGs (A-Z)
```

---

## Step-by-Step Code Walkthrough

### 1. Server Bootstrap (`index.js` — top section)

```js
require('dotenv').config();
const express = require('express');
```

**Mindset:** Only the bare essentials load at startup. Environment variables are read from `.env` immediately since they're needed for config decisions.

---

### 2. Lazy Loading Pattern (Performance Optimisation)

```js
let _openai = undefined;
let _generateAurebeshImage = null;

function getOpenAI() {
  if (_openai === undefined) {
    if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your_openai_key_here') {
      const OpenAI = require('openai');
      _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    } else {
      _openai = null;
    }
  }
  return _openai;
}

function getImageGenerator() {
  if (!_generateAurebeshImage) {
    _generateAurebeshImage = require('./imageGenerator').generateAurebeshImage;
  }
  return _generateAurebeshImage;
}
```

**Why this exists:** The two heaviest dependencies are:
- `openai` — network SDK, initialises HTTP clients
- `canvas` (inside `imageGenerator.js`) — native C++ addon, takes significant time to load

By deferring their `require()` until the first request that actually needs them, the server starts in milliseconds. Users see the web interface instantly; the first translation or AI call pays a one-time ~200ms cost to load the module.

**Design principle:** *Don't make the user wait for things they haven't asked for yet.*

---

### 3. Express Setup

```js
const app = express();
app.use(express.json({ limit: '10mb' }));
app.use('/images', express.static(path.join(__dirname, 'images')));
```

- **`limit: '10mb'`** — The image scanner accepts base64-encoded photos from the browser. A typical phone photo is 2-5MB as base64. The default Express limit (100kb) would reject these silently, making the scanner appear "offline".
- **Static `/images` directory** — Generated Aurebesh PNGs are served directly as static files. Simple, no streaming complexity.

---

### 4. Star Wars Vocabulary Data (`starwars_vocab.json`)

A structured JSON file loaded at startup containing:

```json
{
  "planets": ["CORUSCANT", "NABOO", "TATOOINE", "KASHYYYK", ...],
  "cities_locations": ["BLACK SPIRE OUTPOST", "MOS EISLEY", ...],
  "common_words": ["ARRIVALS", "DEPARTURES", "ON TIME", "BOARDING", ...],
  "airlines_routes": ["STAR TOURS", "CHANDRILA STAR LINE", ...],
  "known_boards": {
    "star_tours_departure_board": {
      "column_headers": ["ROUTE", "FLIGHT", "DEPART", "ARRIVE", "DESTINATION", "STATUS", "GATE"],
      "known_route_names": [...],
      "known_destinations": [...],
      "decoded_example_rows": [...]
    }
  }
}
```

**Why this exists:** Vision models cannot reliably decode Aurebesh glyph-by-glyph. By providing known vocabulary, the AI can use word-length matching, positional context, and structural clues to identify text accurately. The `known_boards` section contains actual decoded data from real Star Tours departure boards — enabling the model to pattern-match against documented content.

---

### 5. Translation Engine (`aurebesh.js`)

```js
const AUREBESH_MAP = {
  'A': 'Aurek', 'B': 'Besh', 'C': 'Cresh', ...
  'CH': 'Cherek', 'TH': 'Thesh', 'SH': 'Shen', ...
};
```

**How translation works:**

1. Input text is uppercased
2. A cursor walks through character by character
3. At each position, it checks **digraphs first** (2-letter combos like TH, SH, CH) — greedy matching
4. If no digraph matches, it maps the single letter
5. Spaces become ` / ` separators between words
6. Output: `"Hello"` → `Herf-Esk-Leth-Leth-Osk`

**Decoding** reverses this: splits on `-` and `/`, looks up each name in a reverse map.

**Mindset:** The translation is a pure function — no side effects, no network calls. It's instantaneous. This means the translate endpoint can respond without awaiting anything.

---

### 6. Image Generator (`imageGenerator.js`)

Glyphs are cut directly out of `chart.jpg` (the same reference chart the scanner sends to the vision model) using a table of source rectangles:

```js
const GLYPH_BOXES = {
  A: [41, 180, 102, 60],  B: [280, 180, 96, 60], ...
};
```

**How it generates an image:**

1. On first use, each glyph is cropped from `chart.jpg` and converted to gold-on-transparent (brightness → alpha)
2. Text is uppercased, non-alphabetic chars stripped
3. Word-wraps into lines (max 12 chars per line)
4. Calculates canvas dimensions from each glyph's real width
5. Draws a dark Star Wars-style background with star dots
6. Draws each glyph, centred per line
7. Adds a title header and the original English text as a footer
8. Exports as PNG buffer, writes to disk

**Mindset:** Earlier versions drew glyphs as hand-written vector paths, but those shapes didn't match real Aurebesh (e.g. Aurek was drawn as a triangle). Sampling the reference chart guarantees the rendered glyphs are the standard alphabet. The frontend shows this server-rendered image rather than drawing its own.

---

### 7. Local OCR Module (`aurebeshOCR.js`)

An experimental local template-matching OCR pipeline using `sharp` and `pixelmatch`:

```
Image → Binarize (isolate bright text) → Find text rows → Segment characters → Match against reference glyphs
```

**Components:**
- **Reference glyph generation** — On first load, draws all 26 Aurebesh glyphs as 32x32 white-on-black PNGs into `ref_glyphs/`
- **Binarization** — Uses `sharp` to extract raw pixels, thresholds on brightness/red channel (optimised for red LED text on dark backgrounds)
- **Row detection** — Horizontal projection analysis to find lines of text
- **Character segmentation** — Vertical projection within each row to isolate individual glyphs
- **Template matching** — `pixelmatch` compares each extracted character against all 26 references; lowest diff wins

**Current status:** Experimental. Works best on clean, uniform digital text. Real-world photos with perspective distortion, varying fonts, or non-standard glyph styles often produce poor results. The guided recognition approach (Vision API) is currently preferred for production use.

---

### 8. API Endpoints

#### `POST /api/translate`
- Accepts `{ text, mode }` 
- If `mode === 'decode'`: converts Aurebesh names back to English
- Otherwise: translates to Aurebesh AND auto-generates a PNG image
- Returns `{ result, imageUrl }`

#### `POST /api/image`
- Accepts `{ text }`
- Only generates the visual image, returns `{ imageUrl }`
- Input capped at 100 characters (images get unreadable beyond that)

#### `POST /api/ask`
- Accepts `{ question }`
- Passes to OpenAI with a system prompt making it behave as HK-47 (assassin protocol droid from KOTOR)
- Stays in-character with behavioral labels (Statement:, Query:, Mockery:, etc.)
- Expert on Aurebesh and Star Wars lore

#### `POST /api/read-image`
- Accepts `{ imageBase64 }` or `{ imageUrl }`
- Sends the reference chart (`chart.jpg`) and the photo to `VISION_MODEL` (default `gpt-6.1-sol`) in a single call
- Prompt asks for literal glyph-by-glyph transcription, marking unclear glyphs as `[?]` rather than guessing
- Returns `{ result, method, isStructured }`

**Mindset:** Every endpoint validates input, caps lengths (protection against abuse), and returns structured JSON. Errors always include a human-readable message.

---

### 9. The Guided Recognition System (Aurebesh Scanner)

> **Update (Oct 2026):** The model matters far more than the prompt. On `example.png`, `gpt-4o` returned look-alike Latin characters ("OK7V1N7" for WARNING) and invented text, while `gpt-6.1-sol` transcribed the whole sign correctly on 3/3 runs. The current endpoint uses a single transcription prompt plus the reference chart; the history below describes earlier approaches. (`readAurebeshFromImage` in `index.js` is the old 4-pass pipeline and is no longer called.)

This is the most complex piece of the app and has been through several iterations. The key insight:

**GPT-4o Vision cannot reliably identify individual Aurebesh glyphs.** It hallucinates readings, confuses similar shapes, and guesses words from context rather than actually decoding glyph-by-glyph.

**Solution — Guided Recognition:**

Instead of asking "decode this Aurebesh", we tell the model:
1. Here are all known words that COULD appear (planets, routes, statuses)
2. Here's what type of image this is (departure board, sign, label)
3. Here's an example of what a decoded board looks like
4. Now: count characters, note positions, match against vocabulary

```js
const boardData = STARWARS_VOCAB.known_boards.star_tours_departure_board;
// Feed known destinations, routes, statuses, gate numbers, example rows...
```

**What we tried and abandoned:**
1. **Single-pass glyph descriptions** — AI described shapes but still guessed wrong letters
2. **Multi-pass (structure → read → verify)** — 4 API calls, slow, and verification just reinforced first-pass errors
3. **Local template matching (sharp + pixelmatch)** — Only works with the exact font used in our reference glyphs; real-world Aurebesh uses many different styles

**What works:** Providing maximum context upfront in a single, well-structured prompt and asking the model to pattern-match rather than decode.

---

### 10. The Frontend (`public/index.html`)

A self-contained single-page app — no build step, no framework, no npm frontend dependencies.

**Features:**
- **Mode toggle** — Switch between English→Aurebesh and Aurebesh→English
- **Live canvas renderer** — Client-side glyph drawing (mirrors the server's approach) for instant visual feedback
- **AI Droid Assistant** — Chat interface for Star Wars Q&A (HK-47 persona)
- **Image Scanner** — Drag-and-drop file upload OR paste an image URL, with structured result rendering (tables for boards, formatted blocks for signs)
- **Alphabet reference** — Full A-Z grid
- **History section** — Lore about Aurebesh origins

**Scanner result rendering:**
- Detects markdown tables in responses and renders as styled HTML tables
- Metadata (confidence, notes) styled distinctly
- Structured text blocks formatted as line-by-line output

**Design:**
- Dark Star Wars console aesthetic with gold (#ffd700) accents
- Starfield CSS background using radial gradients
- Responsive — works on mobile
- All interactions are async with loading spinners

**Mindset:** *Everything works without JavaScript frameworks. Vanilla JS, fetch API, canvas API. Zero build complexity means zero maintenance burden.*

---

### 11. Image Cleanup (Garbage Collection)

```js
setInterval(() => {
  // Delete images older than 1 hour
}, 60 * 60 * 1000);
```

Generated PNGs are ephemeral. Nobody needs a translation image from an hour ago. This prevents disk from filling up on a long-running server.

---

### 12. Graceful Shutdown

```js
let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return; // e.g. Ctrl+C pressed twice
  shuttingDown = true;

  clearInterval(imageCleanupTimer);
  cleanGeneratedFiles();

  server.close(() => process.exit(0));
  server.closeAllConnections(); // don't wait on idle browser keep-alive connections
  setTimeout(() => process.exit(0), 3000).unref(); // failsafe if close hangs
}

process.on('SIGINT', shutdown);   // Ctrl+C
process.on('SIGTERM', shutdown);  // npm run stop, kill
process.on('SIGHUP', shutdown);   // terminal window closed
```

(Console messages omitted.)

**Why:** A server left running keeps port 3000 busy and its timers alive. The shutdown handler:
1. Stops the hourly image purge timer
2. Deletes generated images
3. Closes the server, which releases the port and drops idle keep-alive connections
4. Force-exits after 3 seconds if the close hangs

`npm run stop` (`stop.js`) cleans up copies left behind, including ones frozen with Ctrl+Z. It finds Node processes started from this folder, sends SIGTERM and SIGCONT, then SIGKILL to any still running. Other Node apps are not touched. `npm start` stops older copies from this folder before it starts.

---

## Design Principles Summary

| Principle | Implementation |
|-----------|---------------|
| **Fast startup** | Lazy-load heavy deps (openai, canvas) |
| **Zero build step** | Vanilla HTML/CSS/JS frontend |
| **Defensive inputs** | All endpoints validate + cap input length |
| **Self-cleaning** | Hourly image purge, graceful port cleanup |
| **AI-enhanced, not AI-dependent** | Translation works without OpenAI key; AI features degrade gracefully |
| **Guided over raw** | Scanner provides context + vocabulary instead of asking AI to cold-decode glyphs |
| **No external assets** | Glyphs are drawn procedurally, no font files needed |
| **Known content matching** | Vocabulary database enables pattern-matching for recognition |

---

## Dependencies

```json
{
  "canvas": "^3.2.3",       // Native glyph rendering (server-side PNG generation)
  "dotenv": "^17.4.2",      // Environment variable loading
  "express": "^5.2.1",      // HTTP server
  "openai": "^6.39.0",      // Chat (AI droid) and vision (scanner) API client
  "pixelmatch": "^5.3.0",   // Pixel comparison for template matching (aurebeshOCR.js)
  "pngjs": "^7.0.0",        // PNG encoding/decoding for reference glyphs
  "sharp": "^0.35.5",       // Image processing for OCR (resize, raw pixel access)
  "twilio": "^6.2.0",       // HK-47 voice calls (TwiML and call API)
  "node-fetch": "^3.3.2"    // Not used by any file; the scanner passes image URLs straight to OpenAI
}
```

---

## Running It

```bash
cd Twilio_Aurebesh_public
npm install
npm start          # Production
npm run dev        # Watch mode (auto-restart on changes)
```

Required in `.env`:
```
OPENAI_API_KEY=sk-...    # For AI droid + image scanner
PORT=3000                # Optional, defaults to 3000
MODEL=gpt-5-mini         # Optional, AI droid model (default gpt-4o-mini)
VISION_MODEL=gpt-6.1-sol # Optional, scanner model (default gpt-6.1-sol)
TWILIO_ACCOUNT_SID=AC... # Optional, for Via Call
TWILIO_AUTH_TOKEN=...    # Optional, for Via Call
TWILIO_PHONE_NUMBER=+1... # Optional, for Via Call
```

Without an OpenAI key, translation and image generation still work — only the AI chat and image scanner are disabled.

### Set Up Twilio (for Via Call)

Via Call needs a Twilio account with a voice-enabled number. Twilio's docs cover the setup:

1. **Account:** sign up at [twilio.com/try-twilio](https://www.twilio.com/try-twilio).
2. **Credentials:** copy the Account SID and Auth Token from the [Twilio Console](https://www.twilio.com/console) into `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN`.
3. **Number:** get a voice-enabled number per [Twilio's phone number docs](https://www.twilio.com/docs/phone-numbers), or buy one on the [Console search page](https://console.twilio.com/US1/develop/phone-numbers/manage/search). Set it as `TWILIO_PHONE_NUMBER` in international format.

Trial accounts can only call [verified numbers](https://console.twilio.com/us1/develop/phone-numbers/manage/verified). To call any number, [upgrade the account](https://www.twilio.com/docs/usage/tutorials/how-to-use-your-free-trial-account). For a standalone check of your Twilio setup, see [Twilio's server-side quickstart](https://www.twilio.com/docs/voice/quickstart/server).

Optional: the [Twilio Dev Phone](https://www.twilio.com/docs/labs/dev-phone) is a browser phone started with the Twilio CLI (`twilio dev-phone`). It needs a paid account and a spare number, and it overwrites that number's webhooks, so don't use a production number. It has not been tested with Via Call.

### Allow Call Numbers (for Via Call)

HK-47 only calls numbers listed in `known_contacts.json`. The file is gitignored, so create it with `[]` if it's missing. Add numbers in international format, either by hand or from the page (**＋ ADD NUMBER**, which calls `POST /api/contacts`):

```json
["+14155550123", "whatsapp:+353871234567"]
```

The list is re-read on every call, so no restart is needed. `/api/contacts` creates the file if it doesn't exist and caps the list at 200 numbers.

---

## Known Limitations & Future Work

- **Scanner accuracy on novel content** — The guided approach works best when the text contains known vocabulary. Completely novel Aurebesh text (custom fan creations, etc.) will be less accurate since there's nothing to pattern-match against.
- **Local OCR** — The template-matching module (`aurebeshOCR.js`) needs font-specific reference glyphs to work well. Its programmatic reference glyphs are the old, inaccurate shapes and don't match real Aurebesh; regenerating `ref_glyphs/` from `chart.jpg` (as `imageGenerator.js` now does) would be the first step. Future improvement: capture actual glyph samples from photos.
- **Single image per scan** — Currently processes one image at a time. No batch support.
- **No persistent history** — Translation and scan results are ephemeral (no database).
