/**
 * Grammar & Spelling Buddy — Background Service Worker
 *
 * Handles:
 * - Extension install/update events
 * - Badge text updates (issue count on extension icon)
 * - Context menu for disabling on specific sites
 */

// ─── Install / Update ─────────────────────────────────────
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    // Set default settings
    chrome.storage.sync.set({
      gsbEnabled: true,
      gsbDisabledSites: [],
    });

    // Open welcome page (optional)
    // chrome.tabs.create({ url: "welcome.html" });

    console.log("Grammar & Spelling Buddy installed!");
  }

  // Create context menu
  chrome.contextMenus.create({
    id: "gsb-toggle-site",
    title: "Disable Grammar & Spelling Buddy on this site",
    contexts: ["page"],
  });
});

// ─── Context Menu Handler ─────────────────────────────────
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "gsb-toggle-site" && tab) {
    try {
      const url = new URL(tab.url);
      const domain = url.hostname;

      chrome.storage.sync.get(["gsbDisabledSites"], (data) => {
        const sites = data.gsbDisabledSites || [];

        if (sites.includes(domain)) {
          // Re-enable
          const updated = sites.filter((s) => s !== domain);
          chrome.storage.sync.set({ gsbDisabledSites: updated });
          chrome.contextMenus.update("gsb-toggle-site", {
            title: "Disable Grammar & Spelling Buddy on this site",
          });
        } else {
          // Disable
          sites.push(domain);
          chrome.storage.sync.set({ gsbDisabledSites: sites });
          chrome.contextMenus.update("gsb-toggle-site", {
            title: "Enable Grammar & Spelling Buddy on this site",
          });
        }

        // Notify content script
        chrome.tabs.sendMessage(tab.id, {
          type: "GSB_TOGGLE",
          enabled: !sites.includes(domain),
        });
      });
    } catch (e) {
      // Invalid URL — ignore
    }
  }
});

// ─── Badge Updates ────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === "GSB_ISSUE_COUNT" && sender.tab) {
    const count = msg.count;

    if (count === 0) {
      chrome.action.setBadgeText({ text: "", tabId: sender.tab.id });
    } else {
      chrome.action.setBadgeText({
        text: String(count),
        tabId: sender.tab.id,
      });
      chrome.action.setBadgeBackgroundColor({
        color: "#4F46E5",
        tabId: sender.tab.id,
      });
    }
  }
});
