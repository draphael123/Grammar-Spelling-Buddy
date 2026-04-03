/**
 * Grammar & Spelling Buddy — Grammar Rules Engine
 *
 * Pattern-based grammar checker. Each rule is a regex + replacement suggestion.
 * Runs against full sentences to catch common grammar mistakes.
 */

const GSB_GRAMMAR_RULES = [

  // --- Subject-verb agreement ---
  {
    id: "sv-results-is",
    pattern: /\b(results?|data|people|children|women|men)\s+(is)\b/gi,
    message: (m) => `"${m[1]}" is plural — use "are" instead of "is"`,
    suggestion: (m) => m[0].replace(/\bis\b/i, "are"),
    type: "grammar"
  },
  {
    id: "sv-singular-are",
    pattern: /\b(he|she|it|everyone|someone|anyone|nobody|nothing|everything|each)\s+(are)\b/gi,
    message: (m) => `"${m[1]}" is singular — use "is" instead of "are"`,
    suggestion: (m) => m[0].replace(/\bare\b/i, "is"),
    type: "grammar"
  },
  {
    id: "sv-i-is",
    pattern: /\bI\s+is\b/g,
    message: () => `Use "I am" instead of "I is"`,
    suggestion: () => "I am",
    type: "grammar"
  },
  {
    id: "sv-you-was",
    pattern: /\byou\s+was\b/gi,
    message: () => `Use "you were" instead of "you was"`,
    suggestion: (m) => m[0].replace(/\bwas\b/i, "were"),
    type: "grammar"
  },
  {
    id: "sv-we-was",
    pattern: /\bwe\s+was\b/gi,
    message: () => `Use "we were" instead of "we was"`,
    suggestion: (m) => m[0].replace(/\bwas\b/i, "were"),
    type: "grammar"
  },
  {
    id: "sv-they-was",
    pattern: /\bthey\s+was\b/gi,
    message: () => `Use "they were" instead of "they was"`,
    suggestion: (m) => m[0].replace(/\bwas\b/i, "were"),
    type: "grammar"
  },

  // --- Common confused words ---
  {
    id: "their-there",
    pattern: /\b(their)\s+(is|are|was|were|will)\b/gi,
    message: () => `Did you mean "there" (location/existence) instead of "their" (possessive)?`,
    suggestion: (m) => m[0].replace(/\btheir\b/i, "there"),
    type: "grammar"
  },
  {
    id: "your-youre",
    pattern: /\b(your)\s+(a|an|the|going|welcome|right|wrong|not|very|so|too|being|doing)\b/gi,
    message: () => `Did you mean "you're" (you are) instead of "your" (possessive)?`,
    suggestion: (m) => m[0].replace(/\byour\b/i, "you're"),
    type: "grammar"
  },
  {
    id: "its-its",
    pattern: /\b(its)\s+(a|an|the|going|not|very|been|being)\b/gi,
    message: () => `Did you mean "it's" (it is) instead of "its" (possessive)?`,
    suggestion: (m) => m[0].replace(/\bits\b/i, "it's"),
    type: "grammar"
  },
  {
    id: "then-than",
    pattern: /\b(more|less|better|worse|bigger|smaller|faster|slower|higher|lower|rather|other)\s+(then)\b/gi,
    message: () => `Use "than" for comparisons, not "then"`,
    suggestion: (m) => m[0].replace(/\bthen\b/i, "than"),
    type: "grammar"
  },
  {
    id: "effect-affect",
    pattern: /\b(the|a|an|this|that|its|no|any|some|positive|negative|big|huge|major|minor|significant)\s+(affect)\b/gi,
    message: () => `When used as a noun, the correct word is "effect" (not "affect")`,
    suggestion: (m) => m[0].replace(/\baffect\b/i, "effect"),
    type: "grammar"
  },
  {
    id: "to-too",
    pattern: /\b(I|you|we|they|he|she|it)\s+(to)\s+(am|is|are|was|were|have|has|had)\b/gi,
    message: () => `Did you mean "too" (also/excessively)?`,
    suggestion: (m) => m[0].replace(/\bto\b/i, "too"),
    type: "grammar"
  },

  // --- Double words ---
  {
    id: "double-word",
    pattern: /\b(\w+)\s+\1\b/gi,
    message: (m) => `Repeated word: "${m[1]}"`,
    suggestion: (m) => m[1],
    type: "grammar"
  },

  // --- Article usage ---
  // Words starting with vowel letters but consonant SOUNDS (use "a", not "an"):
  //   u-words: unique, university, uniform, united, union, universal, usage, used,
  //            useful, usual, user, using, utility, utensil, uranium, uterus
  //   o-words: one, once
  //   eu-words: European, eulogy, euphoria, eucalyptus
  {
    id: "a-an-vowel",
    pattern: /\ba\s+([aeiou]\w*)/gi,
    message: () => `Use "an" before words starting with a vowel sound`,
    suggestion: (m) => "an " + m[1],
    type: "grammar",
    exceptions: /\ba\s+(uni\w+|use[dfrsu]\w*|using|usual\w*|usur\w+|util\w+|uter\w+|uran\w+|one|once|eu\w+)/i
  },
  // Words starting with consonant letters but vowel SOUNDS (use "an", not "a"):
  //   h-words: hour, honest, honor, honour, heir, herb, hors
  //   acronyms/letters: an FBI, an MBA, an HTML (pronounced with vowel sounds)
  {
    id: "an-consonant",
    pattern: /\ban\s+([bcdfghjklmnpqrstvwxyz]\w*)/gi,
    message: () => `Use "a" before words starting with a consonant sound`,
    suggestion: (m) => "a " + m[1],
    type: "grammar",
    exceptions: /\ban\s+(ho(u|ne|no|rs)|heir|herb|MBA|FBI|HTML|HTTP|SQL|LLC|RN|NP|MD|DO|HRT|SMS|MRI|X-?\w*)/i
  },

  // --- Verb tense ---
  {
    id: "have-has",
    pattern: /\b(he|she|it)\s+(have)\b/gi,
    message: () => `Use "has" with he/she/it (third person singular)`,
    suggestion: (m) => m[0].replace(/\bhave\b/i, "has"),
    type: "grammar"
  },
  {
    id: "has-plural",
    pattern: /\b(I|you|we|they)\s+(has)\b/gi,
    message: (m) => `Use "have" with "${m[1]}", not "has"`,
    suggestion: (m) => m[0].replace(/\bhas\b/i, "have"),
    type: "grammar"
  },
  {
    id: "did-base",
    pattern: /\b(did)\s+(went|came|saw|gave|took|ran|ate|wrote|drove|spoke|broke|chose|wore|grew|knew|threw|drew|flew|blew|sang|swam|rang|drank|began|forgot|hid|bit|tore|woke|froze|shook|stole)\b/gi,
    message: (m) => `After "did", use the base form of the verb (not past tense)`,
    suggestion: (m) => {
      const pastToBase = {
        "went":"go","came":"come","saw":"see","gave":"give","took":"take",
        "ran":"run","ate":"eat","wrote":"write","drove":"drive","spoke":"speak",
        "broke":"break","chose":"choose","wore":"wear","grew":"grow","knew":"know",
        "threw":"throw","drew":"draw","flew":"fly","blew":"blow","sang":"sing",
        "swam":"swim","rang":"ring","drank":"drink","began":"begin","forgot":"forget",
        "hid":"hide","bit":"bite","tore":"tear","woke":"wake","froze":"freeze",
        "shook":"shake","stole":"steal"
      };
      return "did " + (pastToBase[m[2].toLowerCase()] || m[2]);
    },
    type: "grammar"
  },

  // --- Punctuation helpers ---
  {
    id: "comma-and",
    pattern: /(\w)\s+(and|but|or|so|yet)\s+([A-Z])/g,
    // Only suggest if there's no comma before the conjunction in a compound sentence.
    // This is a soft suggestion — many valid cases exist without a comma.
    message: () => `Consider adding a comma before the conjunction in a compound sentence`,
    suggestion: (m) => m[1] + ", " + m[2] + " " + m[3],
    type: "style"
  },

  // --- Common mistakes ---
  {
    id: "could-of",
    pattern: /\b(could|would|should|must|might)\s+(of)\b/gi,
    message: () => `Use "have" instead of "of" — e.g., "could have"`,
    suggestion: (m) => m[1] + " have",
    type: "grammar"
  },
  {
    id: "suppose-to",
    pattern: /\b(suppose|use)\s+(to)\b/gi,
    message: (m) => `Use "${m[1]}d to" (past tense)`,
    suggestion: (m) => m[1] + "d to",
    type: "grammar"
  },
  {
    id: "irregardless",
    pattern: /\birregardless\b/gi,
    message: () => `"Irregardless" is nonstandard — use "regardless"`,
    suggestion: () => "regardless",
    type: "grammar"
  },
  {
    id: "alright",
    pattern: /\balright\b/gi,
    message: () => `"Alright" is informal — consider "all right"`,
    suggestion: () => "all right",
    type: "style"
  },
  {
    id: "loose-lose",
    pattern: /\byou\s+might\s+loose\b|\bdon't\s+loose\b|\bwill\s+loose\b|\bgoing\s+to\s+loose\b/gi,
    message: () => `Did you mean "lose" (to misplace) instead of "loose" (not tight)?`,
    suggestion: (m) => m[0].replace(/\bloose\b/i, "lose"),
    type: "grammar"
  }
];

/**
 * Run all grammar rules against a block of text.
 * Returns an array of { start, end, message, suggestion, type, ruleId }
 */
function gsbCheckGrammar(text) {
  const issues = [];

  for (const rule of GSB_GRAMMAR_RULES) {
    // Reset regex lastIndex
    rule.pattern.lastIndex = 0;

    let match;
    while ((match = rule.pattern.exec(text)) !== null) {
      // Check exceptions
      if (rule.exceptions && rule.exceptions.test(match[0])) continue;

      issues.push({
        start: match.index,
        end: match.index + match[0].length,
        original: match[0],
        message: rule.message(match),
        suggestion: rule.suggestion(match),
        type: rule.type || "grammar",
        ruleId: rule.id
      });
    }
  }

  return issues;
}
