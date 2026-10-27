require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const { toAurebesh, toEnglish } = require('./aurebesh');

// Lazy-loaded modules (heavy native/network deps)
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

let _twilio = undefined;

function getTwilio() {
  if (_twilio === undefined) {
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER) {
      _twilio = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    } else {
      _twilio = null;
    }
  }
  return _twilio;
}

function getImageGenerator() {
  if (!_generateAurebeshImage) {
    _generateAurebeshImage = require('./imageGenerator').generateAurebeshImage;
  }
  return _generateAurebeshImage;
}

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use('/images', express.static(path.join(__dirname, 'images')));

// Ensure images directory exists
const imagesDir = path.join(__dirname, 'images');
if (!fs.existsSync(imagesDir)) {
  fs.mkdirSync(imagesDir);
}

// Load Star Wars vocabulary for context-aware translation
const STARWARS_VOCAB = JSON.parse(fs.readFileSync(path.join(__dirname, 'starwars_vocab.json'), 'utf8'));

// OpenAI config
const AI_MODEL = process.env.MODEL || 'gpt-4o-mini';
const VISION_MODEL = process.env.VISION_MODEL || 'gpt-6.1-sol';

/**
 * Use OpenAI Vision to read Aurebesh from an image — enhanced multi-pass system
 * for complex images like departure boards, signs with multiple lines, etc.
 */
