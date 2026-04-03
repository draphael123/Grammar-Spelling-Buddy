(function() {
  'use strict';

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  const TAB_REVIEW = 'review';
  const TAB_INSIGHTS = 'insights';
  const TAB_SETTINGS = 'settings';

  const DEFAULT_SETTINGS = {
    gsbEnabled: true,
    gsbIntensity: 'standard',
    gsbUnderlineStyle: 'wavy',
    gsbAutoFix: false,
    gsbIgnoredWords: [],
    gsbDisabledSites: []
  };

  // DOM references (matched to popup.html IDs)
  const dom = {
    reviewTab: document.querySelector('[data-tab="review"]'),
    insightsTab: document.querySelector('[data-tab="insights"]'),
    settingsTab: document.querySelector('[data-tab="settings"]'),
    reviewContent: document.getElementById('review-tab'),
    insightsContent: document.getElementById('insights-tab'),
    settingsContent: document.getElementById('settings-tab'),
    enableToggle: document.getElementById('headerToggle'),
    statsArea: document.getElementById('issueList'),
    noIssues: document.getElementById('celebrationContainer'),
    spellingCount: document.getElementById('spellingCount'),
    grammarCount: document.getElementById('grammarCount'),
    statusText: document.getElementById('statusCount'),
    wordCount: document.getElementById('wordCount'),
    charCount: document.getElementById('charCount'),
    sentenceCount: document.getElementById('sentenceCount'),
    avgSentenceLength: document.getElementById('avgSentenceLength'),
    readingLevel: document.getElementById('readingLevelBadge'),
    fleschGrade: document.getElementById('fleschKincaid'),
    passiveVoicePercent: document.getElementById('passiveVoice'),
    intensitySelect: document.getElementById('checkingIntensity'),
    underlineSelect: document.getElementById('underlineStyle'),
    autoFixToggle: document.getElementById('autoFixToggle'),
    ignoreInput: document.getElementById('ignoredWordInput'),
    ignoreAddBtn: document.getElementById('addIgnoredWordButton'),
    ignoreList: document.getElementById('ignoredWordsList'),
    disabledInput: document.getElementById('disabledSiteInput'),
    disabledAddBtn: document.getElementById('addDisabledSiteButton'),
    disabledList: document.getElementById('disabledSitesList'),
    siteDomain: document.getElementById('siteDomain')
  };

  // ============================================================================
  // STORAGE & INITIALIZATION
  // ============================================================================

  function loadSettings(callback) {
    chrome.storage.sync.get(DEFAULT_SETTINGS, callback);
  }

  function saveSettings(data, callback) {
    chrome.storage.sync.set(data, callback || (() => {}));
  }

  // ============================================================================
  // TAB SWITCHING
  // ============================================================================

  function switchTab(tabName) {
    document.querySelectorAll('[data-tab]').forEach(tab => {
      tab.classList.remove('active');
    });
    document.querySelectorAll('.tab-content').forEach(content => {
      content.style.display = 'none';
    });

    const tabElement = document.querySelector(`[data-tab="${tabName}"]`);
    if (tabElement) tabElement.classList.add('active');

    const contentElement = document.getElementById(`${tabName}-tab`);
    if (contentElement) contentElement.style.display = 'block';

    if (tabName === TAB_INSIGHTS) {
      loadInsightsData();
    } else if (tabName === TAB_REVIEW) {
      requestReviewStatus();
    }
  }

  // ============================================================================
  // ENABLE TOGGLE
  // ============================================================================

  function handleToggle() {
    // Toggle is a <button> using .active class, not a checkbox
    dom.enableToggle.classList.toggle('active');
    const enabled = dom.enableToggle.classList.contains('active');
    saveSettings({ gsbEnabled: enabled }, () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length === 0) return;
        chrome.tabs.sendMessage(
          tabs[0].id,
          { action: 'GSB_TOGGLE', enabled },
          () => {
            if (chrome.runtime.lastError) {
              console.log('Content script not ready or unavailable');
            }
          }
        );
      });
    });
  }

  // ============================================================================
  // REVIEW TAB
  // ============================================================================

  function requestReviewStatus() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length === 0) return;
      chrome.tabs.sendMessage(
        tabs[0].id,
        { action: 'GSB_GET_STATUS' },
        (response) => {
          if (chrome.runtime.lastError) {
            console.log('Content script not ready');
            return;
          }
          if (response && typeof response.issueCount === 'number') {
            updateReviewStats(response.issueCount, response.spelling || 0, response.grammar || 0);
          }
        }
      );
    });
  }

  function updateReviewStats(total, spelling, grammar) {
    if (total === 0) {
      if (dom.statsArea) dom.statsArea.style.display = 'none';
      if (dom.noIssues) { dom.noIssues.style.display = 'flex'; }
    } else {
      if (dom.statsArea) dom.statsArea.style.display = 'block';
      if (dom.noIssues) dom.noIssues.style.display = 'none';
      if (dom.spellingCount) dom.spellingCount.textContent = spelling;
      if (dom.grammarCount) dom.grammarCount.textContent = grammar;
      if (dom.statusText) dom.statusText.textContent = total;
    }
  }

  // Listen for real-time issue count updates
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'GSB_ISSUE_COUNT') {
      updateReviewStats(
        request.issueCount,
        request.spelling || 0,
        request.grammar || 0
      );
    }
  });

  // ============================================================================
  // INSIGHTS TAB & WRITING STATS
  // ============================================================================

  function countSyllables(word) {
    word = word.toLowerCase();
    let count = 0;
    let previousWasVowel = false;

    for (let i = 0; i < word.length; i++) {
      const char = word[i];
      const isVowel = /[aeiouy]/.test(char);
      if (isVowel && !previousWasVowel) {
        count++;
      }
      previousWasVowel = isVowel;
    }

    // Adjust for silent e
    if (word.endsWith('e')) {
      count--;
    }

    return Math.max(1, count);
  }

  function calculateWritingStats(text) {
    if (!text || text.trim().length === 0) {
      return {
        wordCount: 0,
        charCount: 0,
        sentenceCount: 0,
        avgSentenceLength: 0,
        fleschKincaid: 0,
        readabilityLabel: 'N/A',
        passiveVoicePercent: 0
      };
    }

    const words = text.trim().split(/\s+/).filter(w => w.length > 0);
    const wordCount = words.length;
    const charCount = text.replace(/\s/g, '').length;
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const sentenceCount = Math.max(1, sentences.length);

    // Calculate syllables
    let totalSyllables = 0;
    words.forEach(word => {
      totalSyllables += countSyllables(word);
    });

    const avgSentenceLength = parseFloat((wordCount / sentenceCount).toFixed(2));

    // Flesch-Kincaid Grade Level
    const fk = 0.39 * (wordCount / sentenceCount) + 11.8 * (totalSyllables / wordCount) - 15.59;
    const fleschKincaid = parseFloat(Math.max(0, fk).toFixed(1));

    let readabilityLabel = 'Expert';
    if (fleschKincaid < 6) readabilityLabel = 'Easy';
    else if (fleschKincaid < 10) readabilityLabel = 'Standard';
    else if (fleschKincaid < 14) readabilityLabel = 'Advanced';

    // Passive voice detection
    const passivePattern = /\b(was|were|is|are|been|be)\s+[a-zA-Z]+ed\b/gi;
    const passiveMatches = text.match(passivePattern) || [];
    const passiveVoicePercent = parseFloat(((passiveMatches.length / sentenceCount) * 100).toFixed(1));

    return {
      wordCount,
      charCount,
      sentenceCount,
      avgSentenceLength,
      fleschKincaid,
      readabilityLabel,
      passiveVoicePercent
    };
  }

  function loadInsightsData() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length === 0) return;
      chrome.tabs.sendMessage(
        tabs[0].id,
        { action: 'GSB_GET_PAGE_TEXT' },
        (response) => {
          if (chrome.runtime.lastError) {
            console.log('Content script not ready');
            return;
          }
          if (response && response.pageText) {
            const stats = calculateWritingStats(response.pageText);
            dom.wordCount.textContent = stats.wordCount;
            dom.charCount.textContent = stats.charCount;
            dom.sentenceCount.textContent = stats.sentenceCount;
            dom.avgSentenceLength.textContent = stats.avgSentenceLength;
            dom.fleschGrade.textContent = stats.fleschKincaid;
            dom.readingLevel.textContent = stats.readabilityLabel;
            dom.passiveVoicePercent.textContent = stats.passiveVoicePercent + '%';
          }
        }
      );
    });
  }

  // ============================================================================
  // SETTINGS
  // ============================================================================

  function renderIgnoreList(words) {
    if (words.length === 0) {
      dom.ignoreList.innerHTML = '<span class="empty-state">No ignored words yet</span>';
      return;
    }
    dom.ignoreList.innerHTML = words
      .map(word => `<span class="pill">${word}<button class="pill-remove" data-word="${word}">×</button></span>`)
      .join('');

    dom.ignoreList.querySelectorAll('.pill-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const word = e.target.dataset.word;
        loadSettings((settings) => {
          settings.gsbIgnoredWords = settings.gsbIgnoredWords.filter(w => w !== word);
          saveSettings(settings, () => {
            renderIgnoreList(settings.gsbIgnoredWords);
          });
        });
      });
    });
  }

  function renderDisabledList(sites) {
    if (sites.length === 0) {
      dom.disabledList.innerHTML = '<span class="empty-state">No disabled sites yet</span>';
      return;
    }
    dom.disabledList.innerHTML = sites
      .map(site => `<span class="pill">${site}<button class="pill-remove" data-site="${site}">×</button></span>`)
      .join('');

    dom.disabledList.querySelectorAll('.pill-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const site = e.target.dataset.site;
        loadSettings((settings) => {
          settings.gsbDisabledSites = settings.gsbDisabledSites.filter(s => s !== site);
          saveSettings(settings, () => {
            renderDisabledList(settings.gsbDisabledSites);
          });
        });
      });
    });
  }

  function addIgnoredWord() {
    const input = dom.ignoreInput.value.trim().toLowerCase();
    if (!input) return;

    loadSettings((settings) => {
      if (settings.gsbIgnoredWords.includes(input)) return;
      settings.gsbIgnoredWords.push(input);
      saveSettings(settings, () => {
        dom.ignoreInput.value = '';
        renderIgnoreList(settings.gsbIgnoredWords);
      });
    });
  }

  function addDisabledSite() {
    const input = dom.disabledInput.value.trim().toLowerCase();
    if (!input) return;

    loadSettings((settings) => {
      if (settings.gsbDisabledSites.includes(input)) return;
      settings.gsbDisabledSites.push(input);
      saveSettings(settings, () => {
        dom.disabledInput.value = '';
        renderDisabledList(settings.gsbDisabledSites);
      });
    });
  }

  // ============================================================================
  // DOMAIN DISPLAY
  // ============================================================================

  function displayCurrentDomain() {
    if (!dom.siteDomain) return;
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length === 0) return;
      try {
        const url = new URL(tabs[0].url);
        dom.siteDomain.textContent = url.hostname;
      } catch (e) {
        dom.siteDomain.textContent = 'unknown';
      }
    });
  }

  // ============================================================================
  // EVENT LISTENERS
  // ============================================================================

  function attachEventListeners() {
    // Tab switching
    dom.reviewTab.addEventListener('click', () => switchTab(TAB_REVIEW));
    dom.insightsTab.addEventListener('click', () => switchTab(TAB_INSIGHTS));
    dom.settingsTab.addEventListener('click', () => switchTab(TAB_SETTINGS));

    // Enable toggle (button, not checkbox)
    dom.enableToggle.addEventListener('click', handleToggle);

    // Intensity, underline, auto-fix
    dom.intensitySelect.addEventListener('change', () => {
      saveSettings({ gsbIntensity: dom.intensitySelect.value });
    });

    dom.underlineSelect.addEventListener('change', () => {
      saveSettings({ gsbUnderlineStyle: dom.underlineSelect.value });
    });

    // Auto-fix toggle is also a <button> with .active class
    dom.autoFixToggle.addEventListener('click', () => {
      dom.autoFixToggle.classList.toggle('active');
      const autoFixOn = dom.autoFixToggle.classList.contains('active');
      saveSettings({ gsbAutoFix: autoFixOn });
    });

    // Ignored words
    dom.ignoreAddBtn.addEventListener('click', addIgnoredWord);
    dom.ignoreInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') addIgnoredWord();
    });

    // Disabled sites
    dom.disabledAddBtn.addEventListener('click', addDisabledSite);
    dom.disabledInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') addDisabledSite();
    });
  }

  // ============================================================================
  // STARTUP
  // ============================================================================

  function init() {
    loadSettings((settings) => {
      // Populate controls (toggles are buttons with .active class)
      if (settings.gsbEnabled) dom.enableToggle.classList.add('active');
      else dom.enableToggle.classList.remove('active');
      dom.intensitySelect.value = settings.gsbIntensity;
      dom.underlineSelect.value = settings.gsbUnderlineStyle;
      if (settings.gsbAutoFix) dom.autoFixToggle.classList.add('active');
      else dom.autoFixToggle.classList.remove('active');

      // Render lists
      renderIgnoreList(settings.gsbIgnoredWords);
      renderDisabledList(settings.gsbDisabledSites);

      // Attach listeners
      attachEventListeners();

      // Show initial tab and load data
      switchTab(TAB_REVIEW);
      displayCurrentDomain();
    });
  }

  // Start on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
