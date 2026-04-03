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
    ignoredWords: [],
    intensity: "standard", // "strict" | "standard" | "relaxed"
    underlineStyle: "wavy", // "wavy" | "dotted" | "dashed"
    autoFix: false,
    activeTooltip: null,
    debounceTimers: new WeakMap(),
    checkedElements: new WeakSet(),
    issueMap: new WeakMap(), // element → issues[]
    currentAdapter: null, // Active site adapter
  };

  // Common auto-fix map (obvious typos → corrections)
  const AUTO_FIX_MAP = {
    teh: "the", hte: "the", taht: "that", wiht: "with", adn: "and",
    thn: "the", fo: "of", ot: "to", si: "is", ti: "it", nto: "not",
    jsut: "just", waht: "what", ahve: "have", htat: "that", thier: "their",
    recieve: "receive", beleive: "believe", occured: "occurred",
    definately: "definitely", seperate: "separate", untill: "until",
    becuase: "because", wich: "which", thsi: "this", doesnt: "doesn't",
    dont: "don't", cant: "can't", wont: "won't", didnt: "didn't",
    youre: "you're", theyre: "they're", ive: "I've", im: "I'm",
  };

  // Load all settings from storage
  if (typeof chrome !== "undefined" && chrome.storage) {
    chrome.storage.sync.get(
      ["gsbEnabled", "gsbDisabledSites", "gsbIgnoredWords", "gsbIntensity", "gsbUnderlineStyle", "gsbAutoFix"],
      (data) => {
        if (data.gsbEnabled === false) state.enabled = false;
        if (data.gsbDisabledSites) state.disabledSites = data.gsbDisabledSites;
        if (data.gsbIgnoredWords) state.ignoredWords = data.gsbIgnoredWords;
        if (data.gsbIntensity) state.intensity = data.gsbIntensity;
        if (data.gsbUnderlineStyle) state.underlineStyle = data.gsbUnderlineStyle;
        if (data.gsbAutoFix === true) state.autoFix = true;
      }
    );

    // Listen for storage changes (keeps state in sync with popup/settings)
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "sync") return;
      let needsRecheck = false;

      if (changes.gsbEnabled) {
        state.enabled = changes.gsbEnabled.newValue !== false;
        if (!state.enabled) {
          clearAllHighlights();
          removeTooltip();
        } else {
          scanForTextFields();
        }
      }
      if (changes.gsbDisabledSites) {
        state.disabledSites = changes.gsbDisabledSites.newValue || [];
        if (isDisabledSite()) {
          clearAllHighlights();
        } else {
          needsRecheck = true;
        }
      }
      if (changes.gsbIgnoredWords) {
        state.ignoredWords = changes.gsbIgnoredWords.newValue || [];
        needsRecheck = true;
      }
      if (changes.gsbIntensity) {
        state.intensity = changes.gsbIntensity.newValue || "standard";
        needsRecheck = true;
      }
      if (changes.gsbUnderlineStyle) {
        state.underlineStyle = changes.gsbUnderlineStyle.newValue || "wavy";
        needsRecheck = true;
      }
      if (changes.gsbAutoFix) {
        state.autoFix = changes.gsbAutoFix.newValue === true;
      }

      // Re-check all tracked elements when settings change
      if (needsRecheck && state.enabled && !isDisabledSite()) {
        recheckAllElements();
      }
    });
  }

  // ─── BK-Tree for Fast Spell Checking ─────────────────
  let gsbBKTree = null;
  let pendingRechecks = []; // Queue elements to re-check once tree is ready

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

  function findSuggestions(word, maxResults = 5) {
    const lower = word.toLowerCase();
    const results = [];

    // Check known misspellings first (instant lookup)
    if (GSB_MISSPELLINGS[lower]) {
      results.push(GSB_MISSPELLINGS[lower]);
    }

    // Use BK-tree for fast approximate matching
    if (gsbBKTree) {
      const candidates = gsbBKTree.search(lower, 2);
      candidates.sort((a, b) => {
        if (a.distance !== b.distance) return a.distance - b.distance;
        return a.word.length - b.word.length;
      });
      for (const c of candidates) {
        if (!results.includes(c.word)) results.push(c.word);
        if (results.length >= maxResults) break;
      }
    }

    return results;
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

      // Skip user-ignored words
      if (state.ignoredWords.includes(lower)) continue;

      // Skip words with apostrophes that might be contractions
      if (word.includes("'") || word.includes("\u2019")) {
        const normalized = word.replace(/[\u2019']/g, "'").toLowerCase();
        if (GSB_DICTIONARY.has(normalized)) continue;
      }

      // Skip if it's in the dictionary
      if (GSB_DICTIONARY.has(lower)) continue;

      // Skip likely proper nouns (capitalized mid-sentence)
      if (isLikelyProperNoun(word, match.index, text)) continue;

      // Skip ALL-CAPS words based on intensity
      const capsMaxLen = state.intensity === "strict" ? 3 : state.intensity === "relaxed" ? 8 : 5;
      if (word === word.toUpperCase() && word.length <= capsMaxLen) continue;

      // In relaxed mode, skip single capitalized words (more lenient with names)
      if (state.intensity === "relaxed" && word[0] === word[0].toUpperCase() && word.length >= 3) continue;

      // Skip words with numbers
      if (/\d/.test(word)) continue;

      // It's a potential misspelling — find suggestions
      const suggestions = findSuggestions(word);

      issues.push({
        start: match.index,
        end: match.index + word.length,
        original: word,
        message: suggestions.length
          ? `"${word}" → Did you mean "${suggestions[0]}"?`
          : `"${word}" may be misspelled`,
        suggestion: suggestions.length ? suggestions[0] : null,
        suggestions: suggestions,
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

    const suggestions = issue.suggestions && issue.suggestions.length ? issue.suggestions : (issue.suggestion ? [issue.suggestion] : []);

    let suggestionsHtml = '';
    if (suggestions.length > 0) {
      suggestionsHtml = `<div class="gsb-suggestions-list">`;
      suggestions.forEach((s, idx) => {
        const isPrimary = idx === 0;
        suggestionsHtml += `<button class="${isPrimary ? 'gsb-tooltip-suggestion' : 'gsb-tooltip-alt-suggestion'}" data-action="fix" data-fix="${escapeHtml(s)}">${escapeHtml(s)}</button>`;
      });
      suggestionsHtml += `</div>`;
    }

    tip.innerHTML = `
      <div class="gsb-tooltip-type ${issue.type}">${issue.type}</div>
      <div class="gsb-tooltip-message">${escapeHtml(issue.message)}</div>
      ${suggestionsHtml}
      <div class="gsb-tooltip-actions"><button class="gsb-dismiss" data-action="dismiss">Ignore</button></div>
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
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      const action = btn.dataset.action;
      if (action === "fix" && btn.dataset.fix) {
        applyFix(element, issue, btn.dataset.fix);
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

  function applyFix(element, issue, chosenSuggestion) {
    const fix = chosenSuggestion || issue.suggestion;
    if (!fix) return;
    if (
      element.tagName === "TEXTAREA" ||
      element.tagName === "INPUT"
    ) {
      const text = element.value;
      element.value =
        text.substring(0, issue.start) +
        fix +
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
          range.insertNode(document.createTextNode(fix));

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
          fix +
          text.substring(issue.end);
        element.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }

    // Re-check after fix
    scheduleCheck(element);
  }

  // ─── Rendering: Textarea / Input (Mirror Overlay) ───────
  // Creates a styled mirror div behind the textarea that shows
  // red underlines on misspelled/grammar-error words.

  const mirrorMap = new WeakMap(); // element → { container, mirror }

  function getOrCreateMirror(element) {
    if (mirrorMap.has(element)) return mirrorMap.get(element);
    if (!element.parentElement) return null;

    // Skip single-line inputs — use positioned overlay instead
    if (element.tagName === "INPUT") {
      mirrorMap.set(element, null);
      return null;
    }

    // Use a non-destructive approach: position mirror absolutely behind
    // the textarea WITHOUT re-parenting it (avoids breaking site layouts)
    const parent = element.parentElement;
    const parentPos = getComputedStyle(parent).position;
    if (parentPos === "static") {
      parent.style.position = "relative";
    }

    const mirror = document.createElement("div");
    mirror.className = "gsb-mirror";
    // Insert mirror right before the textarea in the same parent
    parent.insertBefore(mirror, element);

    // Make textarea transparent so mirror underlines show through
    element.style.setProperty("background", "transparent", "important");
    element.style.position = "relative";
    element.style.zIndex = "1";

    // Copy textarea styles to mirror
    syncMirrorStyles(element, mirror);
    // Position mirror to exactly overlay the textarea
    positionMirror(element, mirror);

    // Keep mirror scroll in sync
    element.addEventListener("scroll", () => {
      mirror.scrollTop = element.scrollTop;
      mirror.scrollLeft = element.scrollLeft;
    });

    // Re-sync styles and position on resize
    const ro = new ResizeObserver(() => {
      syncMirrorStyles(element, mirror);
      positionMirror(element, mirror);
    });
    ro.observe(element);

    const entry = { mirror, resizeObserver: ro };
    mirrorMap.set(element, entry);
    return entry;
  }

  function syncMirrorStyles(textarea, mirror) {
    const cs = getComputedStyle(textarea);
    const props = [
      "fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing",
      "wordSpacing", "textIndent", "textTransform", "whiteSpace", "wordWrap",
      "overflowWrap", "paddingTop", "paddingRight", "paddingBottom",
      "paddingLeft", "borderTopWidth", "borderRightWidth",
      "borderBottomWidth", "borderLeftWidth", "boxSizing",
    ];
    props.forEach((p) => { mirror.style[p] = cs[p]; });
    mirror.style.width = textarea.offsetWidth + "px";
    mirror.style.height = textarea.offsetHeight + "px";
  }

  function positionMirror(textarea, mirror) {
    // Absolutely position the mirror to sit exactly behind the textarea
    mirror.style.position = "absolute";
    mirror.style.top = textarea.offsetTop + "px";
    mirror.style.left = textarea.offsetLeft + "px";
    mirror.style.zIndex = "0";
    mirror.style.pointerEvents = "none";
    mirror.style.overflow = "hidden";
    mirror.style.whiteSpace = "pre-wrap";
    mirror.style.wordWrap = "break-word";
    mirror.style.overflowWrap = "break-word";
    mirror.style.color = "transparent";
    mirror.style.background = "transparent";
    mirror.style.borderColor = "transparent";
  }

  function renderMirrorHighlights(element, issues) {
    const entry = getOrCreateMirror(element);

    // For inputs or elements we can't mirror, fall back to badge only
    if (!entry) {
      renderBadge(element, issues);
      return;
    }

    const text = element.value || "";
    const { mirror } = entry;

    if (issues.length === 0) {
      mirror.innerHTML = escapeHtml(text) + "\u200b";
      // Remove badge if it exists
      const parent = element.parentElement;
      if (parent) {
        const badge = parent.querySelector(".gsb-badge");
        if (badge) badge.remove();
      }
      return;
    }

    // Build highlighted HTML
    let html = "";
    let cursor = 0;
    for (const issue of issues) {
      // Text before the issue
      html += escapeHtml(text.substring(cursor, issue.start));
      // The error word with underline mark
      const errWord = text.substring(issue.start, issue.end);
      const cls = issue.type === "spelling" ? "gsb-error-spelling" : "gsb-error-grammar";
      const styleCls = "gsb-ul-" + state.underlineStyle;
      html += `<mark class="${cls} ${styleCls}">${escapeHtml(errWord)}</mark>`;
      cursor = issue.end;
    }
    // Remaining text
    html += escapeHtml(text.substring(cursor));
    // Extra space so layout matches (trailing newline fix)
    mirror.innerHTML = html + "\u200b";
    mirror.scrollTop = element.scrollTop;

    // Also show badge count
    renderBadge(element, issues);
  }

  function renderBadge(element, issues) {
    const container = element.parentElement;
    if (!container) return;

    // Remove existing badge
    const existing = container.querySelector(".gsb-badge");
    if (existing) existing.remove();

    if (issues.length === 0) return;

    // Make parent relative if it isn't already
    const parentPos = getComputedStyle(container).position;
    if (parentPos === "static") {
      container.style.position = "relative";
    }

    const badge = document.createElement("div");
    badge.className = "gsb-badge";
    badge.textContent = `${issues.length} issue${issues.length > 1 ? "s" : ""}`;

    container.appendChild(badge);
  }

  // ─── Rendering: ContentEditable ─────────────────────────
  // ─── Contenteditable: Fixed-Position Underlines ──────────
  // Gmail/Slack strip injected DOM. Instead we draw underlines using
  // position:fixed on document.body — immune to stacking contexts.
  // Uses Range.getClientRects() for pixel-perfect positioning.

  const ceOverlayMap = new WeakMap(); // element → { container, ro }

  function getOrCreateCEOverlay(element) {
    if (ceOverlayMap.has(element)) return ceOverlayMap.get(element);

    const container = document.createElement("div");
    container.className = "gsb-ce-overlay";
    container.style.cssText = "position:fixed;top:0;left:0;width:100vw;height:100vh;pointer-events:none;z-index:2147483646;";
    document.body.appendChild(container);

    // Re-render on scroll/resize to reposition fixed underlines
    const reposition = () => {
      const issues = state.issueMap.get(element);
      if (issues && issues.length > 0) {
        drawCEUnderlines(element, issues);
      } else {
        container.innerHTML = "";
      }
    };
    element.addEventListener("scroll", reposition, { passive: true });
    // Also listen on window scroll (Gmail compose scrolls within page)
    window.addEventListener("scroll", reposition, { passive: true });
    const ro = new ResizeObserver(reposition);
    ro.observe(element);

    const entry = { container, ro, reposition };
    ceOverlayMap.set(element, entry);
    return entry;
  }

  // Build a text-node map accounting for block-element newlines
  // (innerText inserts \n for <div>, <p>, <br> but text nodes don't)
  function buildInnerTextNodeMap(element) {
    const result = [];
    let offset = 0;

    function walk(node, isFirst) {
      if (node.nodeType === Node.TEXT_NODE) {
        result.push({ node, start: offset, end: offset + node.length });
        offset += node.length;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const tag = node.tagName;
        const isBlock = /^(DIV|P|BR|LI|H[1-6]|BLOCKQUOTE|PRE|TR)$/.test(tag);
        if (isBlock && !isFirst && tag !== "BR") {
          offset += 1; // newline before block content
        }
        if (tag === "BR") {
          offset += 1;
        } else {
          let first = true;
          for (let child = node.firstChild; child; child = child.nextSibling) {
            walk(child, first);
            first = false;
          }
        }
      }
    }
    walk(element, true);
    return result;
  }

  function drawCEUnderlines(element, issues) {
    const entry = ceOverlayMap.get(element);
    if (!entry || !entry.container) return;
    const container = entry.container;
    container.innerHTML = "";

    if (!issues || issues.length === 0) return;

    // Check element is still visible
    const elRect = element.getBoundingClientRect();
    if (elRect.width === 0 && elRect.height === 0) return;

    const textNodes = buildInnerTextNodeMap(element);

    issues.forEach((issue) => {
      let startNode = null, startOff = 0;
      let endNode = null, endOff = 0;

      for (const tn of textNodes) {
        if (!startNode && tn.end > issue.start) {
          startNode = tn.node;
          startOff = issue.start - tn.start;
        }
        if (!endNode && tn.end >= issue.end) {
          endNode = tn.node;
          endOff = issue.end - tn.start;
          break;
        }
      }

      if (!startNode || !endNode) return;
      if (startOff > startNode.length) startOff = startNode.length;
      if (endOff > endNode.length) endOff = endNode.length;

      try {
        const range = document.createRange();
        range.setStart(startNode, startOff);
        range.setEnd(endNode, endOff);

        // getClientRects gives viewport-relative coordinates (perfect for fixed positioning)
        const rects = range.getClientRects();
        for (let r = 0; r < rects.length; r++) {
          const rect = rects[r];
          // Skip rects outside the visible element area
          if (rect.bottom < elRect.top || rect.top > elRect.bottom) continue;
          if (rect.right < elRect.left || rect.left > elRect.right) continue;
          // Skip zero-size rects
          if (rect.width < 1) continue;

          const underline = document.createElement("div");
          underline.className = "gsb-ce-underline " + (issue.type === "grammar" ? "grammar" : "spelling");
          // position:fixed uses viewport coordinates = getBoundingClientRect values directly
          underline.style.cssText =
            "position:fixed;" +
            "left:" + rect.left + "px;" +
            "top:" + (rect.bottom - 2) + "px;" +
            "width:" + rect.width + "px;" +
            "height:3px;" +
            "pointer-events:auto;cursor:pointer;";

          underline.addEventListener("click", (e) => {
            e.stopPropagation();
            showTooltip(issue, rect, element);
          });

          container.appendChild(underline);
        }
      } catch (e) {
        // Range errors with dynamic DOMs — skip
      }
    });
  }

  // Clear all CE underlines (used when disabling extension)
  function clearCEOverlays() {
    // WeakMap doesn't support iteration, so clear by removing all overlay elements
    document.querySelectorAll(".gsb-ce-overlay").forEach((el) => el.remove());
  }

  function renderContentEditableIssues(element, issues) {
    state.issueMap.set(element, issues);
    getOrCreateCEOverlay(element); // ensure overlay exists
    drawCEUnderlines(element, issues);
  }

  // ─── Highlight Cleanup & Re-check ──────────────────────

  function clearAllHighlights() {
    // Remove mirror overlays (textareas)
    document.querySelectorAll(".gsb-mirror").forEach((m) => m.remove());
    // Remove CE overlays (contenteditable)
    clearCEOverlays();
    // Remove badges
    document.querySelectorAll(".gsb-badge").forEach((b) => b.remove());
    // Remove tooltips
    removeTooltip();
    // Clear issue map
    state.issueMap = new WeakMap();
    // Notify badge
    if (typeof chrome !== "undefined" && chrome.runtime) {
      try {
        chrome.runtime.sendMessage({ action: "GSB_ISSUE_COUNT", type: "GSB_ISSUE_COUNT", count: 0, issueCount: 0, spelling: 0, grammar: 0 });
      } catch (e) {}
    }
  }

  function recheckAllElements() {
    // Re-scan and re-check all currently tracked elements
    scanForTextFields();
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
        (i) => cursorPos >= i.start && cursorPos < i.end
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
        (i) => cursorPos >= i.start && cursorPos < i.end
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
    // If BK-tree isn't ready yet, queue for re-check later
    if (!gsbBKTree && pendingRechecks.indexOf(element) === -1) {
      pendingRechecks.push(element);
    }

    let text = "";

    if (element.tagName === "TEXTAREA" || element.tagName === "INPUT") {
      text = element.value;
    } else if (element.isContentEditable) {
      text = element.innerText;
    }

    if (!text || text.trim().length < 3) {
      state.issueMap.set(element, []);
      renderMirrorHighlights(element, []);
      return;
    }

    // Auto-fix obvious typos before checking (if enabled)
    if (state.autoFix && (element.tagName === "TEXTAREA" || element.tagName === "INPUT")) {
      let fixed = text;
      let changed = false;
      for (const [typo, correction] of Object.entries(AUTO_FIX_MAP)) {
        const regex = new RegExp("\\b" + typo + "\\b", "gi");
        if (regex.test(fixed)) {
          fixed = fixed.replace(regex, correction);
          changed = true;
        }
      }
      if (changed) {
        const cursorPos = element.selectionStart;
        const diff = fixed.length - text.length;
        element.value = fixed;
        element.selectionStart = element.selectionEnd = cursorPos + diff;
        text = fixed;
      }
    }

    const issues = fullCheck(text);
    state.issueMap.set(element, issues);

    // Render underlines for textarea/input via mirror overlay
    if (element.tagName === "TEXTAREA" || element.tagName === "INPUT") {
      renderMirrorHighlights(element, issues);
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
          action: "GSB_ISSUE_COUNT",
          count: issues.length,
          issueCount: issues.length,
          spelling: spellingIssueCount,
          grammar: grammarIssueCount,
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

    // Build BK-tree asynchronously from dictionary (non-blocking)
    if (typeof buildBKTree !== "undefined" && typeof GSB_DICTIONARY !== "undefined") {
      buildBKTree(GSB_DICTIONARY, 5000).then((tree) => {
        gsbBKTree = tree;
        console.log(
          "%c✓ Spell-check tree ready (" + tree.size() + " words)",
          "color: #10B981; font-weight: bold; font-size: 11px;"
        );
        // Re-check any elements that were checked before tree was ready
        const pending = pendingRechecks.splice(0);
        for (const el of pending) {
          try { runCheck(el); } catch (e) { /* element may be gone */ }
        }
      });
    } else {
      console.warn("Grammar & Spelling Buddy: dictionary or BK-tree builder not loaded");
    }

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
      // Support both "type" (background.js) and "action" (popup.js) keys
      const action = msg.action || msg.type;

      if (action === "GSB_TOGGLE") {
        state.enabled = msg.enabled;
        if (!state.enabled) {
          document.querySelectorAll(".gsb-badge").forEach((b) => b.remove());
          removeTooltip();
        } else {
          scanForTextFields();
        }
        sendResponse({ ok: true });
      }

      if (action === "GSB_GET_STATUS") {
        let totalIssues = 0;
        let spellingTotal = 0;
        let grammarTotal = 0;
        let pageText = "";
        document
          .querySelectorAll("textarea, input, [contenteditable]")
          .forEach((el) => {
            const issues = state.issueMap.get(el);
            if (issues) {
              totalIssues += issues.length;
              spellingTotal += issues.filter((i) => i.type === "spelling").length;
              grammarTotal += issues.filter((i) => i.type !== "spelling").length;
            }
            if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
              pageText += (el.value || "") + " ";
            } else if (el.isContentEditable) {
              pageText += (el.innerText || "") + " ";
            }
          });

        sendResponse({
          enabled: state.enabled,
          issueCount: totalIssues,
          spelling: spellingTotal,
          grammar: grammarTotal,
          url: location.href,
          pageText: pageText.trim(),
        });
      }

      if (action === "GSB_GET_PAGE_TEXT") {
        let pageText = "";
        document
          .querySelectorAll("textarea, input, [contenteditable]")
          .forEach((el) => {
            if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
              pageText += (el.value || "") + " ";
            } else if (el.isContentEditable) {
              pageText += (el.innerText || "") + " ";
            }
          });
        sendResponse({ pageText: pageText.trim() });
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
  window.__gsbApplyFix = function(element, issue, chosenSuggestion) {
    applyFix(element, issue, chosenSuggestion || issue.suggestion);
  };

  // ─── Boot ───────────────────────────────────────────────
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