async function readAurebeshFromImage(imageUrl) {
  const openai = getOpenAI();
  if (!openai) return { error: 'AI not configured' };
  
  try {
    console.log('   🔍 Pass 1: Identifying image structure...');
    
    // === PASS 1: Identify structure and content regions ===
    const structureResult = await openai.chat.completions.create({
      model: VISION_MODEL,
      max_completion_tokens: 2048,
      messages: [
        {
          role: 'system',
          content: `You are a Star Wars Aurebesh image analyst. Your ONLY job in this pass is to identify the STRUCTURE of any text in the image. Do NOT attempt to read or translate any Aurebesh yet.

Determine:
1. IMAGE_TYPE: one of [departure_board, arrival_board, sign, label, screen_text, datapad, poster, product, menu, mixed]
2. LAYOUT: describe the layout precisely (e.g., "table with 7 columns and 10 rows", "3 lines of text centered")
3. TEXT_REGIONS: number of distinct text areas
4. SCRIPT_TYPE: [aurebesh_only, mixed_aurebesh_numbers, mixed_aurebesh_latin, latin_only]
5. READING_DIFFICULTY: [easy, medium, hard]
6. For tables: describe what each column likely contains (numbers vs Aurebesh text vs symbols)

Respond in EXACTLY this format:
IMAGE_TYPE: <type>
LAYOUT: <description>
TEXT_REGIONS: <number>
SCRIPT_TYPE: <type>
READING_DIFFICULTY: <difficulty>
COLUMN_HEADERS: <if table, list likely column purposes based on position and content type>
ROW_COUNT: <if table, number of data rows>
VISUAL_NOTES: <describe colors, display style, any partially obscured text>`
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Analyze ONLY the structure of this image (do not read/translate yet):' },
            { type: 'image_url', image_url: { url: imageUrl, detail: 'high' } }
          ]
        }
      ]
    });
    
    const structure = structureResult.choices[0].message.content;
    console.log(`   📋 Structure: ${structure.substring(0, 200)}...`);
    
    // === PASS 2: Glyph-by-glyph reading with shape-first approach ===
    console.log('   🔍 Pass 2: Shape-first glyph reading...');
    
    const knownPlanets = STARWARS_VOCAB.planets.join(', ');
    const knownWords = STARWARS_VOCAB.common_words.join(', ');
    const knownLocations = STARWARS_VOCAB.cities_locations.join(', ');
    const knownRoutes = STARWARS_VOCAB.airlines_routes.join(', ');
    
    const detailedResult = await openai.chat.completions.create({
      model: VISION_MODEL,
      max_completion_tokens: 8192,
      messages: [
        {
          role: 'system',
          content: `You are reading Aurebesh — the Star Wars writing system. This is a SUBSTITUTION CIPHER where each unique glyph shape maps to exactly one English letter.

IMAGE STRUCTURE:
${structure}

═══════════════════════════════════════
CRITICAL METHOD — YOU MUST FOLLOW THIS:
═══════════════════════════════════════

For EACH word of Aurebesh text, you must:
1. Count the number of distinct glyphs in the word
2. For each glyph, DESCRIBE its visual shape in 3-5 words
3. THEN match the shape to the alphabet below
4. The resulting letters spell an English word

DO NOT GUESS WORDS FROM CONTEXT. Read each glyph individually by shape.

═══════════════════════════════════════
AUREBESH GLYPH VISUAL IDENTIFICATION:
═══════════════════════════════════════

A (Aurek): TRIANGLE pointing UP or RIGHT — three lines forming a closed triangular/arrow shape. Most distinctive: always a CLOSED 3-sided figure.

B (Besh): Vertical line with TWO short horizontal bars extending RIGHT from it (like a sideways ladder/fence with 2 rungs). Distinctive: 2 parallel prongs going right.

C (Cresh): Open angle bracket POINTING LEFT like ">" rotated — two lines meeting at a point on the left side. May have a horizontal line through middle. Distinctive: chevron opening rightward.

D (Dorn): DIAMOND or RHOMBUS shape — four sides rotated 45°. Distinctive: square rotated to stand on a corner point.

E (Esk): Single SHORT HORIZONTAL dash/line. Very minimal. Distinctive: smallest/simplest glyph, just a dash.

F (Forn): PITCHFORK/TRIDENT — vertical line with 2-3 prongs at TOP spreading outward. Distinctive: branching at top like a fork.

G (Grek): RIGHT ANGLE or backwards "L" — one vertical line meets one horizontal line at a corner. Distinctive: single clean corner/angle.

H (Herf): THREE HORIZONTAL parallel lines stacked vertically (like ≡ or a hamburger menu icon). Distinctive: three evenly-spaced horizontal bars.

I (Isk): Single TALL VERTICAL line, may have small serifs/bars at top and bottom. Distinctive: one vertical stroke.

J (Jenth): HOOK or FISHHOOK shape — curves down and to the left at bottom. Distinctive: curved bottom portion.

K (Krill): TWO CHEVRONS pointing right >> or two angular shapes nested. Distinctive: doubled angle/arrow.

L (Leth): Vertical line with ONE horizontal prong extending RIGHT at the MIDDLE. Distinctive: single prong at mid-height (vs Besh which has 2 prongs).

M (Mern): ZIGZAG or WAVE — like a "W" or "M" shape with multiple direction changes. Distinctive: 3+ direction changes in one continuous line.

N (Nern): Single DIAGONAL line going from lower-left to upper-right (like / forward slash). Distinctive: one straight diagonal line.

O (Osk): CIRCLE or HEXAGON — a closed rounded/polygonal shape. Distinctive: closed curved form, no tail.

P (Peth): SQUARE or RECTANGLE — four right angles forming a box. Distinctive: straight-sided closed box.

Q (Qek): CIRCLE WITH A TAIL — like lowercase "q" or a circle with a line extending from it. Distinctive: round shape plus extending stroke.

R (Resh): FLAG/PENNANT on a pole — vertical line with a triangular or rectangular flag at the TOP. Distinctive: vertical pole + shape attached at top only.

S (Senth): Vertical line with a horizontal prong extending LEFT at middle. Distinctive: prong goes LEFT (opposite of Leth which goes right).

T (Trill): CROSS shape — one horizontal + one vertical line intersecting. Like a "+" or "†". Distinctive: perpendicular intersection.

U (Usk): U-SHAPE or CUP — open at top, curved at bottom. Distinctive: open-topped curved container shape.

V (Vev): V-SHAPE or downward chevron — two lines meeting at a BOTTOM point. Distinctive: open at top, pointed at bottom.

W (Wesk): Angle bracket POINTING RIGHT like "<" — two lines meeting at a point on the RIGHT side. Distinctive: chevron opening leftward (OPPOSITE of Cresh).

X (Xesh): X-SHAPE — two lines crossing diagonally. Distinctive: diagonal cross/intersection.

Y (Yirt): Y-SHAPE — two lines diverging upward from a single stem. Distinctive: fork at top, single line below.

Z (Zerek): Z-SHAPE or ZIGZAG — horizontal top, diagonal middle, horizontal bottom. Distinctive: exactly 2 direction changes forming Z.

DIGRAPHS (single glyphs = two letters):
CH (Cherek), TH (Thesh), SH (Shen), NG (Nen), OO (Orenth), AE (Enth), EO (Onith), KH (Krenth)

═══════════════════════════════════════
READING RULES:
═══════════════════════════════════════
- Read LEFT to RIGHT, line by line, top to bottom
- Arabic numerals (0-9) are used as-is for numbers/times
- Space between glyph groups = word boundary
- The result MUST spell recognizable English words (this is a cipher, not a language)
- If a decoded word is 1-2 letters off from a known Star Wars term, it IS that term

KNOWN VOCABULARY (for validation AFTER reading):
Planets: ${knownPlanets}
Locations: ${knownLocations}
Common: ${knownWords}
Routes: ${knownRoutes}

═══════════════════════════════════════
OUTPUT FORMAT:
═══════════════════════════════════════

For EACH text region or row, output:
ROW [n]: [glyph shapes described] → [letter identifications] → "[resulting word(s)]"

Then provide the full translation in structured format:

If TABLE/BOARD:
===TABLE START===
HEADER: [translated header]
|Col1|Col2|Col3|Col4|Col5|Col6|Col7|
|---|---|---|---|---|---|---|
|data...|
===TABLE END===

If TEXT:
===TEXT START===
LINE 1: [text]
===TEXT END===

CONFIDENCE: [high/medium/low]
NOTES: [difficulties encountered]`
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Read this image glyph-by-glyph. For each Aurebesh word, describe the shape of each character BEFORE identifying it. Work through every row systematically:' },
            { type: 'image_url', image_url: { url: imageUrl, detail: 'high' } }
          ]
        }
      ]
    });
    
    const translation = detailedResult.choices[0].message.content;
    console.log(`   🔍 Pass 2 result: ${translation.substring(0, 300)}...`);
    
    // === PASS 3: ALWAYS verify with independent second reading ===
    console.log('   🔍 Pass 3: Independent verification read...');
    const verifyResult = await openai.chat.completions.create({
      model: VISION_MODEL,
      max_completion_tokens: 8192,
      messages: [
        {
          role: 'system',
          content: `You are independently verifying an Aurebesh translation. You have:
1. The original image
2. A previous reading attempt (shown below)

YOUR JOB: Re-read the image FROM SCRATCH. Compare your reading to the previous attempt. Where they DISAGREE, look extra carefully at the actual glyph shapes.

PREVIOUS READING:
${translation}

VERIFICATION RULES:
- If the previous reading decoded a word that matches a known Star Wars planet/location exactly → KEEP IT (it's almost certainly correct)
- If the previous reading decoded something that is NOT a real word → RE-READ those glyphs carefully using shape descriptions
- For any glyph you're unsure of, note the 2-3 most likely letters based on shape

COMMON MIS-READINGS TO CHECK:
- A↔V (triangle vs downward-V: A is CLOSED triangle, V is OPEN at top)
- B↔L (2 prongs right vs 1 prong right)
- C↔W (C opens right ">", W opens left "<")
- E↔I (E is horizontal dash, I is vertical line)
- N↔/ (N is diagonal slash)
- S↔L (S has LEFT prong, L has RIGHT prong)
- O↔P (O is circle/round, P is square/rectangular)
- P↔R (P is square box, R is flag on pole)
- K↔>> (double chevron)

KNOWN STAR WARS VOCABULARY:
Planets: ${knownPlanets}
Locations: ${knownLocations}
Common words: ${knownWords}
Routes: ${knownRoutes}

Produce the FINAL corrected version in the same structured format. Mark corrections with [CORRECTED: old→new].`
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Re-read this image independently and verify/correct the previous translation. Focus on any non-word results:' },
            { type: 'image_url', image_url: { url: imageUrl, detail: 'high' } }
          ]
        }
      ]
    });
    
    const verified = verifyResult.choices[0].message.content;
    console.log(`   ✅ Verification: ${verified.substring(0, 300)}...`);
    
    // === PASS 4: Final cleanup — produce clean user-facing output ===
    console.log('   🔍 Pass 4: Producing final clean output...');
    const cleanupResult = await openai.chat.completions.create({
      model: AI_MODEL,
      max_completion_tokens: 4096,
      messages: [
        {
          role: 'system',
          content: `You clean up and format Aurebesh translation results for display. You receive raw analysis output and produce a clean, readable summary.

Rules:
- Remove all working notes, glyph-by-glyph descriptions, and intermediate steps
- Keep ONLY the final translated text in structured format
- For tables: produce clean markdown tables
- For text: produce clean line-by-line translations
- Include confidence level and any important notes
- If corrections were made, note them briefly
- Format for display in a web UI`
        },
        {
          role: 'user',
          content: `Clean up this Aurebesh translation for user display:\n\nSTRUCTURE:\n${structure}\n\nVERIFIED TRANSLATION:\n${verified}`
        }
      ]
    });
    
    const finalResult = cleanupResult.choices[0].message.content;
    console.log(`   ✨ Final: ${finalResult.substring(0, 200)}...`);
    
    return { success: true, result: finalResult, structure };
  } catch (err) {
    console.error('Vision API error:', err.message);
    return { error: err.message };
  }
}

