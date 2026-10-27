# ✦ Aurebesh Translator ✦

A web app that translates English to **Aurebesh** — the writing system of the Star Wars galaxy — and reads Aurebesh back from photos.

## Features

- **Translate** — English → Aurebesh letter names (`Hello` → `Herf-Esk-Leth-Leth-Osk`), with digraphs (CH, SH, TH, …)
- **Decode** — Aurebesh letter names → English
- **Image** — Render text as Aurebesh glyphs (PNG, downloadable). Glyphs are cut from `chart.jpg`, so they match the standard alphabet
- **Image Scanner** — Upload a photo (Galaxy's Edge signage, screenshots, props) and get the English text back
- **AI Droid** — Ask HK-47 about Star Wars lore and Aurebesh
- **Via Call** — HK-47 phones you (Twilio Voice) and reads the result aloud: a translation, the droid's answer, or what a scanned sign says

## Quick Start

If `node_modules/` and `.env` are already in place:

```bash
cd Twilio_Aurebesh_public
npm start
```

Then open http://localhost:3000.

### Stopping and restarting

| To… | Do this |
|---|---|
| Stop the server | **Ctrl+C** in its terminal (not Ctrl+Z, which only freezes it) |
| Stop every copy, from any terminal | `npm run stop` |
| Restart | `npm start` again |

Each start cleans up first: it stops any copies of this app that are still running or frozen with Ctrl+Z, then clears old generated images. You can just run `npm start` again without hunting for the old one. Stopping (Ctrl+C, `npm run stop`, or closing the terminal window) stops the server's timers, removes its generated images, and frees the port.

Only processes started from this project folder are affected; other Node apps are left alone.

## Setup

Requires Node.js 20+ (tested on 20.12).

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:
```
OPENAI_API_KEY=sk-...        # Needed for the AI droid and image scanner
MODEL=gpt-5-mini             # Optional: model for the AI droid (default gpt-4o-mini)
VISION_MODEL=gpt-6.1-sol     # Optional: model for the image scanner (default gpt-6.1-sol)
PORT=3000                    # Optional

TWILIO_ACCOUNT_SID=AC...     # Needed for Via Call
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1...    # A voice-capable Twilio number HK-47 calls from
HK47_VOICE=Polly.Matthew     # Optional: Twilio <Say> voice for HK-47
CALL_MAX_PER_HOUR=10         # Optional: total calls allowed per hour, across all numbers
```

Without an OpenAI key, translate, decode and image generation still work. Without Twilio credentials, everything except Via Call works.

### 3. Set Up Twilio (optional, for Via Call)

Skip this if you don't need Via Call. These steps link to Twilio's own docs:

1. **Create an account.** Sign up at [twilio.com/try-twilio](https://www.twilio.com/try-twilio).
2. **Copy your credentials.** In the [Twilio Console](https://www.twilio.com/console), copy the **Account SID** and **Auth Token** into `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` in `.env`.
3. **Get a voice-enabled number.** See [Twilio's phone number docs](https://www.twilio.com/docs/phone-numbers), or buy one on the [Console search page](https://console.twilio.com/US1/develop/phone-numbers/manage/search). Put it in `TWILIO_PHONE_NUMBER` in international format, e.g. `+14155550123`.

Trial accounts have limits, mainly that they can only call [verified numbers](https://console.twilio.com/us1/develop/phone-numbers/manage/verified). To call any number, [upgrade the account](https://www.twilio.com/docs/usage/tutorials/how-to-use-your-free-trial-account). To check your Twilio setup outside this app first, follow [Twilio's server-side quickstart](https://www.twilio.com/docs/voice/quickstart/server).

Optional: the [Twilio Dev Phone](https://www.twilio.com/docs/labs/dev-phone) runs in your browser from the Twilio CLI (`twilio dev-phone`) so you can send and receive calls without a personal phone. It needs a paid account and a spare number, and it overwrites that number's webhooks. Use it for testing only. It has not been tested with Via Call.

### 4. Allow Call Numbers (optional, for Via Call)

HK-47 can only call numbers listed in `known_contacts.json`. The file is gitignored, so a fresh clone won't have it. If it's missing, create it containing `[]`.

Add numbers in international format, either:

- **From the page:** type the number into any call panel and press **＋ ADD NUMBER**.
- **By hand:** edit the file as a JSON array:

  ```json
  ["+14155550123", "whatsapp:+353871234567"]
  ```

No restart is needed. Limits and troubleshooting are under [Via Call](#via-call).

### 5. Start the Server

```bash
npm start        # or: npm run dev (auto-restart on changes)
```

Open http://localhost:3000.

### 6. Share It (optional)

In a second terminal:

```bash
ngrok http 3000
```

Open or share the ngrok HTTPS URL. Image links are relative, so no `BASE_URL` or other config is needed.

## Using It

| Feature | Needs OpenAI key | Typical time |
|---|---|---|
| Translate / Decode | No | Instant |
| Image | No | Instant |
| Image Scanner | Yes | ~10–15s per photo |
| AI Droid (HK-47) | Yes | ~20s per answer |

Generated images are saved to `images/` and deleted automatically after an hour.

### Via Call

Each of the three sections has a **📞 VIA CALL** button next to its main button. Click it, enter your number in international format, then use the panel's button:

| Section | Button | What HK-47 reads |
|---|---|---|
| Translator | **CALL ME** | The translation — letter by letter for Aurebesh, plain English when decoding |
| AI Droid | **ASK & CALL ME** | Your question, then its answer (calls once the answer is ready, ~20s) |
| Image Scanner | **SCAN & CALL ME** | What the sign says (calls once the scan finishes, ~10–15s) |

The result also appears on screen as usual, and the call status (ringing, in progress, completed) updates live under the button. Your number is remembered in the browser and shared by all three panels.

Long droid answers are cut at a sentence to fit one call, and HK-47 tells you the rest is on screen.

**Irish numbers:** use `+353` and drop the leading 0 — e.g. `087 123 4567` becomes `+353871234567`. Calling Ireland from a US Twilio number also needs Ireland enabled in Voice Geographic Permissions (see below).

**Only numbers listed in `known_contacts.json` can be called.** There are two ways to add one:

- **From the page:** type the number into any call panel and press **＋ ADD NUMBER** (next to the call button). It's saved in international format, and numbers already on the list aren't added twice. The list holds up to 200 numbers.
- **By hand:** edit the JSON array (WhatsApp-style entries work too):

  ```json
  ["+14155550123", "whatsapp:+353871234567"]
  ```

The file is re-read on every call, so no restart is needed either way. It's in `.gitignore`, so each copy of the app keeps its own list.

Anyone who can open the page, including through your ngrok URL, can add a number with the button. The list is therefore not a strong barrier once the URL is shared; the call limits are what cap your Twilio spend.

Translations read on a call are capped at 120 characters. Limits: one call per number every 30 seconds, and `CALL_MAX_PER_HOUR` (default 10) calls an hour in total. If a number isn't allowed, the droid and scanner refuse straight away rather than running the AI first.

No webhook or ngrok is needed for calls — the script is sent to Twilio with the call. Things to check if a call fails (the error from Twilio is shown in the UI):

- **Trial accounts** can only call [verified numbers](https://console.twilio.com/us1/develop/phone-numbers/manage/verified), and play a short trial message before HK-47 speaks.
- **International numbers** need that country enabled in [Voice Geographic Permissions](https://console.twilio.com/us1/develop/voice/settings/geo-permissions).
- `TWILIO_PHONE_NUMBER` must be a voice-capable number on the same account.

## API

All endpoints take and return JSON.

| Endpoint | Body | Returns |
|---|---|---|
| `POST /api/translate` | `{ text, mode? }` — `mode: "decode"` to go Aurebesh → English | `{ result, imageUrl }` |
| `POST /api/image` | `{ text }` (max 100 chars) | `{ imageUrl }` |
| `POST /api/read-image` | `{ imageBase64 }` or `{ imageUrl }` | `{ result }` |
| `POST /api/ask` | `{ question, callPhone? }` | `{ answer, call?, callError? }` |
| `POST /api/call` | `{ text, phone, mode? }` | `{ result, call }` |
| `GET /api/call/:sid` | — | `{ status, duration }` |
| `POST /api/contacts` | `{ phone }` | `{ phone, added }` — `added: false` if it was already listed |

`call` is `{ callSid, status, truncated }`. `/api/read-image` also accepts `callPhone` and returns `call` / `callError` the same way as `/api/ask`. A `callError` with no answer or result means the number was refused before any AI work ran.

Example:

```bash
curl -X POST localhost:3000/api/translate \
  -H 'Content-Type: application/json' \
  -d '{"text":"May the Force be with you"}'
# → "Mern-Aurek-Yirt / Thesh-Esk / Forn-Osk-Resh-Cresh-Esk / Besh-Esk / Wesk-Isk-Thesh / Yirt-Osk-Usk"
```

## Image Scanner Accuracy

Reading Aurebesh from photos depends heavily on the vision model. Tested on `example.png` (a Galaxy's Edge warning sign):

| Model | Result |
|---|---|
| `gpt-6.1-sol` | ✅ Correct, 3/3 runs, ~11s |
| `gpt-6-sol` | Heading and 2 of 3 lines correct, ~40s |
| `gpt-5.5` | Heading correct, body invented, ~85s |
| `gpt-4o`, `gpt-5.4`, `o3` | Mostly wrong / unreadable |

The scanner also sends `chart.jpg` (the reference alphabet) with every request.

## Testing

```bash
npm test
```

Covers translation, decoding and image generation (no API key needed).

## Project Layout

```
index.js            Express server and API routes
aurebesh.js         English ↔ Aurebesh name mapping
imageGenerator.js   Renders Aurebesh PNGs using glyphs cut from chart.jpg
hk47Call.js         Builds the TwiML scripts HK-47 reads on calls
stop.js             Stops old copies of the server and cleans up (npm run stop)
known_contacts.json Numbers HK-47 is allowed to call (editable from the page)
chart.jpg           Reference alphabet (used by the renderer and the scanner)
public/index.html   Web UI
example.png         Sample sign for testing the scanner
GUIDE.md            Detailed code walkthrough
```

## Tech Stack

- **Node.js** + Express
- **OpenAI** — vision model for the scanner, chat model for the droid
- **Twilio Voice** — HK-47 callback calls
- **node-canvas** — server-side Aurebesh image rendering
- **dotenv** — environment configuration

## May the Force be with you! ✦
