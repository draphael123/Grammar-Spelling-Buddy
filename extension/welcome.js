/**
 * Grammar & Spelling Buddy — Welcome Page Script
 *
 * Handles:
 * - Real-time error detection in the textarea
 * - Issue card generation and fixing
 * - Celebration message display
 * - Page navigation
 */

// ─── Spell Checking Dictionary ─────────────────────────────
const DICTIONARY = {
  common: [
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
    'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did',
    'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
    'what', 'which', 'who', 'when', 'where', 'why', 'how', 'can', 'could', 'would',
    'should', 'will', 'shall', 'may', 'might', 'must', 'want', 'give', 'get', 'make',
    'take', 'go', 'come', 'see', 'know', 'think', 'feel', 'tell', 'try', 'use', 'work',
    'call', 'ask', 'need', 'find', 'show', 'look', 'help', 'turn', 'start', 'move',
    'great', 'good', 'bad', 'best', 'new', 'old', 'long', 'high', 'small', 'large',
    'other', 'same', 'different', 'public', 'private', 'own', 'such', 'no', 'yes',
    'result', 'results', 'program', 'update', 'looking', 'far', 'so', 'also', 'very',
    'just', 'only', 'more', 'less', 'most', 'some', 'any', 'all', 'each', 'every',
    'natural', 'will', 'do', 'this', 'automatically', 'on', 'page'
  ],
  misspellings: {
    'gave': { correct: 'give', type: 'spelling', message: 'Did you mean "give"?' },
    'progam': { correct: 'program', type: 'spelling', message: 'Did you mean "program"?' },
  }
};

// ─── Grammar Rules ────────────────────────────────────────
const GRAMMAR_RULES = [
  {
    pattern: /\b(is|are)\s+(\w+ing)\b/gi,
    description: 'Possible subject-verb disagreement',
    type: 'grammar',
    check: (text) => {
      const matches = [];
      const re = /\bthe results is\b/gi;
      let match;
      while ((match = re.exec(text)) !== null) {
        matches.push({
          start: match.index,
          end: match.index + match[0].length,
          text: match[0],
          suggestion: 'the results are',
          error: 'the results is',
          rule: 'Subject-verb agreement: "results" is plural, use "are"'
        });
      }
      return matches;
    }
  }
];

// ─── Issue Detection ───────────────────────────────────────
function detectIssues(text) {
  const issues = [];
  const words = text.split(/\s+/);
  let charIndex = 0;

  // Check spelling
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const cleanWord = word.toLowerCase().replace(/[.,!?;:]/g, '');

    if (DICTIONARY.misspellings[cleanWord]) {
      const error = DICTIONARY.misspellings[cleanWord];
      issues.push({
        type: 'spelling',
        error: cleanWord,
        suggestion: error.correct,
        message: error.message,
        originalWord: word,
        position: i,
        id: `spelling-${i}`
      });
    }
  }

  // Check grammar rules
  if (/\bthe results is\b/i.test(text)) {
    issues.push({
      type: 'grammar',
      error: 'the results is',
      suggestion: 'the results are',
      message: 'Subject-verb agreement: "results" is plural, use "are"',
      position: -1,
      id: 'grammar-1'
    });
  }

  return issues;
}

// ─── Render Issues ────────────────────────────────────────
function renderIssues(issues) {
  const container = document.getElementById('issuesContainer');
  const celebrationMsg = document.getElementById('celebrationMessage');

  if (issues.length === 0) {
    container.innerHTML = '';
    celebrationMsg.classList.add('show');
    return;
  }

  celebrationMsg.classList.remove('show');

  container.innerHTML = issues.map((issue, index) => `
    <div class="issue-card" data-issue-id="${issue.id}">
      <div class="issue-header">
        <span class="issue-type ${issue.type}">${issue.type}</span>
      </div>
      <div class="issue-text">
        Found: <strong>"${issue.error}"</strong>
      </div>
      <div class="issue-suggestion">
        <strong>Suggestion:</strong> "${issue.suggestion}"
      </div>
      <div class="issue-text" style="font-size: 12px; color: #94A3B8; margin-bottom: 12px;">
        ${issue.message}
      </div>
      <div class="issue-actions">
        <button class="fix-button" data-issue-id="${issue.id}" onclick="fixIssue('${issue.id}', '${issue.error}', '${issue.suggestion}')">
          Fix
        </button>
      </div>
    </div>
  `).join('');
}

// ─── Fix Issue ────────────────────────────────────────────
function fixIssue(issueId, error, suggestion) {
  const textarea = document.getElementById('testTextarea');
  const regex = new RegExp(`\\b${error}\\b`, 'gi');
  textarea.value = textarea.value.replace(regex, suggestion);

  const card = document.querySelector(`[data-issue-id="${issueId}"]`);
  if (card) {
    card.classList.add('fixed');
    setTimeout(() => {
      updateIssues();
    }, 300);
  }
}

// ─── Update Issues ────────────────────────────────────────
function updateIssues() {
  const textarea = document.getElementById('testTextarea');
  const issues = detectIssues(textarea.value);
  renderIssues(issues);
}

// ─── Event Listeners ──────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const textarea = document.getElementById('testTextarea');
  const startButton = document.getElementById('startButton');

  // Initialize issues
  updateIssues();

  // Real-time detection
  textarea.addEventListener('input', updateIssues);

  // Close button
  startButton.addEventListener('click', () => {
    window.close();
  });
});