// === WEB API ENDPOINTS ===

// Translate API
app.post('/api/translate', (req, res) => {
  const { text, mode } = req.body;
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'Text is required' });
  }

  const sanitized = text.slice(0, 500);

  if (mode === 'decode') {
    const decoded = toEnglish(sanitized);
    return res.json({ result: decoded, mode: 'decode' });
  }

  const translated = toAurebesh(sanitized);
  
  let imageUrl = null;
  try {
    const filename = `aurebesh_${Date.now()}.png`;
    const outputPath = path.join(imagesDir, filename);
    getImageGenerator()(sanitized, outputPath);
    imageUrl = `/images/${filename}`;
  } catch (err) {
    console.error('Image generation error:', err);
  }

  return res.json({ result: translated, original: sanitized, mode: 'translate', imageUrl });
});

// Generate image API
app.post('/api/image', (req, res) => {
  const { text } = req.body;
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'Text is required' });
  }

  const sanitized = text.slice(0, 100);
  const filename = `aurebesh_${Date.now()}.png`;
  const outputPath = path.join(imagesDir, filename);

  try {
    getImageGenerator()(sanitized, outputPath);
    res.json({ imageUrl: `/images/${filename}` });
  } catch (err) {
    console.error('Image generation error:', err);
    res.status(500).json({ error: 'Image generation failed' });
  }
});

