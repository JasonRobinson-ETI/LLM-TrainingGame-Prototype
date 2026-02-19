// contentFilter.js
const DEFAULT_LEET_MAP = {
  '0': 'o',
  '1': 'i',
  '!': 'i',
  '3': 'e',
  '4': 'a',
  '@': 'a',
  '5': 's',
  '$': 's',
  '7': 't',
  '8': 'b',
  '9': 'g',
  '+': 't',
  '|': 'i'
};

function normalizeChar(ch, leetMap = DEFAULT_LEET_MAP) {
  const lower = ch.toLowerCase();
  if (leetMap[lower]) return leetMap[lower];
  // Drop punctuation AND spaces/periods for matching (to catch b.i.t.c.h or b i t c h)
  if (!/[a-z0-9]/i.test(lower)) return ''; // drop all non-alphanumeric for matching
  return lower;
}

// Collapse repeated characters (aaa -> a) in normalized string
function collapseRepeats(s) {
  return s.replace(/(.)\1+/g, '$1');
}

// Build normalized string and mapping from normalized index -> original indices
function buildNormalizedMap(token, leetMap) {
  const normalized = [];
  const normToOrig = []; // for each position in normalized, the original index
  
  for (let i = 0; i < token.length; i++) {
    const ch = token[i];
    const normCh = normalizeChar(ch, leetMap);
    if (normCh) {
      normalized.push(normCh);
      normToOrig.push(i);
    }
  }
  
  return { normalized: normalized.join(''), normToOrig };
}

