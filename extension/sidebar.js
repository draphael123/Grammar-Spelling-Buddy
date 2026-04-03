/**
 * Grammar & Spelling Buddy — Sidebar Widget
 *
 * A floating issues panel that lists all issues found on the page.
 * Can be toggled on/off with a pill-shaped button in the bottom-right corner.
 */

(function () {
  "use strict";

  // ─── State ──────────────────────────────────────────────
  const state = {
    sidebarOpen: false,
    allIssues: [], // Flattened list of all issues from all elements
    ignoredIssueKeys: new Set(), // Track ignored issues by key
    shadowRoot: null,
  };

  // ─── Sidebar Container ───────────────────────────────────

  function createSidebarContainer() {
    const host = document.createElement("div");
    host.id = "gsb-sidebar-host";
    document.body.appendChild(host);

    const shadowRoot = host.attachShadow({ mode: "open" });

    // Inject shadow DOM styles
    const style = document.createElement("style");
    style.textContent = `
      :host {
        --gsb-purple: #8B5CF6;
        --gsb-red: #EF4444;
        --gsb-blue: #3B82F6;
        --gsb-orange: #F97316;
        --gsb-bg: #1E293B;
        --gsb-border: #334155;
      }

      * {
        box-sizing: border-box;
      }

      /* Toggle button */
      .gsb-toggle-button {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 2147483646;
        width: 56px;
        height: 56px;
        border-radius: 28px;
        background: var(--gsb-purple);
        color: #fff;
        border: none;
        cursor: pointer;
        font-weight: 600;
        font-size: 14px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        box-shadow: 0 4px 16px rgba(139, 92, 246, 0.3);
        transition: all 0.25s ease;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }

      .gsb-toggle-button:hover {
        background: #7C3AED;
        box-shadow: 0 8px 24px rgba(139, 92, 246, 0.4);
        transform: scale(1.08);
      }

      .gsb-toggle-button:active {
        transform: scale(0.96);
      }

      /* Pulsing animation when there are unfixed issues */
      .gsb-toggle-button.pulse {
        animation: gsb-sidebar-pulse 1.5s infinite;
      }

      @keyframes gsb-sidebar-pulse {
        0%, 100% {
          box-shadow: 0 4px 16px rgba(139, 92, 246, 0.3);
        }
        50% {
          box-shadow: 0 4px 24px rgba(139, 92, 246, 0.6);
        }
      }

      /* Sidebar panel */
      .gsb-sidebar-panel {
        position: fixed;
        top: 0;
        right: 0;
        bottom: 0;
        width: 300px;
        z-index: 2147483645;
        background: var(--gsb-bg);
        border-left: 1px solid var(--gsb-border);
        box-shadow: -8px 0 24px rgba(0, 0, 0, 0.3);
        display: flex;
        flex-direction: column;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        transform: translateX(100%);
        transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      }

      .gsb-sidebar-panel.open {
        transform: translateX(0);
      }

      /* Header */
      .gsb-sidebar-header {
        padding: 16px;
        border-bottom: 1px solid var(--gsb-border);
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-shrink: 0;
      }

      .gsb-sidebar-title {
        font-size: 14px;
        font-weight: 700;
        color: #fff;
        margin: 0;
      }

      .gsb-sidebar-count {
        font-size: 12px;
        color: #94A3B8;
        font-weight: 500;
      }

      .gsb-sidebar-close {
        background: transparent;
        border: none;
        color: #94A3B8;
        cursor: pointer;
        font-size: 18px;
        padding: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: color 0.2s;
      }

      .gsb-sidebar-close:hover {
        color: #fff;
      }

      /* Fix All button */
      .gsb-sidebar-fix-all {
        padding: 12px 16px;
        margin: 0 16px 16px;
        background: var(--gsb-purple);
        color: #fff;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-weight: 600;
        font-size: 13px;
        transition: background 0.2s;
        flex-shrink: 0;
      }

      .gsb-sidebar-fix-all:hover:not(:disabled) {
        background: #7C3AED;
      }

      .gsb-sidebar-fix-all:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      /* Issues list */
      .gsb-sidebar-issues {
        flex: 1;
        overflow-y: auto;
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .gsb-sidebar-issues::-webkit-scrollbar {
        width: 6px;
      }

      .gsb-sidebar-issues::-webkit-scrollbar-track {
        background: transparent;
      }

      .gsb-sidebar-issues::-webkit-scrollbar-thumb {
        background: #475569;
        border-radius: 3px;
      }

      .gsb-sidebar-issues::-webkit-scrollbar-thumb:hover {
        background: #64748B;
      }

      /* Empty state */
      .gsb-sidebar-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        gap: 12px;
        color: #94A3B8;
        text-align: center;
        padding: 24px;
      }

      .gsb-sidebar-empty-icon {
        font-size: 40px;
      }

      .gsb-sidebar-empty-title {
        font-weight: 600;
        font-size: 14px;
        color: #fff;
      }

      .gsb-sidebar-empty-text {
        font-size: 12px;
        color: #64748B;
      }

      /* Issue card */
      .gsb-issue-card {
        background: #0F172A;
        border: 1px solid var(--gsb-border);
        border-radius: 8px;
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        transition: all 0.2s;
      }

      .gsb-issue-card:hover {
        border-color: #475569;
        background: #1E293B;
      }

      /* Issue type badge */
      .gsb-issue-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        padding: 3px 8px;
        border-radius: 4px;
        width: fit-content;
      }

      .gsb-issue-badge.spelling {
        background: rgba(239, 68, 68, 0.2);
        color: #FCA5A5;
      }

      .gsb-issue-badge.grammar {
        background: rgba(59, 130, 246, 0.2);
        color: #93C5FD;
      }

      .gsb-issue-badge.style {
        background: rgba(168, 85, 247, 0.2);
        color: #C4B5FD;
      }

      /* Issue context */
      .gsb-issue-context {
        font-size: 12px;
        color: #CBD5E1;
        line-height: 1.4;
      }

      .gsb-issue-word {
        background: rgba(239, 68, 68, 0.15);
        color: #FCA5A5;
        padding: 0 3px;
        border-radius: 2px;
        font-weight: 500;
      }

      /* Suggestion */
      .gsb-issue-suggestion {
        font-size: 12px;
        padding: 8px;
        background: rgba(139, 92, 246, 0.1);
        border-left: 2px solid var(--gsb-purple);
        border-radius: 4px;
        color: #E0E7FF;
      }

      .gsb-issue-suggestion-label {
        color: #A78BFA;
        font-weight: 600;
      }

      /* Issue actions */
      .gsb-issue-actions {
        display: flex;
        gap: 6px;
      }

      .gsb-issue-fix-btn,
      .gsb-issue-ignore-btn {
        flex: 1;
        padding: 6px 10px;
        border-radius: 4px;
        border: none;
        cursor: pointer;
        font-size: 11px;
        font-weight: 600;
        transition: all 0.2s;
      }

      .gsb-issue-fix-btn {
        background: var(--gsb-purple);
        color: #fff;
      }

      .gsb-issue-fix-btn:hover {
        background: #7C3AED;
      }

      .gsb-issue-ignore-btn {
        background: transparent;
        color: #94A3B8;
        border: 1px solid #475569;
      }

      .gsb-issue-ignore-btn:hover {
        color: #fff;
        border-color: #64748B;
      }

      /* Overlay backdrop when sidebar is open */
      .gsb-sidebar-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 2147483644;
        background: rgba(0, 0, 0, 0);
        transition: background 0.3s ease;
        pointer-events: none;
      }

      .gsb-sidebar-backdrop.open {
        background: rgba(0, 0, 0, 0.3);
        pointer-events: auto;
      }
    `;
    shadowRoot.appendChild(style);

    // Create HTML structure
    const container = document.createElement("div");
    container.innerHTML = `
      <div class="gsb-sidebar-backdrop"></div>
      <button class="gsb-toggle-button" title="Grammar & Spelling Issues">
        <span class="gsb-toggle-icon">✓</span>
        <span class="gsb-toggle-count">0</span>
      </button>
      <div class="gsb-sidebar-panel">
        <div class="gsb-sidebar-header">
          <div>
            <h3 class="gsb-sidebar-title">Issues</h3>
            <div class="gsb-sidebar-count"><span class="gsb-count-num">0</span> found</div>
          </div>
          <button class="gsb-sidebar-close" title="Close sidebar">&times;</button>
        </div>
        <button class="gsb-sidebar-fix-all" disabled>Fix All</button>
        <div class="gsb-sidebar-issues">
          <div class="gsb-sidebar-empty">
            <div class="gsb-sidebar-empty-icon">✓</div>
            <div class="gsb-sidebar-empty-title">All clear!</div>
            <div class="gsb-sidebar-empty-text">No issues found on this page</div>
          </div>
        </div>
      </div>
    `;

    shadowRoot.appendChild(container);
    state.shadowRoot = shadowRoot;
    return shadowRoot;
  }

  // ─── Issue Key Generator ────────────────────────────────

  function generateIssueKey(element, issue) {
    // Create a unique key based on element and issue position
    return `${element.tagName}::${element.offsetHeight}::${issue.start}::${issue.original}`;
  }

  // ─── Get All Issues ─────────────────────────────────────

  function getAllIssues() {
    if (typeof window.__gsbGetIssues === "function") {
      return window.__gsbGetIssues();
    }
    return [];
  }

  // ─── Get Context Around Word ────────────────────────────

  function getContextString(text, issue) {
    const before = text.substring(Math.max(0, issue.start - 30), issue.start).trim();
    const original = text.substring(issue.start, issue.end);
    const after = text.substring(issue.end, Math.min(text.length, issue.end + 30)).trim();

    const beforeWords = before.split(/\s+/).slice(-5).join(" ");
    const afterWords = after.split(/\s+/).slice(0, 5).join(" ");

    return {
      before: beforeWords,
      original,
      after: afterWords,
    };
  }

  // ─── Render Issue Card ───────────────────────────────────

  function renderIssueCard(element, issue, index) {
    const issueKey = generateIssueKey(element, issue);

    // Get text for context
    let text = "";
    if (element.tagName === "TEXTAREA" || element.tagName === "INPUT") {
      text = element.value;
    } else if (element.isContentEditable) {
      text = element.innerText;
    }

    const context = getContextString(text, issue);

    const card = document.createElement("div");
    card.className = "gsb-issue-card";
    card.setAttribute("data-issue-key", issueKey);
    card.setAttribute("data-issue-index", index);

    const typeClass = issue.type || "spelling";
    const suggestion = issue.suggestion ? `<strong class="gsb-issue-suggestion-label">Suggestion:</strong> ${escapeHtmlInShadow(issue.suggestion)}` : "No suggestion available";

    card.innerHTML = `
      <div class="gsb-issue-badge ${typeClass}">${typeClass}</div>
      <div class="gsb-issue-context">
        ${context.before ? `<span>${escapeHtmlInShadow(context.before)} </span>` : ""}
        <span class="gsb-issue-word">${escapeHtmlInShadow(context.original)}</span>
        ${context.after ? `<span> ${escapeHtmlInShadow(context.after)}</span>` : ""}
      </div>
      <div class="gsb-issue-suggestion">${suggestion}</div>
      <div class="gsb-issue-actions">
        <button class="gsb-issue-fix-btn" data-action="fix">Fix</button>
        <button class="gsb-issue-ignore-btn" data-action="ignore">Ignore</button>
      </div>
    `;

    // Store reference to element and issue for later use
    card._element = element;
    card._issue = issue;
    card._issueKey = issueKey;

    // Event handlers for the buttons
    const fixBtn = card.querySelector("[data-action='fix']");
    const ignoreBtn = card.querySelector("[data-action='ignore']");

    fixBtn.addEventListener("click", () => {
      handleFixIssue(card, element, issue);
    });

    ignoreBtn.addEventListener("click", () => {
      handleIgnoreIssue(card, issueKey);
    });

    return card;
  }

  // ─── Handle Fix Issue ────────────────────────────────────

  function handleFixIssue(card, element, issue) {
    if (typeof window.__gsbApplyFix === "function") {
      window.__gsbApplyFix(element, issue);
    }
    // Remove card from sidebar
    card.remove();
    refreshSidebar();
  }

  // ─── Handle Ignore Issue ────────────────────────────────

  function handleIgnoreIssue(card, issueKey) {
    state.ignoredIssueKeys.add(issueKey);
    card.remove();
    refreshSidebar();
  }

  // ─── Refresh Sidebar ────────────────────────────────────

  function refreshSidebar() {
    const allIssues = getAllIssues().filter((item) => {
      return !state.ignoredIssueKeys.has(generateIssueKey(item.element, item.issue));
    });

    state.allIssues = allIssues;

    const issuesList = state.shadowRoot.querySelector(".gsb-sidebar-issues");
    const countNum = state.shadowRoot.querySelector(".gsb-count-num");
    const toggleCount = state.shadowRoot.querySelector(".gsb-toggle-count");
    const fixAllBtn = state.shadowRoot.querySelector(".gsb-sidebar-fix-all");
    const toggleBtn = state.shadowRoot.querySelector(".gsb-toggle-button");

    // Update counts
    countNum.textContent = allIssues.length;
    toggleCount.textContent = allIssues.length;

    // Update Fix All button
    fixAllBtn.disabled = allIssues.length === 0;

    // Update pulse animation
    if (allIssues.length > 0) {
      toggleBtn.classList.add("pulse");
    } else {
      toggleBtn.classList.remove("pulse");
    }

    // Clear previous cards
    issuesList.innerHTML = "";

    if (allIssues.length === 0) {
      // Show empty state
      issuesList.innerHTML = `
        <div class="gsb-sidebar-empty">
          <div class="gsb-sidebar-empty-icon">✓</div>
          <div class="gsb-sidebar-empty-title">All clear!</div>
          <div class="gsb-sidebar-empty-text">No issues found on this page</div>
        </div>
      `;
    } else {
      // Render all issue cards
      allIssues.forEach((item, index) => {
        const card = renderIssueCard(item.element, item.issue, index);
        issuesList.appendChild(card);
      });
    }
  }

  // ─── Handle Fix All ──────────────────────────────────────

  function handleFixAll() {
    const issues = [...state.shadowRoot.querySelectorAll(".gsb-issue-card")];

    // Apply fixes in reverse order to preserve positions
    for (let i = issues.length - 1; i >= 0; i--) {
      const card = issues[i];
      const element = card._element;
      const issue = card._issue;

      if (typeof window.__gsbApplyFix === "function") {
        window.__gsbApplyFix(element, issue);
      }
    }

    refreshSidebar();
  }

  // ─── Toggle Sidebar ─────────────────────────────────────

  function toggleSidebar() {
    state.sidebarOpen = !state.sidebarOpen;

    const panel = state.shadowRoot.querySelector(".gsb-sidebar-panel");
    const backdrop = state.shadowRoot.querySelector(".gsb-sidebar-backdrop");

    if (state.sidebarOpen) {
      panel.classList.add("open");
      backdrop.classList.add("open");
    } else {
      panel.classList.remove("open");
      backdrop.classList.remove("open");
    }
  }

  function closeSidebar() {
    state.sidebarOpen = false;
    const panel = state.shadowRoot.querySelector(".gsb-sidebar-panel");
    const backdrop = state.shadowRoot.querySelector(".gsb-sidebar-backdrop");
    panel.classList.remove("open");
    backdrop.classList.remove("open");
  }

  // ─── Escape HTML for Shadow DOM ──────────────────────────

  function escapeHtmlInShadow(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // ─── Initialize Sidebar ─────────────────────────────────

  function initSidebar() {
    createSidebarContainer();

    // Get DOM elements
    const toggleBtn = state.shadowRoot.querySelector(".gsb-toggle-button");
    const closeBtn = state.shadowRoot.querySelector(".gsb-sidebar-close");
    const fixAllBtn = state.shadowRoot.querySelector(".gsb-sidebar-fix-all");
    const backdrop = state.shadowRoot.querySelector(".gsb-sidebar-backdrop");

    // Toggle button click
    toggleBtn.addEventListener("click", toggleSidebar);

    // Close button click
    closeBtn.addEventListener("click", closeSidebar);

    // Fix All button click
    fixAllBtn.addEventListener("click", handleFixAll);

    // Backdrop click to close
    backdrop.addEventListener("click", closeSidebar);

    // Listen for issues-updated event from content.js
    document.addEventListener("gsb-issues-updated", () => {
      refreshSidebar();
    });

    // Initial refresh
    refreshSidebar();

    console.log(
      "%c✓ Grammar & Spelling Buddy Sidebar active",
      "color: #8B5CF6; font-weight: bold; font-size: 12px;"
    );
  }

  // ─── Boot ───────────────────────────────────────────────

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSidebar);
  } else {
    initSidebar();
  }
})();