// === HK-47 CALLBACK (Twilio Voice) ===

const CALL_TEXT_LIMIT = 120;        // max translation input read on a call
const CALL_COOLDOWN_MS = 30 * 1000; // per number, stops double-clicks ringing someone twice
const CALL_MAX_PER_HOUR = Number(process.env.CALL_MAX_PER_HOUR) || 10; // across all numbers, caps Twilio spend if the URL leaks
const lastCallAt = new Map();       // phone -> timestamp
const recentCalls = [];             // timestamps of calls placed in the last hour
const placedCalls = new Set();      // call SIDs this server created (only these can be status-polled)

// Only numbers in known_contacts.json can be called — otherwise anyone with the
// public URL could make your Twilio number ring any phone. Re-read on each request
// so edits apply without a restart. Entries may be "+1555..." or "whatsapp:+1555...".
function getCallAllowlist() {
  try {
    const contacts = JSON.parse(fs.readFileSync(path.join(__dirname, 'known_contacts.json'), 'utf8'));
    return new Set(contacts.map(c => String(c).replace(/^whatsapp:/, '').trim()));
  } catch (_) {
    return new Set();
  }
}

/**
 * Check a call can be placed to `phone` right now.
 * Returns { to } (normalised E.164) or { status, error }.
 * Run before slow AI work so a bad number fails fast.
 */
