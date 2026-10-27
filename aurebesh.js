// Aurebesh character mapping (Latin -> Aurebesh Unicode/name mapping)
// Aurebesh is the writing system seen in the Star Wars galaxy

const AUREBESH_MAP = {
  'A': 'Aurek',    'B': 'Besh',     'C': 'Cresh',    'D': 'Dorn',
  'E': 'Esk',      'F': 'Forn',     'G': 'Grek',     'H': 'Herf',
  'I': 'Isk',      'J': 'Jenth',    'K': 'Krill',    'L': 'Leth',
  'M': 'Mern',     'N': 'Nern',     'O': 'Osk',      'P': 'Peth',
  'Q': 'Qek',      'R': 'Resh',     'S': 'Senth',    'T': 'Trill',
  'U': 'Usk',      'V': 'Vev',      'W': 'Wesk',     'X': 'Xesh',
  'Y': 'Yirt',     'Z': 'Zerek',
  // Digraphs
  'CH': 'Cherek',  'AE': 'Enth',    'EO': 'Onith',   'KH': 'Krenth',
  'NG': 'Nen',     'OO': 'Orenth',  'SH': 'Shen',    'TH': 'Thesh',
};

// Reverse map: Aurebesh name -> Latin
const REVERSE_MAP = {};
for (const [latin, aurebesh] of Object.entries(AUREBESH_MAP)) {
  REVERSE_MAP[aurebesh.toUpperCase()] = latin;
}

/**
 * Transliterate English text to Aurebesh letter names
 * (since actual Aurebesh glyphs require a custom font, we provide names)
 */
function toAurebesh(text) {
  const upper = text.toUpperCase();
  let result = [];
  let i = 0;

  while (i < upper.length) {
    // Greedy matching: try to consume the longest match first (2-char digraphs)
    // before falling back to single characters. e.g. "TH" → Thesh, not Trill + Herf.
    if (i + 1 < upper.length) {
      const digraph = upper[i] + upper[i + 1];
      if (AUREBESH_MAP[digraph]) {
        result.push(AUREBESH_MAP[digraph]);
        i += 2;
        continue;
      }
    }

    const char = upper[i];
    if (AUREBESH_MAP[char]) {
      result.push(AUREBESH_MAP[char]);
    } else if (char === ' ') {
      result.push(' / ');
    } else if (/[0-9]/.test(char)) {
      result.push(char);
    } else {
      result.push(char); // Keep punctuation as-is
    }
    i++;
  }

  return result.join('-').replace(/-( \/ )-/g, ' / ');
}

/**
 * Transliterate Aurebesh names back to English
 */
function toEnglish(text) {
  const parts = text.split(' / ');
  return parts.map(word => {
    const letters = word.split('-');
    return letters.map(letter => {
      const lookup = REVERSE_MAP[letter.trim().toUpperCase()];
      return lookup || letter;
    }).join('');
  }).join(' ');
}

module.exports = { toAurebesh, toEnglish, AUREBESH_MAP };
