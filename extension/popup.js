/**
 * Grammar & Spelling Buddy — Popup Script
 *
 * Controls the extension popup UI:
 * - Shows issue counts for the active tab
 * - Toggles the extension on/off
 * - Displays the current domain
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
        return;
      }

      enableToggle.checked = response.enabled;

      if (response.issueCount === 0) {
        statsArea.style.display = "none";
        noIssues.style.display = "block";
        statusText.textContent = "All clear!";
        statusText.style.color = "#10B981";
      } else {
        statsArea.style.display = "block";
        noIssues.style.display = "none";
        statusText.textContent = `${response.issueCount} issue${response.issueCount !== 1 ? "s" : ""} found`;
        statusText.style.color = "#F59E0B";
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
        statsArea.style.display = "none";
        noIssues.style.display = "block";
        statusText.textContent = "All clear!";
        statusText.style.color = "#10B981";
      } else {
        statsArea.style.display = "block";
        noIssues.style.display = "none";
        statusText.textContent = `${count} issue${count !== 1 ? "s" : ""} found`;
        statusText.style.color = "#F59E0B";
        // Update individual counts based on message data
        if (msg.spellingCount !== undefined) spellingCount.textContent = msg.spellingCount;
        if (msg.grammarCount !== undefined) grammarCount.textContent = msg.grammarCount;
      }
    }
  });
})();