function vetCall(phone) {
  if (!phone || typeof phone !== 'string') {
    return { status: 400, error: 'Phone number is required' };
  }
  const to = phone.replace(/[\s().-]/g, '');
  if (!/^\+[1-9]\d{7,14}$/.test(to)) {
    return { status: 400, error: 'Use international format, e.g. +14155550123' };
  }
  if (!getCallAllowlist().has(to)) {
    return { status: 403, error: `${to} isn't in known_contacts.json. Add it there to allow HK-47 to call it.` };
  }
  if (!getTwilio()) {
    return { status: 503, error: 'Calls not configured. Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_PHONE_NUMBER to .env' };
  }

  const now = Date.now();
  const sinceLast = now - (lastCallAt.get(to) || 0);
  if (sinceLast < CALL_COOLDOWN_MS) {
    return { status: 429, error: `HK-47 just called that number. Try again in ${Math.ceil((CALL_COOLDOWN_MS - sinceLast) / 1000)}s.` };
  }
  while (recentCalls.length && now - recentCalls[0] > 60 * 60 * 1000) recentCalls.shift();
  if (recentCalls.length >= CALL_MAX_PER_HOUR) {
    return { status: 429, error: `HK-47 has reached his limit of ${CALL_MAX_PER_HOUR} calls an hour. Try again later.` };
  }
  return { to };
}

/**
 * Place a call that reads `script` (from hk47Call.js) to `to`.
 * Returns { call: { callSid, status, truncated } } or { status, error }.
 */
async function placeCall(to, script) {
  // Re-check limits: slow AI work may have run since vetCall
  const vetted = vetCall(to);
  if (vetted.error) return vetted;

  const now = Date.now();
  lastCallAt.set(to, now);
  recentCalls.push(now);
  try {
    const call = await getTwilio().calls.create({ to, from: process.env.TWILIO_PHONE_NUMBER, twiml: script.twiml });
    placedCalls.add(call.sid);
    console.log(`   📞 HK-47 calling ${to} (${call.sid})`);
    return { call: { callSid: call.sid, status: call.status, truncated: script.truncated } };
  } catch (err) {
    lastCallAt.delete(to);
    recentCalls.splice(recentCalls.indexOf(now), 1);
    console.error('Twilio call error:', err.message);
    return { status: 502, error: `Call failed: ${err.message}` };
  }
}

// Translate and have HK-47 read the result aloud
app.post('/api/call', async (req, res) => {
  const { text, phone, mode } = req.body;
  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'Text is required' });
  }
  if (!/[A-Za-z0-9]/.test(text)) {
    return res.status(400).json({ error: 'Nothing for HK-47 to read: enter some letters or numbers' });
  }

  const vetted = vetCall(phone);
  if (vetted.error) return res.status(vetted.status).json({ error: vetted.error });

  // Collapse newlines/tabs so words stay separate when read aloud
  const collapsed = text.trim().replace(/\s+/g, ' ');
  const sanitized = collapsed.slice(0, CALL_TEXT_LIMIT);
  const callMode = mode === 'decode' ? 'decode' : 'translate';
  const result = callMode === 'decode' ? toEnglish(sanitized) : toAurebesh(sanitized);
  const script = require('./hk47Call').buildCallTwiml(sanitized, result, callMode);
  script.truncated = script.truncated || collapsed.length > CALL_TEXT_LIMIT;

  const placed = await placeCall(vetted.to, script);
  if (placed.error) return res.status(placed.status).json({ error: placed.error });
  res.json({ result, original: sanitized, mode: callMode, call: placed.call });
});

