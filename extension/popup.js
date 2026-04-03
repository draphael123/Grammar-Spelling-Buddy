/**
 * Grammar & Spelling Buddy — Popup Script
 *
 * Controls the extension popup UI:
 * - Shows issue counts for the active tab
 * - Toggles the extension on/off
 * - Displays the current domain
 * - Calculates and displays writing statistics
 */

(function () {
  "use strict";

  const enableToggle = document.getElementById("enableToggle");
  const spellingCount = document.getElementById("spellingCount");
  const grammarCount = document.getElementById("grammarCount");
  const statusText = document.getElementById("statusText");
  const siteDomain = document.getElementById("siteDomain");
  const statsArea = document.getElementById("statsArea");
  const noIssues = document.getElementById("noIssues");
  const wordCountEl = document.getElementById("wordCount");
  const charCountEl = document.getElementById("charCount");
  const sentenceCountEl = document.getElementById("sentenceCount");
  const avgSentenceLengthEl = document.getElementById("avgSentenceLength");
  const readingLevelEl = document.getElementById("readingLevel");
  const fleschGradeEl = document.getElementById("fleschGrade");
  const passiveVoicePercentEl = document.getElementById("passiveVoicePercent");

  // Tab switching
  const issuesTab = document.getElementById("issuesTab");
  const statsTab = document.getElementById("statsTab");
  const issuesContent = document.getElementById("issuesContent");
  const statsContent = document.getElementById("statsContent");

  function switchTab(tabName) {
    if (tabName === "issues") {
      issuesTab.classList.add("active");
      statsTab.classList.remove("active");
      issuesContent.style.display = "block";
      statsContent.style.display = "none";
    } else if (tabName === "stats") {
      statsTab.classList.add("active");
      issuesTab.classList.remove("active");
      issuesContent.style.display = "none";
      statsContent.style.display = "block";
    }
  }

  issuesTab.addEventListener("click", () => switchTab("issues"));
  statsTab.addEventListener("click", () => switchTab("stats"));

  // ─── Writing Stats Functions ────────────────────────────────

  /**
   * Count vowel groups in a word (approximation of syllables)
   */
  function countSyllables(word) {
    const lower = word.toLowerCase();
    let count = 0;
    let previousWasVowel = false;

    for (let i = 0; i < lower.length; i++) {
      const char = lower[i];
      const isVowel = /[aeiou]/.test(char);

      if (isVowel && !previousWasVowel) {
        count++;
      }
      previousWasVowel = isVowel;
    }

    // Adjust for silent e
    if (lower.endsWith("e")) count--;

    return Math.max(1, count);
  }

  /**
   * Calculate writing statistics from text
   */
  function calculateWritingStats(text) {
    if (!text || text.trim().length === 0) {
      return {
        wordCount: 0,
        charCount: 0,
        sentenceCount: 0,
        avgSentenceLength: 0,
        fleschKincaid: 0,
        readabilityLabel: "—",
        passiveVoicePercent: 0,
        totalSyllables: 0,
      };
    }

    // Character count (excluding whitespace)
    const charCount = text.replace(/\s/g, "").length;

    // Word count
    const words = text.match(/[a-zA-Z''-]+/g) || [];
    const wordCount = words.length;

    // Sentence count (periods, exclamation, question marks)
    const sentences = text.match(/[.!?]+/g) || [];
    const sentenceCount = Math.max(1, sentences.length);

    // Average sentence length
    const avgSentenceLength = wordCount > 0 ? (wordCount / sentenceCount).toFixed(1) : 0;

    // Syllable count
    let totalSyllables = 0;
    for (const word of words) {
      totalSyllables += countSyllables(word);
    }

    // Flesch-Kincaid Grade Level
    // Formula: 0.39 * (words/sentences) + 11.8 * (syllables/words) - 15.59
    let fleschKincaid = 0;
    if (wordCount > 0) {
      fleschKincaid =
        0.39 * (wordCount / sentenceCount) +
        11.8 * (totalSyllables / wordCount) -
        15.59;
      fleschKincaid = Math.max(0, fleschKincaid.toFixed(1));
    }

    // Readability label based on grade level
    let readabilityLabel = "—";
    if (fleschKincaid < 6) {
      readabilityLabel = "Easy";
    } else if (fleschKincaid < 10) {
      readabilityLabel = "Standard";
    } else if (fleschKincaid < 14) {
      readabilityLabel = "Advanced";
    } else {
      readabilityLabel = "Expert";
    }

    // Passive voice detection
    // Simple pattern: detect "was/were/is/are/been + past participle"
    const passivePattern = /\b(was|were|is|are|been|be)\s+[a-zA-Z]+ed\b/gi;
    const passiveMatches = text.match(passivePattern) || [];
    const passiveVoicePercent =
      sentenceCount > 0
        ? ((passiveMatches.length / sentenceCount) * 100).toFixed(1)
        : 0;

    return {
      wordCount,
      charCount,
      sentenceCount,
      avgSentenceLength,
      fleschKincaid,
      readabilityLabel,
      passiveVoicePercent,
      totalSyllables,
    };
  }

  /**
   * Update writing stats display
   */
  function updateWritingStats(text) {
    const stats = calculateWritingStats(text);

    wordCountEl.textContent = stats.wordCount;
    charCountEl.textContent = stats.charCount;
    sentenceCountEl.textContent = stats.sentenceCount;
    avgSentenceLengthEl.textContent = stats.avgSentenceLength;
    fleschGradeEl.textContent = stats.fleschKincaid !== 0 ? stats.fleschKincaid : "—";

    // Update reading level badge
    const badgeClass =
      stats.readabilityLabel === "Easy"
        ? "easy"
        : stats.readabilityLabel === "Standard"
          ? "standard"
          : stats.readabilityLabel === "Advanced"
            ? "advanced"
            : "expert";
    readingLevelEl.innerHTML = `<span class="readability-badge ${badgeClass}">${stats.readabilityLabel}</span>`;

    passiveVoicePercentEl.textContent = `${stats.passiveVoicePercent}%`;
  }

  // Get current tab info
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab) return;

    // Show domain
    try {
      const url = new URL(tab.url);
      siteDomain.textContent = url.hostname;
    } catch (e) {
      siteDomain.textContent = "this page";
    }

    // Request status from content script
    chrome.tabs.sendMessage(tab.id, { type: "GSB_GET_STATUS" }, (response) => {
      if (chrome.runtime.lastError || !response) {
        statusText.textContent = "Not active";
        statusText.style.color = "#94A3B8";
        updateWritingStats("");
        return;
      }

      enableToggle.checked = response.enabled;

      if (response.issueCount === 0) {
        statsArea.classList.remove("active");
        noIssues.classList.add("active");
        statusText.textContent = "All clear!";
        statusText.style.color = "#10B981";
      } else {
        statsArea.classList.add("active");
        noIssues.classList.remove("active");
        statusText.textContent = `${response.issueCount} issue${response.issueCount !== 1 ? "s" : ""} found`;
        statusText.style.color = "#F59E0B";
      }

      // Update writing stats with page text
      if (response.pageText) {
        updateWritingStats(response.pageText);
      }
    });
  });

  // Load saved state
  chrome.storage.sync.get(["gsbEnabled"], (data) => {
    if (data.gsbEnabled === false) {
      enableToggle.checked = false;
    }
  });

  // Toggle handler
  enableToggle.addEventListener("change", () => {
    const enabled = enableToggle.checked;

    chrome.storage.sync.set({ gsbEnabled: enabled });

    // Notify content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: "GSB_TOGGLE",
          enabled: enabled,
        });
      }
    });
  });

  // Listen for issue count updates from content script
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "GSB_ISSUE_COUNT") {
      const count = msg.count || 0;
      if (count === 0) {
        statsArea.classList.remove("active");
        noIssues.classList.add("active");
        statusText.textContent = "All clear!";
        statusText.style.color = "#10B981";
      } else {
        statsArea.classList.add("active");
        noIssues.classList.remove("active");
        statusText.textContent = `${count} issue${count !== 1 ? "s" : ""} found`;
        statusText.style.color = "#F59E0B";
        // Update individual counts based on message data
        if (msg.spellingCount !== undefined) spellingCount.textContent = msg.spellingCount;
        if (msg.grammarCount !== undefined) grammarCount.textContent = msg.grammarCount;
      }
    }
  });
})();
