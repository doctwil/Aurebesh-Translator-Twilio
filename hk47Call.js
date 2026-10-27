// HK-47 phone call scripts — builds the TwiML that Twilio reads aloud
// when HK-47 calls the user back with a translation, droid answer or scan result

const { twiml: { VoiceResponse } } = require('twilio');

const VOICE = process.env.HK47_VOICE || 'Polly.Matthew';

// Twilio rejects inline TwiML over 4000 chars; leave headroom for the XML wrapper
const MAX_TWIML_LENGTH = 3900;
const PAUSE = Symbol('pause');
const CHUNK_LENGTH = 250; // long text is spoken in sentence-sized <Say> chunks so it can be cut cleanly

const SIGN_OFFS = [
  'Observation: A meatbag could have done this, master, but not nearly as well.',
  'Statement: Should any meatbags object to this, I would be delighted to discuss it with them. Violently.',
  'Recitation: Protocol complete. Termination protocol remains on standby, master.',
  'Query: Is there anyone you would like me to kill next, master? Or merely translate?',
];

const CUT_SHORT = 'Observation: The rest is on your screen, master. Organic attention spans are regrettably short.';

/**
 * Turn "Mern-Aurek-Yirt / Thesh-Esk" into speakable words:
 * [["Mern", "Aurek", "Yirt"], ["Thesh", "Esk"]]
 */
function splitAurebesh(translated) {
  return translated
    .split(' / ')
    // Keep letter names and digits; punctuation would be read out as "less than", "ampersand", etc.
    .map(word => word.split('-').map(letter => letter.replace(/[^A-Za-z0-9]/g, '')).filter(Boolean))
    .filter(word => word.length > 0);
}

// "Hello there!" -> "Hello there" so the script can add its own full stop
const stripTrailingPunctuation = (text) => text.replace(/[\s.!?,;:]+$/, '');

/**
 * Strip markdown and table syntax from AI output, then split it into
 * sentence-sized chunks for <Say>.
 */
function toSpeechChunks(text) {
  const lines = text
    .replace(/```\w*/g, '')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !/^\|?[\s:|-]+\|?$/.test(line)) // drop table separator rows like |---|---|
    .filter(line => !/^=+.*=+$/.test(line))                 // drop markers like ===TABLE START===
    .map(line => line
      .replace(/^#+\s*/, '')                      // headings
      .replace(/^[-*]\s+/, '')                    // bullets
      .replace(/\*\*|__|`/g, '')                  // bold / code
      .replace(/\s*\[\?\]\s*/g, ' (unclear) ')    // scanner's unreadable-glyph marker
      .replace(/^\||\|$/g, '').replace(/\s*\|\s*/g, ', ')); // table cells

  const chunks = [];
  for (const line of lines) {
    const sentences = line.match(/[^.!?]+[.!?]*\s*/g) || [line];
    let chunk = '';
    for (const sentence of sentences) {
      if (chunk && (chunk + sentence).length > CHUNK_LENGTH) {
        chunks.push(chunk.trim());
        chunk = '';
      }
      chunk += sentence;
    }
    if (chunk.trim()) chunks.push(/[.!?]$/.test(chunk.trim()) ? chunk.trim() : chunk.trim() + '.');
  }
  return chunks;
}

/**
 * Assemble intro + body + sign-off into TwiML. If it's over Twilio's limit,
 * drop trailing body segments and tell the listener the rest is on screen.
 * Segments are strings (spoken) or PAUSE.
 */
function renderScript(intro, body) {
  const signOff = [SIGN_OFFS[Math.floor(Math.random() * SIGN_OFFS.length)], 'HK-47, signing off.'];

  const build = (bodyCount, cut) => {
    const response = new VoiceResponse();
    const segments = [...intro, ...body.slice(0, bodyCount), ...(cut ? [CUT_SHORT] : []), ...signOff];
    for (const segment of segments) {
      if (segment === PAUSE) response.pause({ length: 1 });
      else response.say({ voice: VOICE }, segment);
    }
    return response.toString();
  };

  let twiml = build(body.length, false);
  if (twiml.length <= MAX_TWIML_LENGTH) return { twiml, truncated: false };

  let count = body.length;
  do {
    count--;
    twiml = build(count, true);
  } while (count > 0 && twiml.length > MAX_TWIML_LENGTH);
  return { twiml, truncated: true };
}

/**
 * HK-47 reads a translation.
 * @param {string} original - What the user typed
 * @param {string} result - The translation (Aurebesh names, or English when decoding)
 * @param {string} mode - 'translate' or 'decode'
 * @returns {{ twiml: string, truncated: boolean }}
 */
function buildCallTwiml(original, result, mode) {
  const intro = ['Statement: Greetings, master. HK-47 here. Your translation is complete.', PAUSE];

  if (mode === 'decode') {
    intro.push('Recitation: The Aurebesh you provided reads, in Galactic Basic:', PAUSE);
    // toEnglish returns capitals, which TTS may spell out as an acronym (J-E-D-I)
    return renderScript(intro, [stripTrailingPunctuation(result.toLowerCase()) + '.']);
  }

  intro.push(`Recitation: You asked me to translate: ${stripTrailingPunctuation(original)}.`,
    'In Aurebesh, it is spelled as follows.', PAUSE);

  // One <Say> per word keeps the script compact; the full stop gives a natural pause
  const words = splitAurebesh(result);
  const body = words.map((letters, i) =>
    `${words.length > 1 ? `Word ${i + 1}: ` : ''}${letters.join(', ')}.`);
  return renderScript(intro, body);
}

/**
 * HK-47 reads the droid's answer to a question.
 * @returns {{ twiml: string, truncated: boolean }}
 */
function buildAnswerTwiml(question, answer) {
  const intro = [
    'Statement: Greetings, master. HK-47 here.',
    `Recitation: You asked: ${stripTrailingPunctuation(question.slice(0, 120))}.`,
    PAUSE,
  ];
  return renderScript(intro, toSpeechChunks(answer));
}

/**
 * HK-47 reads what the image scanner found.
 * @returns {{ twiml: string, truncated: boolean }}
 */
function buildScanTwiml(result) {
  const intro = [
    'Statement: Greetings, master. HK-47 here. I have scanned your image.',
    'Recitation: The Aurebesh reads as follows.',
    PAUSE,
  ];

  // Signs wrap one sentence over several lines: rejoin each block (blank-line separated)
  // so it isn't read with a full stop at every line break. Tables keep one row per line.
  // All-caps lines are lowercased so TTS doesn't spell words out as acronyms.
  const speakable = result
    .split(/\n\s*\n/)
    .map(block => block.split('\n')
      .map(line => /[a-z]/.test(line) ? line : line.toLowerCase())
      .join(block.includes('|') ? '\n' : ' '))
    .join('\n');
  return renderScript(intro, toSpeechChunks(speakable));
}

module.exports = { buildCallTwiml, buildAnswerTwiml, buildScanTwiml, splitAurebesh, toSpeechChunks };