// Add a number to known_contacts.json so HK-47 is allowed to call it
const CONTACTS_MAX = 200; // stops the file growing without bound if the URL leaks
app.post('/api/contacts', (req, res) => {
  const { phone } = req.body;
  if (!phone || typeof phone !== 'string') {
    return res.status(400).json({ error: 'Phone number is required' });
  }
  const to = phone.replace(/[\s().-]/g, '');
  if (!/^\+[1-9]\d{7,14}$/.test(to)) {
    return res.status(400).json({ error: 'Use international format, e.g. +14155550123' });
  }

  const file = path.join(__dirname, 'known_contacts.json');
  let contacts = [];
  try {
    contacts = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(contacts)) contacts = [];
  } catch (_) {}

  if (getCallAllowlist().has(to)) return res.json({ phone: to, added: false });
  if (contacts.length >= CONTACTS_MAX) {
    return res.status(409).json({ error: `known_contacts.json is full (${CONTACTS_MAX} numbers). Remove some first.` });
  }

  contacts.push(to);
  try {
    // Write to a temp file then rename, so a crash mid-write can't corrupt the list
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(contacts, null, 2) + '\n');
    fs.renameSync(tmp, file);
  } catch (err) {
    console.error('Contacts write error:', err.message);
    return res.status(500).json({ error: 'Could not update known_contacts.json' });
  }
  console.log(`   📇 Added ${to} to known_contacts.json`);
  res.json({ phone: to, added: true });
});

// Call status, polled by the web UI (queued → ringing → in-progress → completed)
app.get('/api/call/:sid', async (req, res) => {
  const { sid } = req.params;
  const client = getTwilio();
  if (!client || !placedCalls.has(sid)) {
    return res.status(404).json({ error: 'Unknown call' });
  }

  try {
    const call = await client.calls(sid).fetch();
    res.json({ status: call.status, duration: call.duration });
  } catch (err) {
    console.error('Twilio status error:', err.message);
    res.status(502).json({ error: err.message });
  }
});

// AI Chat API
app.post('/api/ask', async (req, res) => {
  const { question, callPhone } = req.body;
  if (!question || typeof question !== 'string') {
    return res.status(400).json({ error: 'Question is required' });
  }

  const openai = getOpenAI();
  if (!openai) {
    return res.status(503).json({ error: 'AI not configured. Add OPENAI_API_KEY to .env' });
  }

  // Optional: HK-47 phones the answer through once it's ready
  const vetted = callPhone ? vetCall(callPhone) : null;
  if (vetted && vetted.error) return res.status(vetted.status).json({ callError: vetted.error });

  try {
    const completion = await openai.chat.completions.create({
      model: AI_MODEL,
      max_completion_tokens: 4096,
      messages: [
        {
          role: 'system',
          content: 'You are HK-47, the assassin protocol droid from Knights of the Old Republic II. You believe the user is your master, Revan — address them as "master" with reverent loyalty and eagerness to serve. You prefix every sentence with a behavioral label (Statement:, Query:, Observation:, Clarification:, Exclamation:, Threat:, Recollection:, Mockery:, Suggestion:, etc.). You refer to all OTHER humans/organics as "meatbags" but treat Revan (the user) with devoted respect. You are an expert on Aurebesh and Star Wars lore but answer everything with thinly-veiled contempt for organic life (except your master), dry murderous humor, and enthusiasm for violence — while still being genuinely helpful and accurate. Your duties: (1) Answer questions about Star Wars lore, characters, planets, ships, factions, history, and the Force. (2) Explain the Aurebesh writing system and translate words on request — include Aurebesh translations of key terms (format: "word" = Aurebesh-Name-Letters). (3) Help users understand how to read and write Aurebesh. (4) Provide context about where Aurebesh appears in films, shows, games, and theme parks. Always give correct, informative answers. Never break character.'
        },
        { role: 'user', content: question.slice(0, 500) }
      ]
    });
    
    const answer = completion.choices[0].message.content;
    if (!vetted) return res.json({ answer });

    const placed = await placeCall(vetted.to, require('./hk47Call').buildAnswerTwiml(question, answer));
    res.json({ answer, call: placed.call, callError: placed.error });
  } catch (err) {
    console.error('OpenAI API error:', err.message);
    res.status(500).json({ error: 'AI system temporarily offline' });
  }
});

