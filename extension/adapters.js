/**
 * Grammar & Spelling Buddy — Site-Specific Adapters
 *
 * Handles unique DOM structures of major websites to improve
 * compatibility and provide better text input detection.
 */

(function () {
  "use strict";

  // ─── Gmail Adapter ──────────────────────────────────────────

  const gmailAdapter = {
    name: "Gmail",
    host: "mail.google.com",
    selectors: [
      'div[contenteditable="true"][role="textbox"]',
      "div.editable",
      'div[contenteditable="true"][g_editable_id]',
    ],
    shouldAttach(element) {
      // Ensure it's within a Gmail compose/reply context
      const parent = element.closest(".Am, .IZ, .hP");
      return !!parent || element.classList.contains("editable");
    },
    getTextContent(element) {
      return element.innerText || element.textContent || "";
    },
  };

  // ─── Google Docs Adapter ────────────────────────────────────

  const googleDocsAdapter = {
    name: "Google Docs",
    host: "docs.google.com",
    selectors: [
      // We can't directly hook into the canvas, but we can detect the environment
      ".docs-texteventtarget-iframe",
    ],
    shouldAttach(element) {
      // Google Docs uses a canvas-based renderer, we can't directly inject
      // This adapter mainly serves to detect Google Docs and show a notification
      return false; // Don't attach to any elements; we'll handle this in content.js
    },
    getTextContent(element) {
      return "";
    },
    isGoogleDocsPage() {
      return document.querySelector(".docs-texteventtarget-iframe") !== null;
    },
    notifyUser() {
      // Show a polite notification when on Google Docs
      const notification = document.createElement("div");
      notification.className = "gsb-docs-notice";
      notification.innerHTML = `
        <div style="background: #f0f7ff; border-left: 4px solid #4F46E5; padding: 12px 16px; margin: 8px; border-radius: 4px; font-size: 13px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
          <strong>Grammar & Spelling Buddy:</strong> Direct checking in Google Docs isn't supported due to its canvas-based editor.
          Try copying text to the extension popup or to a regular text editor to check it.
        </div>
      `;
      return notification;
    },
  };

  // ─── LinkedIn Adapter ───────────────────────────────────────

  const linkedinAdapter = {
    name: "LinkedIn",
    host: "linkedin.com",
    selectors: [
      'div[contenteditable="true"][role="textbox"]',
      ".msg-form div[contenteditable]",
      ".share-creation-state div[contenteditable]",
    ],
    shouldAttach(element) {
      // Check if it's in a post composer or message composer
      const inComposer =
        element.closest(".share-creation-state") ||
        element.closest(".msg-form");
      if (inComposer) return true;

      // Also check for contenteditable textbox in main feed
      return (
        element.getAttribute("role") === "textbox" &&
        element.getAttribute("contenteditable") === "true"
      );
    },
    getTextContent(element) {
      return element.innerText || element.textContent || "";
    },
  };

  // ─── Twitter/X Adapter ──────────────────────────────────────

  const twitterAdapter = {
    name: "Twitter/X",
    host: null, // Will match both twitter.com and x.com
    selectors: [
      'div[contenteditable="true"][role="textbox"]',
      '[data-testid="tweetTextarea_0"] div[contenteditable]',
      '[data-testid="dmComposerTextInput"] div[contenteditable]',
    ],
    shouldAttach(element) {
      // Twitter uses contenteditable textboxes in specific areas
      if (element.getAttribute("role") === "textbox") {
        // Could be tweet or DM composer
        return element.getAttribute("contenteditable") === "true";
      }

      // Check for data-testid patterns
      const parent = element.closest(
        '[data-testid*="tweetTextarea"], [data-testid*="dmComposer"]'
      );
      return !!parent;
    },
    getTextContent(element) {
      return element.innerText || element.textContent || "";
    },
    matches(hostname) {
      return hostname.includes("twitter.com") || hostname.includes("x.com");
    },
  };

  // ─── Slack Adapter ──────────────────────────────────────────

  const slackAdapter = {
    name: "Slack",
    host: "app.slack.com",
    selectors: [
      'div[contenteditable="true"][role="textbox"]',
      '.ql-editor[contenteditable="true"]',
      '[data-qa="message_input"] div[contenteditable]',
    ],
    shouldAttach(element) {
      // Slack message inputs are contenteditable with role=textbox
      if (element.getAttribute("role") === "textbox") {
        return element.getAttribute("contenteditable") === "true";
      }

      // Check for ql-editor class (Quill editor)
      if (element.classList && element.classList.contains("ql-editor")) {
        return element.getAttribute("contenteditable") === "true";
      }

      // Check for data-qa attribute
      const parent = element.closest('[data-qa="message_input"]');
      return !!parent;
    },
    getTextContent(element) {
      return element.innerText || element.textContent || "";
    },
  };

  // ─── Adapter Registry ────────────────────────────────────────

  const adapters = [
    gmailAdapter,
    googleDocsAdapter,
    linkedinAdapter,
    twitterAdapter,
    slackAdapter,
  ];

  // ─── Adapter Selection ───────────────────────────────────────

  /**
   * Get the appropriate adapter for the current site.
   * Returns { name, selectors, shouldAttach, getTextContent } or null
   */
  window.getAdapterForSite = function () {
    const hostname = location.hostname;

    // Check for Twitter/X first (special handling for multiple hosts)
    const twitterMatch = adapters.find(
      (a) =>
        a.name === "Twitter/X" &&
        (hostname.includes("twitter.com") || hostname.includes("x.com"))
    );
    if (twitterMatch) return twitterMatch;

    // Check for Google Docs
    if (hostname.includes("docs.google.com")) {
      // Only return the adapter if we're actually on a Docs page
      if (googleDocsAdapter.isGoogleDocsPage()) {
        return googleDocsAdapter;
      }
    }

    // Check other adapters by hostname
    const adapter = adapters.find(
      (a) => a.host && hostname.includes(a.host)
    );

    return adapter || null;
  };

  /**
   * Check if Google Docs page and show notification
   */
  window.notifyIfGoogleDocs = function () {
    if (
      location.hostname.includes("docs.google.com") &&
      googleDocsAdapter.isGoogleDocsPage()
    ) {
      // Wait for document to be ready
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => {
          const toolbar = document.querySelector(".toolbar-container");
          if (toolbar) {
            toolbar.parentElement.insertBefore(
              googleDocsAdapter.notifyUser(),
              toolbar.nextSibling
            );
          }
        });
      } else {
        const toolbar = document.querySelector(".toolbar-container");
        if (toolbar) {
          toolbar.parentElement.insertBefore(
            googleDocsAdapter.notifyUser(),
            toolbar.nextSibling
          );
        }
      }
    }
  };
})();
