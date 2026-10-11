/**
 * PetaKlien - Background Service Worker (Manifest V3)
 */

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    console.log("PetaKlien: Ekstensi berhasil diinstal!");
    // Set initial defaults
    chrome.storage.local.get(["mapsLeadsData"], (res) => {
      if (!res.mapsLeadsData) {
        chrome.storage.local.set({ mapsLeadsData: [] });
      }
    });
  }
});

// Tick clock for hidden Google Maps tabs: the content script asks "wake me in N ms" and the
// worker answers over the port. Port traffic also keeps the worker alive during a run.
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "petaklien_automation_keepalive") return;
  const timers = new Set();
  port.onMessage.addListener((msg) => {
    if (!msg || msg.type !== "TICK") return;
    const delay = Math.min(Math.max(Number(msg.ms) || 0, 0), 30000);
    const t = setTimeout(() => {
      timers.delete(t);
      try {
        port.postMessage({ type: "TOCK", id: msg.id });
      } catch (e) {}
    }, delay);
    timers.add(t);
  });
  port.onDisconnect.addListener(() => {
    timers.forEach(clearTimeout);
    timers.clear();
  });
});

// "Run finished" notification for a Maps tab working in the background.
// The notification id carries the tab id so a click can bring that tab back.
chrome.notifications.onClicked.addListener((notificationId) => {
  const match = /^petaklien-done-(\d+)$/.exec(notificationId);
  chrome.notifications.clear(notificationId);
  if (!match) return;
  const tabId = Number(match[1]);
  chrome.tabs.update(tabId, { active: true }, (tab) => {
    if (!chrome.runtime.lastError && tab) chrome.windows.update(tab.windowId, { focused: true });
  });
});

// Deep Search Service Worker Proxy (CORS-free, Session-isolated)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "NOTIFY") {
    const tabId = sender.tab ? sender.tab.id : 0;
    chrome.notifications.create(`petaklien-done-${tabId}`, {
      type: "basic",
      iconUrl: chrome.runtime.getURL("icons/icon128.png"),
      title: String(msg.title || "PetaKlien").slice(0, 80),
      message: String(msg.message || "").slice(0, 200),
      priority: 1
    });
    return false;
  }

  // Open the report page (extension page) next to the Google Maps tab
  if (msg?.type === "OPEN_REPORT") {
    const createProps = { url: chrome.runtime.getURL("src/report/report.html") };
    if (sender.tab) {
      createProps.index = sender.tab.index + 1;
      createProps.openerTabId = sender.tab.id;
    }
    chrome.tabs.create(createProps)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, reason: err.message }));
    return true;
  }

  if (msg?.type === "DEEP_SEARCH") {
    (async () => {
      try {
        const query = msg.query || "";
        if (!query.trim()) {
          sendResponse({ ok: false, reason: "Query kosong" });
          return;
        }

        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=id&gl=id`;
        const res = await fetch(searchUrl, {
          credentials: "omit", // Do not attach user session/cookies
          headers: {
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "id,en-US;q=0.7,en;q=0.3"
          }
        });

        // Google answers automated traffic with HTTP 429 and/or a redirect to /sorry/ (CAPTCHA)
        if (res.status === 429 || (res.url && res.url.includes("/sorry/"))) {
          sendResponse({ ok: false, blocked: true, status: res.status, reason: "Google meminta verifikasi CAPTCHA / terlalu banyak permintaan" });
          return;
        }
        if (!res.ok) {
          sendResponse({ ok: false, status: res.status, reason: `HTTP ${res.status} ${res.statusText}` });
          return;
        }

        const html = await res.text();
        sendResponse({ ok: true, html });
      } catch (err) {
        console.warn("PetaKlien Service Worker: Deep Search fetch error", err);
        sendResponse({ ok: false, reason: err.message || "Network error" });
      }
    })();
    return true; // Keep channel open for async response
  }
});