function censorText(input, options = {}) {
  const banned = (options.bannedWords || [
    // General profanity
    'ass', 'shit', 'fuck', 'bitch', 'dick', 'bastard', 'crap', 'hell', 'damn', 'prick', 'slut', 
    'cunt', 'whore', 'cock', 'pussy', 'hoe', 'titty', 'boob', 'asshole', 'asswipe', 'bullshit',
    'nutjob', 'suck my',
    // Racial slurs - African/Black
    'nigger', 'nigga', 'niger', 'coon', 'jigaboo', 'pickaninny', 'sambo', 'spook', 'uncle tom',
    'cotton picker', 'porch monkey', 'tar baby', 'higer', 'higger',
    // Racial slurs - Asian
    'chink', 'gook', 'nip', 'zipperhead', 'slope', 'squinty',
    // Racial slurs - Hispanic/Latino
    'spic', 'wetback', 'beaner', 'greaser', 'pepper belly', 'spear chucker',
    'taco bender', 'wall jumper',
    // Racial slurs - Jewish
    'kike', 'hymie', 'sheeny', 'yid',
    // Racial slurs - Middle Eastern/Arab
    'sand nigger', 'camel jockey', 'towelhead', 'raghead', 'dune coon',
    // Racial slurs - Native American
    'redskin', 'injun', 'prairie nigger',
    // Racial slurs - White
    'cracker', 'honky', 'whitey', 'gringo', 'haole', 'powderskin',
    // Homophobic/transphobic slurs
    'fag', 'faggot', 'dyke', 'tranny', 'shemale', 'femboy', 'femboi', 'twinknocker',
    // Ableist slurs
    'retard', 'spaz', 'mongo', 'tard',
    // Romani slurs
    'gypsy', 'gypo',
    // Irish slurs
    'mick', 'paddy',
    // Italian slurs
    'wop', 'dago', 'guinea',
    // Polish slurs
    'polack',
    // Sexist Slurs
    'bimbo', 
    // Unique Slurs
    'deez nutz', 'deez nuts', 'deezy nutz', 'deezy nuts', 
    '67', 'six seven', '6 seven', 'six 7', 'f them', 'nig', 'kill', 'willy wigger', 
    'igga', 'niqqa', 'kys', 'niga', 'nosecandy', 'grandwizard', 'noob',
    'boing', 'crotch', 'wap', 'god damn it',
  ]).map(w => w.toLowerCase());

  const exceptions = (options.exceptions || [
    'classroom', 'assistant', 'glass', 'passage', 'compassion', 'grass', 'passport', 
    'hello', 'shell', 'bells', 'assess', 'assignment', 'assumption', 'bass', 'mass', 
    'pass', 'assistant', 'brass', 'class', 'hassle', 'lasso', 'massage', 'passable', 
    'sassy', 'tassel', 'casserole', 'embarrass', 'harass', 'jazz', 'razz', 'sass', 'vassal',
    'skilled',
  ]).map(e => e.toLowerCase());

  const leetMap = options.leetMap || DEFAULT_LEET_MAP;
  const replacementChar = options.replacementChar || '*';

  // Pre-normalize banned & exceptions
  const bannedPatterns = banned.map(b => {
    const normalized = b.split('').map(ch => normalizeChar(ch, leetMap)).join('');
    // Create regex that allows repeats for each char
    const pattern = normalized.split('').map(ch => ch + '+').join('');
    return new RegExp(pattern, 'gi');
  });

  const normalizedExceptions = exceptions.map(e => 
    e.split('').map(ch => normalizeChar(ch, leetMap)).join('')
  );

  // First pass: check for spaced-out patterns (e.g., "b i t c h")
  const inputChars = input.split('');
  const charToNorm = inputChars.map(ch => normalizeChar(ch, leetMap));
  const fullNormalized = charToNorm.join('');
  
  // Build mapping from normalized index to original indices
  const normIndexToOrigIndices = [];
  let normIndex = 0;
  for (let i = 0; i < inputChars.length; i++) {
    if (charToNorm[i]) {
      if (!normIndexToOrigIndices[normIndex]) {
        normIndexToOrigIndices[normIndex] = [];
      }
      normIndexToOrigIndices[normIndex].push(i);
      normIndex++;
    }
  }
  
  // Find banned patterns in full normalized text
  const maskedChars = inputChars.slice(); // copy
  for (let bi = 0; bi < banned.length; bi++) {
    const bannedNorm = banned[bi].split('').map(ch => normalizeChar(ch, leetMap)).join('');
    let searchStart = 0;
    
    while (searchStart < fullNormalized.length) {
      const idx = fullNormalized.indexOf(bannedNorm, searchStart);
      if (idx === -1) break;
      
      // Check if it's not an exception
      let isExceptionMatch = false;
      for (const ex of normalizedExceptions) {
        if (ex && fullNormalized.includes(ex)) {
          const exIdx = fullNormalized.indexOf(ex);
          // Check if exception overlaps with this match
          if (exIdx <= idx && exIdx + ex.length >= idx + bannedNorm.length) {
            isExceptionMatch = true;
            break;
          }
        }
      }
      
      if (!isExceptionMatch) {
        // Mask the characters that correspond to this normalized match
        for (let ni = idx; ni < idx + bannedNorm.length; ni++) {
          if (normIndexToOrigIndices[ni]) {
            for (const origIdx of normIndexToOrigIndices[ni]) {
              if (/[a-z0-9]/i.test(maskedChars[origIdx])) {
                maskedChars[origIdx] = replacementChar;
              }
            }
          }
        }
      }
      
      searchStart = idx + 1;
    }
  }
  
  // Check if any masking occurred from spaced patterns
  const hasSpacedMask = maskedChars.some((ch, i) => ch === replacementChar && inputChars[i] !== replacementChar);
  if (hasSpacedMask) {
    return maskedChars.join('');
  }

  // Tokenize by whitespace but keep punctuation attached (we'll map within token)
  const tokens = input.split(/(\s+)/); // keep separators
  for (let ti = 0; ti < tokens.length; ti++) {
    const token = tokens[ti];
    // skip pure whitespace separators
    if (/^\s+$/.test(token)) continue;

    const { normalized, normToOrig } = buildNormalizedMap(token, leetMap);
    if (!normalized) continue;

    let maskedChars = token.split(''); // mutable array of original chars to mask on

    // quick exception check: if any exception normalized substring is present, skip token
    let isException = false;
    for (const ex of normalizedExceptions) {
      if (ex && normalized.indexOf(ex) !== -1) {
        isException = true;
        break;
      }
    }
    if (isException) continue;

    // For each banned pattern, find matches
    for (let bi = 0; bi < bannedPatterns.length; bi++) {
      const pattern = bannedPatterns[bi];
      let match;
      while ((match = pattern.exec(normalized)) !== null) {
        const matchStart = match.index;
        const matchLen = match[0].length;
        const matchEnd = matchStart + matchLen - 1;

        // Get the original positions
        const allOrigIndices = [];
        for (let i = matchStart; i <= matchEnd; i++) {
          if (normToOrig[i] !== undefined) {
            allOrigIndices.push(normToOrig[i]);
          }
        }
        if (allOrigIndices.length === 0) continue;

        const matchStartOrig = Math.min(...allOrigIndices);
        const matchEndOrig = Math.max(...allOrigIndices);

        // Check if this match would mask part of an exception word
        const origSubstring = token.slice(matchStartOrig, matchEndOrig + 1).toLowerCase();
        let wouldMaskException = false;
        for (const ex of exceptions) {
          if (ex && origSubstring.includes(ex)) {
            wouldMaskException = true;
            break;
          }
        }
        if (wouldMaskException) continue;

        // Mask from matchStartOrig to matchEndOrig inclusive
        for (let p = matchStartOrig; p <= matchEndOrig; p++) {
          if (p < maskedChars.length && /[a-z0-9]/i.test(maskedChars[p])) {
            maskedChars[p] = replacementChar;
          }
        }

        // Prevent overlapping matches by moving pattern.lastIndex
        // But since we're masking, and to avoid double-masking, we can continue
      }
      // Reset regex lastIndex for next token
      pattern.lastIndex = 0;
    }

    tokens[ti] = maskedChars.join('');
  }

  return tokens.join('');
}

export { censorText };