(function() {
  'use strict';

  // ============================================================================
  // CONSTANTS
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

  // ============================================================================
  // DOM REFERENCES — with null-safety
  // ============================================================================

  function $(id) { return document.getElementById(id); }
  function $q(sel) { return document.querySelector(sel); }

  const dom = {};

  function cacheDom() {
    dom.reviewTab = $q('[data-tab="review"]');
    dom.insightsTab = $q('[data-tab="insights"]');
    dom.settingsTab = $q('[data-tab="settings"]');
    dom.reviewContent = $('review-tab');
    dom.insightsContent = $('insights-tab');
    dom.settingsContent = $('settings-tab');
    dom.enableToggle = $('headerToggle');
    dom.statsArea = $('issueList');
    dom.noIssues = $('celebrationContainer');
    dom.spellingCount = $('spellingCount');
    dom.grammarCount = $('grammarCount');
    dom.statusText = $('statusCount');
    dom.wordCount = $('wordCount');
    dom.charCount = $('charCount');
    dom.sentenceCount = $('sentenceCount');
    dom.avgSentenceLength = $('avgSentenceLength');
    dom.readingLevel = $('readingLevelBadge');
    dom.fleschGrade = $('fleschKincaid');
    dom.passiveVoicePercent = $('passiveVoice');
    dom.intensitySelect = $('checkingIntensity');
    dom.underlineSelect = $('underlineStyle');
    dom.autoFixToggle = $('autoFixToggle');
    dom.ignoreInput = $('ignoredWordInput');
    dom.ignoreAddBtn = $('addIgnoredWordButton');
    dom.ignoreList = $('ignoredWordsList');
    dom.disabledInput = $('disabledSiteInput');
    dom.disabledAddBtn = $('addDisabledSiteButton');
    dom.disabledList = $('disabledSitesList');
    dom.siteDomain = $('siteDomain');
  }

  // ============================================================================
  // STORAGE HELPERS
  // ============================================================================

  function loadSettings(callback) {
    try {
      chrome.storage.sync.get(DEFAULT_SETTINGS, function(settings) {
        try {
          callback(settings || DEFAULT_SETTINGS);
        } catch (e) {
          console.error('GSB popup: settings callback error:', e);
          callback(DEFAULT_SETTINGS);
        }
      });
    } catch (e) {
      console.error('GSB popup: storage.sync.get error:', e);
      callback(DEFAULT_SETTINGS);
    }
  }

  function saveSettings(data, callback) {
    try {
      chrome.storage.sync.set(data, callback || function() {});
    } catch (e) {
      console.error('GSB popup: storage.sync.set error:', e);
    }
  }

  // ============================================================================
  // TAB SWITCHING
  // ============================================================================

  function switchTab(tabName) {
    // Deactivate all tab buttons
    document.querySelectorAll('.tab-button[data-tab]').forEach(function(tab) {
      tab.classList.remove('active');
    });
    // Hide all tab content panels
    document.querySelectorAll('.tab-content').forEach(function(content) {
      content.classList.remove('active');
      content.style.display = 'none';
    });

    // Activate the clicked tab button
    var tabBtn = $q('[data-tab="' + tabName + '"]');
    if (tabBtn) tabBtn.classList.add('active');

    // Show the target content panel
    var contentEl = $(tabName + '-tab');
    if (contentEl) {
      contentEl.classList.add('active');
      contentEl.style.display = 'block';
    }

    // Load data for the tab
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
    if (!dom.enableToggle) return;
    dom.enableToggle.classList.toggle('active');
    var enabled = dom.enableToggle.classList.contains('active');
    saveSettings({ gsbEnabled: enabled }, function() {
      try {
        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
          if (!tabs || tabs.length === 0) return;
          chrome.tabs.sendMessage(
            tabs[0].id,
            { action: 'GSB_TOGGLE', type: 'GSB_TOGGLE', enabled: enabled },
            function() {
              if (chrome.runtime.lastError) {
                // Content script not ready — that's okay
              }
            }
          );
        });
      } catch (e) {
        console.error('GSB popup: toggle message error:', e);
      }
    });
  }

  // ============================================================================
  // REVIEW TAB
  // ============================================================================

  function requestReviewStatus() {
    try {
      chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        if (!tabs || tabs.length === 0) return;
        chrome.tabs.sendMessage(
          tabs[0].id,
          { action: 'GSB_GET_STATUS' },
          function(response) {
            if (chrome.runtime.lastError) return;
            if (response && typeof response.issueCount === 'number') {
              updateReviewStats(response.issueCount, response.spelling || 0, response.grammar || 0);
            }
          }
        );
      });
    } catch (e) {
      console.error('GSB popup: requestReviewStatus error:', e);
    }
  }

  function updateReviewStats(total, spelling, grammar) {
    if (total === 0) {
      if (dom.statsArea) dom.statsArea.style.display = 'none';
      if (dom.noIssues) dom.noIssues.style.display = 'flex';
    } else {
      if (dom.statsArea) dom.statsArea.style.display = 'block';
      if (dom.noIssues) dom.noIssues.style.display = 'none';
      if (dom.spellingCount) dom.spellingCount.textContent = spelling;
      if (dom.grammarCount) dom.grammarCount.textContent = grammar;
      if (dom.statusText) dom.statusText.textContent = total;
    }
  }

  // Listen for real-time issue count updates from content script
  try {
    chrome.runtime.onMessage.addListener(function(request) {
      var action = request.action || request.type;
      if (action === 'GSB_ISSUE_COUNT') {
        updateReviewStats(
          request.issueCount || request.count || 0,
          request.spelling || request.spellingCount || 0,
          request.grammar || request.grammarCount || 0
        );
      }
    });
  } catch (e) {
    console.error('GSB popup: onMessage listener error:', e);
  }

  // ============================================================================
  // INSIGHTS TAB
  // ============================================================================

  function countSyllables(word) {
    word = word.toLowerCase();
    var count = 0;
    var previousWasVowel = false;
    for (var i = 0; i < word.length; i++) {
      var isVowel = /[aeiouy]/.test(word[i]);
      if (isVowel && !previousWasVowel) count++;
      previousWasVowel = isVowel;
    }
    if (word.endsWith('e')) count--;
    return Math.max(1, count);
  }

  function calculateWritingStats(text) {
    if (!text || text.trim().length === 0) {
      return { wordCount: 0, charCount: 0, sentenceCount: 0, avgSentenceLength: 0, fleschKincaid: 0, readabilityLabel: 'N/A', passiveVoicePercent: 0 };
    }
    var words = text.trim().split(/\s+/).filter(function(w) { return w.length > 0; });
    var wordCount = words.length;
    var charCount = text.replace(/\s/g, '').length;
    var sentences = text.split(/[.!?]+/).filter(function(s) { return s.trim().length > 0; });
    var sentenceCount = Math.max(1, sentences.length);
    var totalSyllables = 0;
    words.forEach(function(word) { totalSyllables += countSyllables(word); });
    var avgSentenceLength = parseFloat((wordCount / sentenceCount).toFixed(2));
    var fk = 0.39 * (wordCount / sentenceCount) + 11.8 * (totalSyllables / Math.max(1, wordCount)) - 15.59;
    var fleschKincaid = parseFloat(Math.max(0, fk).toFixed(1));
    var readabilityLabel = 'Expert';
    if (fleschKincaid < 6) readabilityLabel = 'Easy';
    else if (fleschKincaid < 10) readabilityLabel = 'Standard';
    else if (fleschKincaid < 14) readabilityLabel = 'Advanced';
    var passivePattern = /\b(was|were|is|are|been|be)\s+[a-zA-Z]+ed\b/gi;
    var passiveMatches = text.match(passivePattern) || [];
    var passiveVoicePercent = parseFloat(((passiveMatches.length / sentenceCount) * 100).toFixed(1));
    return { wordCount: wordCount, charCount: charCount, sentenceCount: sentenceCount, avgSentenceLength: avgSentenceLength, fleschKincaid: fleschKincaid, readabilityLabel: readabilityLabel, passiveVoicePercent: passiveVoicePercent };
  }

  function loadInsightsData() {
    try {
      chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        if (!tabs || tabs.length === 0) return;
        chrome.tabs.sendMessage(tabs[0].id, { action: 'GSB_GET_PAGE_TEXT' }, function(response) {
          if (chrome.runtime.lastError) return;
          if (response && response.pageText) {
            var stats = calculateWritingStats(response.pageText);
            if (dom.wordCount) dom.wordCount.textContent = stats.wordCount;
            if (dom.charCount) dom.charCount.textContent = stats.charCount;
            if (dom.sentenceCount) dom.sentenceCount.textContent = stats.sentenceCount;
            if (dom.avgSentenceLength) dom.avgSentenceLength.textContent = stats.avgSentenceLength;
            if (dom.fleschGrade) dom.fleschGrade.textContent = stats.fleschKincaid;
            if (dom.readingLevel) dom.readingLevel.textContent = stats.readabilityLabel;
            if (dom.passiveVoicePercent) dom.passiveVoicePercent.textContent = stats.passiveVoicePercent + '%';
          }
        });
      });
    } catch (e) {
      console.error('GSB popup: loadInsightsData error:', e);
    }
  }

  // ============================================================================
  // SETTINGS — IGNORED WORDS & DISABLED SITES
  // ============================================================================

  function renderIgnoreList(words) {
    if (!dom.ignoreList) return;
    if (!words || words.length === 0) {
      dom.ignoreList.innerHTML = '<span class="empty-state">No ignored words yet</span>';
      return;
    }
    dom.ignoreList.innerHTML = words
      .map(function(word) { return '<span class="pill">' + word + '<button class="pill-remove" data-word="' + word + '">\u00d7</button></span>'; })
      .join('');
    dom.ignoreList.querySelectorAll('.pill-remove').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        var word = e.target.dataset.word;
        loadSettings(function(settings) {
          settings.gsbIgnoredWords = (settings.gsbIgnoredWords || []).filter(function(w) { return w !== word; });
          saveSettings(settings, function() { renderIgnoreList(settings.gsbIgnoredWords); });
        });
      });
    });
  }

  function renderDisabledList(sites) {
    if (!dom.disabledList) return;
    if (!sites || sites.length === 0) {
      dom.disabledList.innerHTML = '<span class="empty-state">No disabled sites yet</span>';
      return;
    }
    dom.disabledList.innerHTML = sites
      .map(function(site) { return '<span class="pill">' + site + '<button class="pill-remove" data-site="' + site + '">\u00d7</button></span>'; })
      .join('');
    dom.disabledList.querySelectorAll('.pill-remove').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        var site = e.target.dataset.site;
        loadSettings(function(settings) {
          settings.gsbDisabledSites = (settings.gsbDisabledSites || []).filter(function(s) { return s !== site; });
          saveSettings(settings, function() { renderDisabledList(settings.gsbDisabledSites); });
        });
      });
    });
  }

  function addIgnoredWord() {
    if (!dom.ignoreInput) return;
    var input = dom.ignoreInput.value.trim().toLowerCase();
    if (!input) return;
    loadSettings(function(settings) {
      var list = settings.gsbIgnoredWords || [];
      if (list.indexOf(input) !== -1) return;
      list.push(input);
      saveSettings({ gsbIgnoredWords: list }, function() {
        dom.ignoreInput.value = '';
        renderIgnoreList(list);
      });
    });
  }

  function addDisabledSite() {
    if (!dom.disabledInput) return;
    var input = dom.disabledInput.value.trim().toLowerCase();
    if (!input) return;
    loadSettings(function(settings) {
      var list = settings.gsbDisabledSites || [];
      if (list.indexOf(input) !== -1) return;
      list.push(input);
      saveSettings({ gsbDisabledSites: list }, function() {
        dom.disabledInput.value = '';
        renderDisabledList(list);
      });
    });
  }

  // ============================================================================
  // DOMAIN DISPLAY
  // ============================================================================

  function displayCurrentDomain() {
    if (!dom.siteDomain) return;
    try {
      chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        if (!tabs || tabs.length === 0) return;
        try {
          var url = new URL(tabs[0].url);
          dom.siteDomain.textContent = url.hostname;
        } catch (e) {
          dom.siteDomain.textContent = 'unknown';
        }
      });
    } catch (e) {
      dom.siteDomain.textContent = '';
    }
  }

  // ============================================================================
  // EVENT LISTENERS — attached IMMEDIATELY, not inside storage callback
  // ============================================================================

  function attachEventListeners() {
    // Tab switching — use event delegation on the tab bar
    var tabBar = $q('.tab-bar');
    if (tabBar) {
      tabBar.addEventListener('click', function(e) {
        var btn = e.target.closest('[data-tab]');
        if (btn) {
          var tabName = btn.getAttribute('data-tab');
          switchTab(tabName);
        }
      });
    }

    // Enable/disable toggle
    if (dom.enableToggle) {
      dom.enableToggle.addEventListener('click', handleToggle);
    }

    // Intensity select
    if (dom.intensitySelect) {
      dom.intensitySelect.addEventListener('change', function() {
        saveSettings({ gsbIntensity: dom.intensitySelect.value });
      });
    }

    // Underline style select
    if (dom.underlineSelect) {
      dom.underlineSelect.addEventListener('change', function() {
        saveSettings({ gsbUnderlineStyle: dom.underlineSelect.value });
      });
    }

    // Auto-fix toggle (button with .active class)
    if (dom.autoFixToggle) {
      dom.autoFixToggle.addEventListener('click', function() {
        dom.autoFixToggle.classList.toggle('active');
        var autoFixOn = dom.autoFixToggle.classList.contains('active');
        saveSettings({ gsbAutoFix: autoFixOn });
      });
    }

    // Ignored words — add button + Enter key
    if (dom.ignoreAddBtn) {
      dom.ignoreAddBtn.addEventListener('click', addIgnoredWord);
    }
    if (dom.ignoreInput) {
      dom.ignoreInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') addIgnoredWord();
      });
    }

    // Disabled sites — add button + Enter key
    if (dom.disabledAddBtn) {
      dom.disabledAddBtn.addEventListener('click', addDisabledSite);
    }
    if (dom.disabledInput) {
      dom.disabledInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') addDisabledSite();
      });
    }
  }

  // ============================================================================
  // STARTUP — two-phase: listeners first, then async settings load
  // ============================================================================

  function init() {
    // Phase 1: Cache DOM refs and wire up event listeners IMMEDIATELY
    cacheDom();
    attachEventListeners();

    // Phase 2: Load settings asynchronously and populate UI state
    loadSettings(function(settings) {
      try {
        // Toggle state
        if (dom.enableToggle) {
          if (settings.gsbEnabled) dom.enableToggle.classList.add('active');
          else dom.enableToggle.classList.remove('active');
        }

        // Selects
        if (dom.intensitySelect) dom.intensitySelect.value = settings.gsbIntensity || 'standard';
        if (dom.underlineSelect) dom.underlineSelect.value = settings.gsbUnderlineStyle || 'wavy';

        // Auto-fix toggle
        if (dom.autoFixToggle) {
          if (settings.gsbAutoFix) dom.autoFixToggle.classList.add('active');
          else dom.autoFixToggle.classList.remove('active');
        }

        // Render lists
        renderIgnoreList(settings.gsbIgnoredWords || []);
        renderDisabledList(settings.gsbDisabledSites || []);
      } catch (e) {
        console.error('GSB popup: error populating settings UI:', e);
      }
    });

    // Phase 3: Show default tab and domain
    switchTab(TAB_REVIEW);
    displayCurrentDomain();
  }

  // ============================================================================
  // BOOT
  // ============================================================================

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