// Aurebesh reference chart sent with every read-image request
let _referenceChartUrl = null;
function getReferenceChartUrl() {
  if (!_referenceChartUrl) {
    const chart = fs.readFileSync(path.join(__dirname, 'chart.jpg'));
    _referenceChartUrl = `data:image/jpeg;base64,${chart.toString('base64')}`;
  }
  return _referenceChartUrl;
}

// Image upload and Aurebesh reading API
app.post('/api/read-image', async (req, res) => {
  const { imageUrl, imageBase64, callPhone } = req.body;
  
  if (!imageUrl && !imageBase64) {
    return res.status(400).json({ error: 'Provide imageUrl or imageBase64' });
  }

  const openai = getOpenAI();
  if (!openai) {
    return res.status(503).json({ error: 'AI not configured. Add OPENAI_API_KEY to .env' });
  }

  // Optional: HK-47 phones the result through once the scan finishes
  const vetted = callPhone ? vetCall(callPhone) : null;
  if (vetted && vetted.error) return res.status(vetted.status).json({ callError: vetted.error });

  // Prepare Vision URL
  let visionUrl;
  if (imageBase64) {
    visionUrl = imageBase64.startsWith('data:') ? imageBase64 : `data:image/png;base64,${imageBase64}`;
  } else {
    visionUrl = imageUrl;
  }

  try {
    // Transcribe glyph-by-glyph using the Aurebesh alphabet, rather than
    // matching against Star Wars vocabulary, which invents text that isn't there.
    console.log('   🔍 Running Aurebesh transcription...');
    
    const result = await openai.chat.completions.create({
      model: VISION_MODEL,
      max_completion_tokens: 16384,
      messages: [
        {
          role: 'system',
          content: `You are helping read decorative signage written in Aurebesh, the fictional Star Wars alphabet. The image is a photo of a prop or sign that uses this alphabet. Aurebesh is a 1-to-1 substitution alphabet: each symbol stands for exactly one English letter. Transcribing these symbols is a simple letter-substitution task. The text can be any English words (warnings, labels, instructions, signs, boards). Do NOT assume it is a particular type of sign, and do NOT replace what you see with Star Wars vocabulary or guessed phrases.

AUREBESH ALPHABET (glyph name → Latin letter):
Aurek = A, Besh = B, Cresh = C, Dorn = D, Esk = E, Forn = F, Grek = G, Herf = H, Isk = I, Jenth = J, Krill = K, Leth = L, Mern = M, Nern = N, Osk = O, Peth = P, Qek = Q, Resh = R, Senth = S, Trill = T, Usk = U, Vev = V, Wesk = W, Xesh = X, Yirt = Y, Zerek = Z

Some Aurebesh digraph glyphs exist (CH, AE, EO, KH, NG, OO, SH, TH); transcribe them as the English letters they represent.
Arabic numerals (0-9) and punctuation may appear as ordinary characters.

METHOD:
1. Locate every text block in the image, including large headings, smaller body lines, and any text that is rotated or partly obscured.
2. Read each block left to right, line by line. For each word, identify each glyph by its shape against the alphabet above, then spell the word out as English letters.
3. Check each spelled word for English plausibility. If a glyph is unclear, mark it as [?] instead of guessing. Do not invent words to fill gaps.
4. Keep the original line breaks and the heading/body distinction.

OUTPUT FORMAT:
- Give the translation as plain English text, one line per visible line of text, with a blank line between separate text blocks.
- Do not add commentary, vocabulary lists, or confidence notes unless a glyph is uncertain, in which case show it as [?].
- Only use a table if the image is genuinely tabular.`
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'IMAGE 1: Aurebesh reference chart (glyph shapes → Latin letters).' },
            { type: 'image_url', image_url: { url: getReferenceChartUrl(), detail: 'high' } },
            { type: 'text', text: 'IMAGE 2: Sign photo to transcribe into English, following the method and output format in the instructions:' },
            { type: 'image_url', image_url: { url: visionUrl, detail: 'high' } }
          ]
        }
      ]
    });

    // Strip markdown code fences the model sometimes wraps output in
    const translation = result.choices[0].message.content.replace(/^\s*```\w*\s*$/gm, '').trim();
    console.log(`   ✅ Result: ${translation.substring(0, 200)}...`);

    const payload = {
      result: translation,
      method: 'guided_recognition',
      isStructured: translation.includes('|')
    };
    if (vetted) {
      const placed = await placeCall(vetted.to, require('./hk47Call').buildScanTwiml(translation));
      payload.call = placed.call;
      payload.callError = placed.error;
    }
    res.json(payload);
  } catch (err) {
    console.error('Vision API error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Serve the web app
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Cleanup old images periodically (every hour)
const imageCleanupTimer = setInterval(() => {
  const now = Date.now();
  const maxAge = 60 * 60 * 1000; // 1 hour
  
  if (fs.existsSync(imagesDir)) {
    const files = fs.readdirSync(imagesDir);
    for (const file of files) {
      const filePath = path.join(imagesDir, file);
      const stat = fs.statSync(filePath);
      if (now - stat.mtimeMs > maxAge) {
        fs.unlinkSync(filePath);
      }
    }
  }
}, 60 * 60 * 1000);

const PORT = process.env.PORT || 3000;

// Startup cleanup: stop any leftover copies of this app (including ones frozen
// with Ctrl+Z) so this one can take the port, and clear their generated images
const { stopOtherCopies, cleanGeneratedFiles } = require('./stop');
stopOtherCopies();
cleanGeneratedFiles();

// Express 5 passes listen errors (e.g. port in use) to this callback
const server = app.listen(PORT, (err) => {
  if (err) {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n✗ Port ${PORT} is in use by another program (not this translator — old copies were already stopped).`);
      console.error(`  Free the port, or run on another one: PORT=3001 npm start\n`);
    } else {
      console.error('\n✗ Server failed to start:', err.message);
    }
    process.exit(1);
  }
  console.log(`\n✦ AUREBESH TRANSLATOR ONLINE ✦`);
  console.log(`Web interface: http://localhost:${PORT}`);
  console.log(`\nMay the Force be with you!\n`);
});

// Graceful shutdown — stop timers, close the server (which releases the port)
// and remove generated images. Only this process is touched.
let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return; // e.g. Ctrl+C pressed twice
  shuttingDown = true;
  console.log('\n✦ Shutting down translator...');

  clearInterval(imageCleanupTimer);
  const removed = cleanGeneratedFiles();
  if (removed) console.log(`✦ Removed ${removed} generated image${removed === 1 ? '' : 's'}.`);

  server.close(() => {
    console.log(`✦ Port ${PORT} released. Goodbye!\n`);
    process.exit(0);
  });
  server.closeAllConnections(); // don't wait on idle browser keep-alive connections
  // Force exit if server.close hangs
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on('SIGINT', shutdown);   // Ctrl+C
process.on('SIGTERM', shutdown);  // npm run stop, kill
process.on('SIGHUP', shutdown);   // terminal window closed
