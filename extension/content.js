/**
 * Grammar & Spelling Buddy — Content Script
 *
 * Monitors all text inputs, textareas, and contenteditable elements.
 * Runs local spell-checking against the dictionary and grammar rules
 * engine, and renders inline underlines + tooltip suggestions.
 */

(function () {
  "use strict";

  // ─── State ──────────────────────────────────────────────
  const state = {
    enabled: true,
    disabledSites: [],
    activeTooltip: null,
    debounceTimers: new WeakMap(),
    checkedElements: new WeakSet(),
    issueMap: new WeakMap(), // element → issues[]
    currentAdapter: null, // Active site adapter
  };

  // Load disabled sites from storage
  if (typeof chrome !== "undefined" && chrome.storage) {
    chrome.storage.sync.get(["gsbEnabled", "gsbDisabledSites"], (data) => {
      if (data.gsbEnabled === false) state.enabled = false;
      if (data.gsbDisabledSites) state.disabledSites = data.gsbDisabledSites;
    });

    // Listen for storage changes (keeps state in sync with popup/background)
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "sync") return;
      if (changes.gsbEnabled) {
        state.enabled = changes.gsbEnabled.newValue !== false;
        if (!state.enabled) {
          document.querySelectorAll(".gsb-badge").forEach((b) => b.remove());
          removeTooltip();
        } else {
          scanForTextFields();
        }
      }
      if (changes.gsbDisabledSites) {
        state.disabledSites = changes.gsbDisabledSites.newValue || [];
      }
    });
  }

  // ─── Utility ────────────────────────────────────────────

  function isDisabledSite() {
    return state.disabledSites.some((s) => location.hostname.includes(s));
  }

  function extractWords(text) {
    // Split on whitespace and punctuation, keeping apostrophes in contractions
    return text.match(/[a-zA-Z''-]+/g) || [];
  }

  function isLikelyProperNoun(word, index, text) {
    // If it's the first character in the text, we can't be sure
    if (index === 0) return false;
    // Check if this word starts with uppercase
    if (word[0] !== word[0].toUpperCase() || word[0] === word[0].toLowerCase()) {
      return false;
    }
    // Look back further to find sentence terminators
    const textBefore = text.substring(Math.max(0, index - 10), index);
    // If preceded by a sentence terminator + optional whitespace, it's a new sentence, not a proper noun
    if (/[.!?]\s*$/.test(textBefore)) return false;
    // If preceded by a newline, treat as start of sentence
    if (/\n\s*$/.test(textBefore)) return false;
    // Otherwise, mid-sentence capitalization = likely proper noun
    return true;
  }

  function levenshtein(a, b) {
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
        );
      }
    }
    return dp[m][n];
  }

  function findClosestWord(word) {
    const lower = word.toLowerCase();

    // Check known misspellings first
    if (GSB_MISSPELLINGS[lower]) return GSB_MISSPELLINGS[lower];

    // Simple Levenshtein-based suggestion (check against a small subset for perf)
    let best = null;
    let bestDist = Infinity;

    // Only search words of similar length for performance
    for (const dictWord of GSB_DICTIONARY) {
      if (Math.abs(dictWord.length - lower.length) > 2) continue;
      const dist = levenshtein(lower, dictWord);
      if (dist < bestDist && dist <= 2) {
        bestDist = dist;
        best = dictWord;
      }
    }

    return best;
  }

  // ─── Spell Check ────────────────────────────────────────

  function checkSpelling(text) {
    const issues = [];
    const wordRegex = /[a-zA-Z''-]+/g;
    let match;

    while ((match = wordRegex.exec(text)) !== null) {
      const word = match[0];
      const lower = word.toLowerCase();

      // Skip very short words (1-2 chars), numbers, etc.
      if (word.length <= 2) continue;

      // Skip words with apostrophes that might be contractions
      if (word.includes("'") || word.includes("\u2019")) {
        const normalized = word.replace(/[\u2019']/g, "'").toLowerCase();
        if (GSB_DICTIONARY.has(normalized)) continue;
      }

      // Skip if it's in the dictionary
      if (GSB_DICTIONARY.has(lower)) continue;

      // Skip likely proper nouns (capitalized mid-sentence)
      if (isLikelyProperNoun(word, match.index, text)) continue;

      // Skip ALL-CAPS words (likely acronyms)
      if (word === word.toUpperCase() && word.length >= 2) continue;

      // Skip words with numbers
      if (/\d/.test(word)) continue;

      // It's a potential misspelling — find suggestion
      const suggestion = findClosestWord(word);

      issues.push({
        start: match.index,
        end: match.index + word.length,
        original: word,
        message: suggestion
          ? `"${word}" → Did you mean "${suggestion}"?`
          : `"${word}" may be misspelled`,
        suggestion: suggestion || null,
        type: "spelling",
        ruleId: "spelling",
      });
    }

    return issues;
  }

  // ─── Full Check (Spelling + Grammar) ────────────────────

  function fullCheck(text) {
    const spellingIssues = checkSpelling(text);
    const grammarIssues = gsbCheckGrammar(text);

    // Merge and sort by position, removing overlaps
    const all = [...spellingIssues, ...grammarIssues].sort(
      (a, b) => a.start - b.start
    );

    // Remove overlapping issues (keep the first one)
    const filtered = [];
    let lastEnd = -1;
    for (const issue of all) {
      if (issue.start >= lastEnd) {
        filtered.push(issue);
        lastEnd = issue.end;
      }
    }

    return filtered;
  }

  // ─── Tooltip ────────────────────────────────────────────

  function showTooltip(issue, rect, element) {
    removeTooltip();

    const tip = document.createElement("div");
    tip.className = "gsb-tooltip";
    tip.setAttribute("role", "tooltip");
    tip.setAttribute("aria-live", "polite");
    tip.innerHTML = `
      <div class="gsb-tooltip-type ${issue.type}">${issue.type}</div>
      <div class="gsb-tooltip-message">${escapeHtml(issue.message)}</div>
      <div>
        ${
          issue.suggestion
            ? `<button class="gsb-tooltip-suggestion" data-action="fix">Apply: ${escapeHtml(issue.suggestion)}</button>`
            : ""
        }
        <button class="gsb-tooltip-dismiss" data-action="dismiss">Ignore</button>
      </div>
    `;

    // Position above the word
    tip.style.left = rect.left + "px";
    tip.style.top = rect.top - 80 + "px";

    document.body.appendChild(tip);
    state.activeTooltip = tip;

    // Adjust if off-screen
    const tipRect = tip.getBoundingClientRect();
    if (tipRect.top < 0) {
      tip.style.top = rect.bottom + 8 + "px";
      tip.classList.add("below");
    }
    if (tipRect.right > window.innerWidth) {
      tip.style.left = window.innerWidth - tipRect.width - 8 + "px";
    }
    if (tipRect.left < 0) {
      tip.style.left = "8px";
    }

    // Handle clicks
    tip.addEventListener("click", (e) => {
      const action = e.target.dataset.action;
      if (action === "fix" && issue.suggestion) {
        applyFix(element, issue);
        removeTooltip();
      } else if (action === "dismiss") {
        removeTooltip();
      }
    });
  }

  function removeTooltip() {
    if (state.activeTooltip) {
      state.activeTooltip.remove();
      state.activeTooltip = null;
    }
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // ─── Apply Fix ──────────────────────────────────────────

  function applyFix(element, issue) {
    if (
      element.tagName === "TEXTAREA" ||
      element.tagName === "INPUT"
    ) {
      const text = element.value;
      element.value =
        text.substring(0, issue.start) +
        issue.suggestion +
        text.substring(issue.end);

      // Trigger input event so frameworks detect the change
      element.dispatchEvent(new Event("input", { bubbles: true }));
    } else if (element.isContentEditable) {
      // For contenteditable, use Range-based replacement to preserve HTML structure
      try {
        const sel = window.getSelection();
        const textContent = element.innerText;

        // Walk text nodes to find the correct node and offset for the issue
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        let charCount = 0;
        let startNode = null, startOffset = 0;
        let endNode = null, endOffset = 0;

        while (walker.nextNode()) {
          const node = walker.currentNode;
          const nodeLen = node.textContent.length;

          if (!startNode && charCount + nodeLen > issue.start) {
            startNode = node;
            startOffset = issue.start - charCount;
          }
          if (!endNode && charCount + nodeLen >= issue.end) {
            endNode = node;
            endOffset = issue.end - charCount;
            break;
          }
          charCount += nodeLen;
        }

        if (startNode && endNode) {
          const range = document.createRange();
          range.setStart(startNode, startOffset);
          range.setEnd(endNode, endOffset);
          range.deleteContents();
          range.insertNode(document.createTextNode(issue.suggestion));

          // Collapse cursor to end of inserted text
          sel.removeAllRanges();
          const newRange = document.createRange();
          newRange.setStartAfter(range.endContainer);
          newRange.collapse(true);
          sel.addRange(newRange);

          element.dispatchEvent(new Event("input", { bubbles: true }));
        }
      } catch (e) {
        // Fallback: simple text replacement (loses formatting but still works)
        const text = element.innerText;
        element.innerText =
          text.substring(0, issue.start) +
          issue.suggestion +
          text.substring(issue.end);
        element.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }

    // Re-check after fix
    scheduleCheck(element);
  }

  // ─── Rendering: Textarea / Input ────────────────────────
  // For textarea/input, we show a small badge and rely on click
  // positioning to show tooltips near the cursor.

  function renderBadge(element, issues) {
    // Remove existing badge
    const existing = element.parentElement?.querySelector(".gsb-badge");
    if (existing) existing.remove();

    if (!element.parentElement) return;

    // Make parent relative if it isn't already
    const parentPos = getComputedStyle(element.parentElement).position;
    if (parentPos === "static") {
      element.parentElement.style.position = "relative";
    }

    const badge = document.createElement("div");
    badge.className = "gsb-badge" + (issues.length === 0 ? " clean" : "");
    badge.textContent =
      issues.length === 0 ? "✓" : `${issues.length} issue${issues.length > 1 ? "s" : ""}`;

    element.parentElement.appendChild(badge);
  }

  // ─── Rendering: ContentEditable ─────────────────────────
  // For contenteditable, we can wrap error words in spans.
  // This is a simplified approach — a production version would
  // use a virtual overlay to avoid disrupting the DOM.

  function renderContentEditableIssues(element, issues) {
    // We'll use a click-based approach instead of wrapping spans
    // to avoid disrupting the user's editing experience.
    // Store issues on the element and handle via click events.
    state.issueMap.set(element, issues);
  }

  // ─── Click Handler for Issues ───────────────────────────

  function handleElementClick(e) {
    const element = e.target;

    // For textarea / input
    if (element.tagName === "TEXTAREA" || element.tagName === "INPUT") {
      const issues = state.issueMap.get(element);
      if (!issues || issues.length === 0) return;

      const cursorPos = element.selectionStart;
      const clickedIssue = issues.find(
        (i) => cursorPos >= i.start && cursorPos <= i.end
      );

      if (clickedIssue) {
        // Get approximate position of cursor
        const rect = element.getBoundingClientRect();
        showTooltip(clickedIssue, rect, element);
      }
      return;
    }

    // For contenteditable
    if (element.isContentEditable || element.closest("[contenteditable]")) {
      const editableEl = element.closest("[contenteditable]") || element;
      const issues = state.issueMap.get(editableEl);
      if (!issues || issues.length === 0) return;

      // Get cursor position within text
      const sel = window.getSelection();
      if (!sel.rangeCount) return;

      const range = sel.getRangeAt(0);
      const preRange = document.createRange();
      preRange.selectNodeContents(editableEl);
      preRange.setEnd(range.startContainer, range.startOffset);
      const cursorPos = preRange.toString().length;

      const clickedIssue = issues.find(
        (i) => cursorPos >= i.start && cursorPos <= i.end
      );

      if (clickedIssue) {
        const rect = range.getBoundingClientRect();
        showTooltip(clickedIssue, rect, editableEl);
      }
    }
  }

  // ─── Check Scheduler ───────────────────────────────────

  function scheduleCheck(element) {
    if (!state.enabled || isDisabledSite()) return;

    // Debounce — wait 500ms after last keystroke
    const existing = state.debounceTimers.get(element);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      runCheck(element);
    }, 500);

    state.debounceTimers.set(element, timer);
  }

  function runCheck(element) {
    let text = "";

    if (element.tagName === "TEXTAREA" || element.tagName === "INPUT") {
      text = element.value;
    } else if (element.isContentEditable) {
      text = element.innerText;
    }

    if (!text || text.trim().length < 3) {
      state.issueMap.set(element, []);
      renderBadge(element, []);
      return;
    }

    const issues = fullCheck(text);
    state.issueMap.set(element, issues);

    // Render badge for textarea/input
    if (element.tagName === "TEXTAREA" || element.tagName === "INPUT") {
      renderBadge(element, issues);
    } else {
      renderContentEditableIssues(element, issues);
    }

    // Notify extension popup and background of issue count
    if (typeof chrome !== "undefined" && chrome.runtime) {
      try {
        const spellingIssueCount = issues.filter((i) => i.type === "spelling").length;
        const grammarIssueCount = issues.filter((i) => i.type !== "spelling").length;
        chrome.runtime.sendMessage({
          type: "GSB_ISSUE_COUNT",
          count: issues.length,
          spellingCount: spellingIssueCount,
          grammarCount: grammarIssueCount,
          url: location.href,
        });
      } catch (e) {
        // Extension context may have been invalidated — that's fine
      }
    }

    // Dispatch event for sidebar to listen to
    try {
      document.dispatchEvent(new CustomEvent("gsb-issues-updated", {
        detail: { issues, element },
      }));
    } catch (e) {
      // Fallback for environments that don't support CustomEvent
    }
  }

  // ─── Event Listeners ───────────────────────────────────

  function attachListeners(element) {
    if (state.checkedElements.has(element)) return;
    state.checkedElements.add(element);

    element.addEventListener("input", () => scheduleCheck(element));
    element.addEventListener("focus", () => scheduleCheck(element));
    element.addEventListener("click", handleElementClick);

    // Run initial check if there's existing text
    if (
      (element.value && element.value.trim().length > 0) ||
      (element.innerText && element.innerText.trim().length > 0)
    ) {
      scheduleCheck(element);
    }
  }

  // ─── DOM Scanner ────────────────────────────────────────

  function scanForTextFields() {
    if (!state.enabled || isDisabledSite()) return;

    // Get site-specific adapter if available
    state.currentAdapter = window.getAdapterForSite ? window.getAdapterForSite() : null;

    // If adapter is available, use its selectors
    if (state.currentAdapter) {
      state.currentAdapter.selectors.forEach((selector) => {
        document.querySelectorAll(selector).forEach((element) => {
          if (state.currentAdapter.shouldAttach(element)) {
            attachListeners(element);
          }
        });
      });
    }

    // Always scan for standard text inputs as fallback
    // Textareas
    document.querySelectorAll("textarea").forEach(attachListeners);

    // Text inputs (not buttons, checkboxes, etc.)
    document
      .querySelectorAll('input[type="text"], input[type="email"], input[type="search"], input:not([type])')
      .forEach(attachListeners);

    // Contenteditable elements (without adapter)
    // Only if no adapter is active to avoid duplicates
    if (!state.currentAdapter) {
      document
        .querySelectorAll('[contenteditable="true"], [contenteditable=""]')
        .forEach(attachListeners);
    }
  }

  // ─── MutationObserver (for SPAs) ────────────────────────

  const observer = new MutationObserver((mutations) => {
    let shouldScan = false;
    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0) {
        shouldScan = true;
        break;
      }
    }
    if (shouldScan) {
      // Debounce the scan
      clearTimeout(observer._scanTimer);
      observer._scanTimer = setTimeout(scanForTextFields, 300);
    }
  });

  // Configure observer to watch adapter-specific selectors if available
  function getObserverConfig() {
    const config = {
      childList: true,
      subtree: true,
    };
    return config;
  }

  // ─── Initialize ─────────────────────────────────────────

  function init() {
    if (!state.enabled || isDisabledSite()) return;

    // Close tooltip when clicking elsewhere
    document.addEventListener("click", (e) => {
      if (state.activeTooltip && !state.activeTooltip.contains(e.target)) {
        removeTooltip();
      }
    });

    // Initial scan
    scanForTextFields();

    // Show notification for Google Docs if needed
    if (window.notifyIfGoogleDocs) {
      window.notifyIfGoogleDocs();
    }

    // Watch for new elements (SPAs, dynamically loaded content)
    observer.observe(document.body, getObserverConfig());

    console.log(
      "%c✓ Grammar & Spelling Buddy active",
      "color: #4F46E5; font-weight: bold; font-size: 12px;"
    );
  }

  // ─── Listen for messages from popup ─────────────────────

  if (typeof chrome !== "undefined" && chrome.runtime) {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg.type === "GSB_TOGGLE") {
        state.enabled = msg.enabled;
        if (!state.enabled) {
          // Remove all badges and tooltips
          document.querySelectorAll(".gsb-badge").forEach((b) => b.remove());
          removeTooltip();
        } else {
          scanForTextFields();
        }
        sendResponse({ ok: true });
      }

      if (msg.type === "GSB_GET_STATUS") {
        let totalIssues = 0;
        let pageText = "";
        document
          .querySelectorAll("textarea, input, [contenteditable]")
          .forEach((el) => {
            const issues = state.issueMap.get(el);
            if (issues) totalIssues += issues.length;

            // Collect text from all checked elements
            if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
              pageText += (el.value || "") + " ";
            } else if (el.isContentEditable) {
              pageText += (el.innerText || "") + " ";
            }
          });

        sendResponse({
          enabled: state.enabled,
          issueCount: totalIssues,
          url: location.href,
          pageText: pageText.trim(),
        });
      }

      return true; // keep channel open for async response
    });
  }

  // ─── Expose Functions to Global Window ───────────────────

  // Get all issues from all elements on the page
  window.__gsbGetIssues = function() {
    const allIssues = [];
    document
      .querySelectorAll("textarea, input, [contenteditable]")
      .forEach((element) => {
        const issues = state.issueMap.get(element);
        if (issues && issues.length > 0) {
          issues.forEach((issue) => {
            allIssues.push({
              element,
              issue,
            });
          });
        }
      });
    return allIssues;
  };

  // Apply a fix to an element (called by sidebar)
  window.__gsbApplyFix = function(element, issue) {
    applyFix(element, issue);
  };

  // ─── Boot ───────────────────────────────────────────────
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
