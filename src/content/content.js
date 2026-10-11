/**
 * PetaKlien - Core Content Script & Automation Engine
 * Universal scraper for Google Maps: Businesses, Schools, Clinics, Organizations, etc.
 */

(function () {
  // Prevent double injection
  if (typeof window !== "undefined") {
    if (window.__petaKlienInitialized) return;
    window.__petaKlienInitialized = true;
  }

  // Automation States
  const State = {
    IDLE: "IDLE",
    RUNNING: "RUNNING",
    PAUSED: "PAUSED",
    STOPPED: "STOPPED"
  };

  let currentState = State.IDLE;

  let config = {
    filter: "no_website_and_social",
    limit: 50,
    minDelay: 1500,
    maxDelay: 2800
  };

  let leads = [];
  let processedIds = new Set();
  let scannedCount = 0;
  let currentCardIndex = 0;
  let isGridScanning = false;
  let gridScanQueue = [];
  let noWebCount = 0;
  let socialCount = 0;
  let hasWebCount = 0;

  // --- Anti-Background Tab Throttling: Service Worker Tick Clock ---
  // Chrome throttles timers in hidden tabs (setTimeout >= 1s, and after ~5 min only one
  // wake-up per minute), which stalls the automation loop. While a run is active, sleep()
  // in a hidden tab is driven by messages from the service worker instead: message delivery
  // is not subject to timer throttling. Replaces the old silent Web Audio oscillator.
  let keepAlivePort = null;
  let keepAliveWanted = false;
  let tickSeq = 0;
  const pendingTicks = new Map();

  function flushPendingTicks() {
    for (const resolve of pendingTicks.values()) resolve();
    pendingTicks.clear();
  }

  function connectKeepAlivePort() {
    if (keepAlivePort || typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.connect) return keepAlivePort;
    try {
      keepAlivePort = chrome.runtime.connect({ name: "petaklien_automation_keepalive" });
      keepAlivePort.onMessage.addListener((msg) => {
        if (msg && msg.type === "TOCK") {
          const resolve = pendingTicks.get(msg.id);
          if (resolve) {
            pendingTicks.delete(msg.id);
            resolve();
          }
        }
      });
      keepAlivePort.onDisconnect.addListener(() => {
        keepAlivePort = null;
        flushPendingTicks(); // never leave the loop hanging; next sleep() reconnects
      });
    } catch (e) {
      keepAlivePort = null;
    }
    return keepAlivePort;
  }

  function startKeepAlive() {
    keepAliveWanted = true;
    connectKeepAlivePort();
  }

  function stopKeepAlive() {
    keepAliveWanted = false;
    try {
      if (keepAlivePort) keepAlivePort.disconnect();
    } catch (e) {}
    keepAlivePort = null;
    flushPendingTicks();
  }

  /**
   * Advanced Filter Evaluator
   */
  function meetsAdvancedFilters(lead, advConfig) {
    if (!advConfig) return { pass: true, reason: "" };

    // 1. Contact / WhatsApp Filter
    if (advConfig.contactType === "has_phone") {
      if (!lead.phone || lead.phone === "-" || lead.phone.trim() === "") {
        return { pass: false, reason: "Tanpa Nomor Telepon" };
      }
    } else if (advConfig.contactType === "wa_only") {
      const p = String(lead.phone || "").replace(/[^0-9+]/g, "");
      const isWa = lead.phoneType === "Seluler (WhatsApp)" || p.startsWith("08") || p.startsWith("628") || p.startsWith("+628");
      if (!isWa) {
        return { pass: false, reason: "Bukan Nomor WhatsApp (08..)" };
      }
    }

    // 2. Rating Filter
    if (advConfig.minRating && advConfig.minRating > 0) {
      const r = parseFloat(lead.rating) || 0;
      if (r > 0 && r < advConfig.minRating) {
        return { pass: false, reason: `Rating (${r}) < Min (${advConfig.minRating})` };
      }
    }

    // 3. Reviews Count Filter
    const rev = parseInt(String(lead.reviewsCount || "0").replace(/[^0-9]/g, "")) || 0;
    if (advConfig.minReviews && advConfig.minReviews > 0) {
      if (rev < advConfig.minReviews) {
        return { pass: false, reason: `Ulasan (${rev}) < Min (${advConfig.minReviews})` };
      }
    }
    if (advConfig.maxReviews && advConfig.maxReviews > 0 && advConfig.maxReviews < 999999) {
      if (rev > advConfig.maxReviews) {
        return { pass: false, reason: `Ulasan (${rev}) > Max (${advConfig.maxReviews})` };
      }
    }

    // 4. Must Include Keywords Filter
    if (advConfig.includeKeywords && advConfig.includeKeywords.trim()) {
      const incKeywords = advConfig.includeKeywords.toLowerCase().split(/[,\s]+/).filter(k => k.length >= 2);
      const targetText = ((lead.title || "") + " " + (lead.category || "")).toLowerCase();
      const hasMatch = incKeywords.some(kw => targetText.includes(kw));
      if (!hasMatch) {
        return { pass: false, reason: "Tidak Mengandung Kata Wajib" };
      }
    }

    // 5. Must Exclude Keywords Filter (Negative Keywords)
    if (advConfig.excludeKeywords && advConfig.excludeKeywords.trim()) {
      const excKeywords = advConfig.excludeKeywords.toLowerCase().split(/[,\s]+/).filter(k => k.length >= 2);
      const targetText = ((lead.title || "") + " " + (lead.category || "")).toLowerCase();
      const hasExcluded = excKeywords.find(kw => targetText.includes(kw));
      if (hasExcluded) {
        return { pass: false, reason: `Kata Negatif: "${hasExcluded}"` };
      }
    }

    // 6. Location / Address Filter
    if (advConfig.locationFilter && advConfig.locationFilter.trim()) {
      const locTarget = advConfig.locationFilter.toLowerCase().trim();
      const addr = (lead.address || "").toLowerCase();
      if (!addr.includes(locTarget)) {
        return { pass: false, reason: `Alamat tidak cocok dengan "${advConfig.locationFilter}"` };
      }
    }

    return { pass: true, reason: "" };
  }

  // Shared modules: loaded before this file by manifest.json (browser), require()'d in Node tests
  function loadShared(globalName, path) {
    if (typeof window !== "undefined" && window[globalName]) return window[globalName];
    return require(path);
  }
  const sharedSchema = loadShared("PetaKlienSchema", "../shared/lead-schema.js");
  const DeepSearch = loadShared("PetaKlienDeepSearch", "../shared/deep-search.js");
  const Exporter = loadShared("PetaKlienExporter", "../shared/exporter.js");

  const {
    SCHEMA_VERSION, STATUS_KIND, statusKind, countLeads, COLUMNS,
    OUTREACH_STATUSES, neutralizeFormula, safeHttpUrl, extractPlaceId, leadKey,
    STORAGE_KEYS, applyContactHistory
  } = sharedSchema;
  const {
    SOCIAL_DOMAINS, FREE_BUILDER_DOMAINS, detectWebsiteTech, extractEmail,
    performAutoDeepSearch, applyDeepSearchResult, createDeepSearchGuard
  } = DeepSearch;

  // Tiered Resilient Selector Registry
  const SELECTORS = {
    feed: [
      'div[role="feed"]',
      'div[aria-label*="Results for" i]',
      'div[aria-label*="Hasil untuk" i]',
      'div.m6QErb[aria-label]',
      'div.m6QErb'
    ],
    cardLink: [
      'a.hfpxzc',
      'div[role="article"] a[href*="/maps/place/"]',
      'a[href*="/maps/place/"]'
    ],
    cardWrap: [
      'div.Nv2PK',
      'div[role="article"]',
      'div.THOPZb'
    ],
    detailTitle: [
      'div[role="main"] h1.DUwDvf',
      'div[role="main"] h1.fontHeadlineLarge',
      'div.lMbq3e h1',
      'h1.DUwDvf',
      'h1.fontHeadlineLarge'
    ],
    website: [
      'a[data-item-id="authority"]',
      'a[data-tooltip*="website" i]',
      'a[data-tooltip*="situs web" i]',
      'a[aria-label*="Website:" i]',
      'a[aria-label*="Situs Web:" i]',
      'a[aria-label*="Website" i]',
      'a[aria-label*="Situs Web" i]'
    ],
    phone: [
      'button[data-item-id^="phone:"]',
      'button[data-tooltip*="phone" i]',
      'button[data-tooltip*="telepon" i]',
      'button[aria-label*="Telepon:" i]',
      'button[aria-label*="Phone:" i]',
      'button[aria-label*="Nomor telepon" i]'
    ],
    address: [
      'button[data-item-id="address"]',
      'button[data-tooltip*="address" i]',
      'button[data-tooltip*="alamat" i]',
      'button[aria-label*="Alamat:" i]',
      'button[aria-label*="Address:" i]'
    ]
  };

  function queryFirst(key, root = document) {
    const list = SELECTORS[key] || [];
    for (const sel of list) {
      const el = root.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  /**
   * Selector health monitor: Google Maps changes its DOM class names regularly.
   * When a critical element is missing N times in a row, warn once instead of
   * silently collecting empty/garbage rows.
   */
  function createSelectorHealthMonitor({ threshold = 5, onUnhealthy } = {}) {
    const misses = {};
    const reported = new Set();
    return {
      record(key, ok) {
        if (ok) {
          misses[key] = 0;
          return true;
        }
        misses[key] = (misses[key] || 0) + 1;
        if (misses[key] >= threshold && !reported.has(key)) {
          reported.add(key);
          if (onUnhealthy) onUnhealthy(key, misses[key]);
          return false;
        }
        return true;
      },
      misses
    };
  }

  const HEALTH_LABELS = {
    cardTitle: "nama tempat pada kartu hasil pencarian",
    detailTitle: "panel detail tempat"
  };

  function warnSelectorBroken(key, count) {
    console.warn(`PetaKlien: selector "${key}" gagal ${count}x berturut-turut. DOM Google Maps kemungkinan berubah.`);
    if (currentState === State.RUNNING) {
      currentState = State.PAUSED;
      stopKeepAlive();
      updateUI("Otomasi dijeda: struktur Google Maps tidak dikenali");
    }
    if (window.PetaKlienOverlay && window.PetaKlienOverlay.showAlert) {
      window.PetaKlienOverlay.showAlert(
        "Google Maps Berubah?",
        `PetaKlien gagal membaca ${HEALTH_LABELS[key] || key} sebanyak ${count} kali berturut-turut. ` +
        "Kemungkinan Google Maps baru saja memperbarui tampilannya, sehingga data yang terkumpul bisa kosong atau salah. " +
        "Otomasi dijeda. Coba muat ulang halaman; jika masih terjadi, ekstensi perlu diperbarui.",
        "PERHATIAN"
      );
    }
  }

  // Multi-Area Grid Sub-District Dictionary
  const SUB_AREAS_MAP = {
    "jakarta selatan": ["Senopati", "Kebayoran Baru", "Kemang", "Tebet", "Kuningan", "Cilandak", "Pasar Minggu", "Pondok Indah", "Jagakarsa", "Pancoran"],
    "jakarta barat": ["Tanjung Duren", "Puri Indah", "Kebon Jeruk", "Grogol", "Cengkareng", "Kalideres", "Kembangan", "Palmerah"],
    "jakarta pusat": ["Menteng", "Thamrin", "Sudirman", "Tanah Abang", "Kemayoran", "Senen", "Cempaka Putih", "Gambir"],
    "jakarta utara": ["Kelapa Gading", "PIK", "Pluit", "Sunter", "Ancol", "Pademangan", "Tanjung Priok"],
    "jakarta timur": ["Rawamangun", "Jatinegara", "Duren Sawit", "Cakung", "Ciracas", "Cipayung", "Matraman", "Pasar Rebo"],
    "tangerang": ["BSD City", "Gading Serpong", "Alam Sutera", "Karawaci", "Cipondoh", "Cikokol", "Bintaro", "Pamulang"],
    "tangerang selatan": ["Bintaro", "BSD", "Pamulang", "Ciputat", "Serpong Utara", "Setu", "Pondok Aren"],
    "bandung": ["Dago", "Riau", "Buah Batu", "Setiabudi", "Ciumbuleuit", "Dipatiukur", "Antapani", "Cibiru", "Pasteur"],
    "surabaya": ["Surabaya Barat", "Surabaya Pusat", "Surabaya Timur", "Surabaya Selatan", "Gubeng", "Rungkut", "Wonokromo"],
    "bekasi": ["Bekasi Barat", "Bekasi Timur", "Summarecon Bekasi", "Harapan Indah", "Pondok Gede", "Jatiasih"],
    "bogor": ["Bogor Tengah", "Bogor Timur", "Pajajaran", "Suryakencana", "Sentul City", "Cibinong"],
    "depok": ["Margonda", "Cinere", "Sawangan", "Sukmajaya", "Beji", "Cimanggis"],
    "bali": ["Canggu", "Seminyak", "Ubud", "Kuta", "Sanur", "Denpasar", "Uluwatu", "Jimbaran"],
    "yogyakarta": ["Malioboro", "Kaliurang", "Seturan", "Gejayan", "Prawirotaman", "Kotagede", "Sleman", "Bantul"],
    "semarang": ["Semarang Tengah", "Tembalang", "Simpang Lima", "Banyumanik", "Gajahmungkur", "Ngaliyan"],
    "malang": ["Klojen", "Lowokwaru", "Sukun", "Blimbing", "Kedungkandang", "Soekarno Hatta", "Batu"],
    "medan": ["Medan Barat", "Medan Kota", "Medan Baru", "Medan Petisah", "Medan Sunggal", "Medan Selayang"],
    "makassar": ["Panakkukang", "Ujung Pandang", "Tamalanrea", "Rappocini", "Mariso", "Bontoala"]
  };

  function resolveGridSubAreas(keyword = "", location = "") {
    const locLower = (location || "").toLowerCase().trim();
    if (!locLower) return [];

    // Special case for generic "jakarta" or "dki jakarta": return all 5 cardinal districts
    if (locLower === "jakarta" || locLower === "dki jakarta") {
      const jakartaDistricts = ["Jakarta Selatan", "Jakarta Pusat", "Jakarta Barat", "Jakarta Utara", "Jakarta Timur"];
      return jakartaDistricts.map(sub => `${keyword} di ${sub}`.trim());
    }

    // Longest-key match: find the most specific key in SUB_AREAS_MAP
    let bestKey = "";
    let bestSubList = null;

    for (const [key, subList] of Object.entries(SUB_AREAS_MAP)) {
      if (locLower === key || locLower.includes(key)) {
        if (key.length > bestKey.length) {
          bestKey = key;
          bestSubList = subList;
        }
      }
    }

    if (bestSubList) {
      return bestSubList.map(sub => `${keyword} di ${sub}, ${location}`.trim());
    }

    // Generic fallback for any other city (cardinal directions)
    return [
      `${keyword} di ${location} Pusat`.trim(),
      `${keyword} di ${location} Selatan`.trim(),
      `${keyword} di ${location} Barat`.trim(),
      `${keyword} di ${location} Timur`.trim(),
      `${keyword} di ${location} Utara`.trim()
    ];
  }

  const exportedSchema = Object.assign({}, sharedSchema, {
    detectWebsiteTech,
    extractEmail,
    resolveGridSubAreas,
    meetsAdvancedFilters,
    escapeCSV: Exporter.escapeCSV,
    // DOM extraction & selector health (diuji dengan fixture HTML Google Maps di test/dom.test.js)
    classifyPhone,
    cleanTitle,
    cleanReviewsCount,
    isInvalidTitle,
    getFeedContainer,
    getBusinessCards,
    extractCardPreview,
    extractDetailData,
    createSelectorHealthMonitor,
    mergeIncomingLeads,
    estimateEta,
    // Background-tab tick clock
    sleep,
    startKeepAlive,
    stopKeepAlive
  });

  if (typeof window !== "undefined") {
    window.PetaKlienSchema = exportedSchema;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = exportedSchema;
  }

  /**
   * Initialize Overlay with hydration from chrome.storage.local + beforeunload guard
   */
  async function startEngine() {
    await hydrateLeads();
    initUI();

    // 1. Beforeunload Confirmation Warning (Protects against accidental refresh/close during active scrape)
    window.addEventListener("beforeunload", (e) => {
      if (currentState === State.RUNNING) {
        e.preventDefault();
        e.returnValue = "Otomasi scraping sedang berjalan. Apakah Anda yakin ingin meninggalkan halaman?";
        return e.returnValue;
      }
    });

    // 2. Tab focus listener: ensures feed scroll sync without interrupting active status
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && currentState === State.RUNNING) {
        triggerFeedScroll();
      }
    });

    // 3. Two-way sync with the report page / popup through chrome.storage (single source of truth)
    if (chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && changes[STORAGE_KEYS.history]) {
          contactHistory = changes[STORAGE_KEYS.history].newValue || {};
        }
        if (area !== "local" || !changes.mapsLeadsData) return;

        // Rows deleted in the report: drop them here first, or the
        // "write newer leads back" safety below would resurrect them
        const deletion = changes[STORAGE_KEYS.deleted] && changes[STORAGE_KEYS.deleted].newValue;
        let dropped = 0;
        if (deletion && Array.isArray(deletion.keys) && deletion.keys.length) {
          const gone = new Set(deletion.keys);
          const before = leads.length;
          leads = leads.filter((l) => !gone.has(leadKey(l)));
          dropped = before - leads.length;
        }

        const incoming = changes.mapsLeadsData.newValue;
        if (!Array.isArray(incoming)) return;

        // Cleared from the popup or the report page
        if (incoming.length === 0) {
          if (leads.length > 0 && currentState !== State.RUNNING) {
            leads = [];
            scannedCount = 0;
            recalculateStats();
            updateUI("Data prospek dibersihkan dari jendela lain");
          }
          return;
        }

        const { changed, missingInIncoming } = mergeIncomingLeads(leads, incoming);
        if (changed || dropped) {
          recalculateStats();
          updateUI();
        }
        // Storage was overwritten with an older snapshot: write our newer leads back
        if (missingInIncoming) persistLeads();
      });
    }
  }

  // Fields the report page / Mini-CRM may edit; merged only when the incoming copy is newer
  const SYNC_FIELDS = ["outreachStatus", "websiteStatus", "websiteUrl", "socialUrl", "email", "techStack", "deepSearchFailed", "statusChangedAt", "note"];

  /**
   * Merges edits made elsewhere (report page) into the in-memory leads (mutates `local`).
   * Uses `updatedAt` so a stale snapshot can never revert a newer edit.
   */
  function mergeIncomingLeads(local, incoming) {
    const byKey = new Map(incoming.map((l) => [leadKey(l), l]));
    let changed = false;
    for (const l of local) {
      const inc = byKey.get(leadKey(l));
      if (!inc || (inc.updatedAt || 0) <= (l.updatedAt || 0)) continue;
      for (const f of SYNC_FIELDS) {
        if (inc[f] !== undefined && inc[f] !== l[f]) {
          l[f] = inc[f];
          changed = true;
        }
      }
      l.updatedAt = inc.updatedAt;
    }
    const localKeys = new Set(local.map((l) => leadKey(l)));
    let added = 0;
    for (const inc of incoming) {
      if (!localKeys.has(leadKey(inc))) {
        local.push(Object.assign({}, inc));
        added++;
      }
    }
    if (added) {
      changed = true;
      // follow the storage order (e.g. rows restored in place by the report's undo)
      const order = new Map(incoming.map((l, i) => [leadKey(l), i]));
      local.sort((a, b) => (order.has(leadKey(a)) ? order.get(leadKey(a)) : Infinity) - (order.has(leadKey(b)) ? order.get(leadKey(b)) : Infinity));
    }
    const missingInIncoming = local.some((l) => !byKey.has(leadKey(l)));
    return { changed, missingInIncoming, added };
  }

  // place key -> { s: status, t: time, n: title }; written by the report page
  let contactHistory = {};

  function hydrateLeads() {
    return new Promise((resolve) => {
      if (chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(["mapsLeadsData", STORAGE_KEYS.history], (res) => {
          if (chrome.runtime.lastError) {
            console.warn("PetaKlien: Gagal membaca data tersimpan dari storage", chrome.runtime.lastError);
          }
          contactHistory = (res && res[STORAGE_KEYS.history]) || {};
          if (res && Array.isArray(res.mapsLeadsData) && res.mapsLeadsData.length > 0) {
            leads = res.mapsLeadsData;
            leads.forEach((l) => {
              if (!l.placeId) l.placeId = extractPlaceId(l.mapsUrl);
            });
            recalculateStats();
          } else {
            leads = [];
            scannedCount = 0;
            recalculateStats();
          }
          resolve(leads.length);
        });
      } else {
        leads = [];
        scannedCount = 0;
        recalculateStats();
        resolve(0);
      }
    });
  }

  function initUI() {
    window.PetaKlienOverlay.init({
      onStart: handleStart,
      onPause: handlePause,
      onResume: handleResume,
      onStop: handleStop,
      onExportXLSX: handleExportXLSX,
      onExportCSV: handleExportCSV,
      onClear: handleClear,
      onRestore: handleRestore,
      onBatchDeepSearch: handleBatchDeepSearch
    });

    updateUI();
  }

  /**
   * Recalculate counter numbers from current leads array using unified statusKind
   */
  function recalculateStats() {
    processedIds.clear();
    leads.forEach((l) => {
      processedIds.add(leadKey(l));
    });

    const c = countLeads(leads);
    noWebCount = c.none;
    socialCount = c.social;
    hasWebCount = c.web;
  }

  // #9: time-to-target estimate from this run's own pace
  let runStartedAt = 0;
  let leadsAtRunStart = 0;

  function markRunStart() {
    runStartedAt = Date.now();
    leadsAtRunStart = leads.length;
  }

  /**
   * Pure ETA: time per lead found so far x leads still needed.
   * Needs at least one lead and a few seconds of data; null means "still estimating".
   */
  function estimateEta({ gained, elapsedMs, remaining }) {
    if (!(remaining > 0)) return remaining === 0 ? 0 : null;
    if (gained < 1 || elapsedMs < 8000) return null;
    return Math.round((elapsedMs / gained) * remaining);
  }

  function estimateRemainingMs() {
    if (currentState !== State.RUNNING || !runStartedAt || !(config.limit > 0) || config.limit >= 999999) return null;
    return estimateEta({
      gained: leads.length - leadsAtRunStart,
      elapsedMs: Date.now() - runStartedAt,
      remaining: config.limit - leads.length
    });
  }

  function updateUI(statusMsg = "") {
    if (window.PetaKlienOverlay && window.PetaKlienOverlay.updateState) {
      window.PetaKlienOverlay.updateState(currentState, statusMsg, isBatchDeepSearching);
    }
    if (window.PetaKlienOverlay && window.PetaKlienOverlay.updateStats) {
      window.PetaKlienOverlay.updateStats({
        scannedCount,
        targetLimit: config.limit,
        leads,
        noWebCount,
        socialCount,
        hasWebCount,
        etaMs: estimateRemainingMs(),
        elapsedMs: currentState === State.RUNNING && runStartedAt ? Date.now() - runStartedAt : 0
      });
    }
  }

  let persistTimer = null;
  function persistLeads() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      if (chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ mapsLeadsData: leads }, () => {
          if (chrome.runtime.lastError) {
            console.warn("PetaKlien: Gagal menyimpan data ke storage", chrome.runtime.lastError);
            if (window.PetaKlienOverlay && window.PetaKlienOverlay.showAlert) {
              window.PetaKlienOverlay.showAlert(
                "Penyimpanan Penuh",
                `Gagal menyimpan otomatis (${chrome.runtime.lastError.message}). Disarankan segera unduh file Excel (.xlsx).`,
                "PERHATIAN"
              );
            }
          }
        });
      }
    }, 300);
  }

  // --- Automation Control Handlers ---

  /**
   * Automatically type search query into Google Maps search box and execute search
   */
  async function triggerGoogleMapsSearch(query) {
    if (!query || !query.trim()) return true;
    query = query.trim();

    updateUI(`Mengetik pencarian "${query}" di Google Maps...`);

    const searchInput = document.querySelector(
      'input#searchboxinput, input.searchboxinput, input[name="q"], input#searchbox'
    );

    if (searchInput) {
      searchInput.focus();
      searchInput.value = query;
      searchInput.dispatchEvent(new Event("input", { bubbles: true }));
      searchInput.dispatchEvent(new Event("change", { bubbles: true }));

      const searchBtn = document.querySelector(
        'button#searchbox-searchbutton, button[aria-label*="Telusuri"], button[aria-label*="Search"], button[jsaction*="search"]'
      );

      if (searchBtn) {
        searchBtn.click();
      } else {
        searchInput.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Enter",
            code: "Enter",
            keyCode: 13,
            which: 13,
            bubbles: true
          })
        );
      }

      // Wait for Google Maps to reload search results
      await sleep(2500);

      // Wait until cards appear
      for (let i = 0; i < 10; i++) {
        const feed = getFeedContainer();
        const cards = getBusinessCards();
        if (feed && cards.length > 0) break;
        await sleep(500);
      }
      return true;
    } else {
      // Fallback: If input not found, navigate via URL query
      window.location.href = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
      return false;
    }
  }

  let deepSearchGuard = createDeepSearchGuard();

  /** Desktop notification when a long run ends while the Maps tab is in the background. */
  function notifyIfHidden(title, message) {
    if (typeof document === "undefined" || !document.hidden) return;
    try {
      chrome.runtime.sendMessage({ type: "NOTIFY", title, message });
    } catch (e) {}
  }

  /**
   * Tells the user Deep Search was switched off because Google refused it, instead of
   * silently recording unchecked places as "no website".
   */
  function warnDeepSearchStopped(reason, uncheckedCount, duringRun) {
    const cause = reason === "blocked"
      ? "Google meminta verifikasi CAPTCHA / membatasi pencarian otomatis."
      : "Pencarian Google gagal beberapa kali berturut-turut (koneksi atau server).";
    const next = duringRun
      ? "Otomasi tetap berjalan tanpa Deep Search."
      : "Deep Search massal dihentikan.";
    updateUI("Deep Search dihentikan: Google membatasi pencarian");
    if (window.PetaKlienOverlay && window.PetaKlienOverlay.showAlert) {
      window.PetaKlienOverlay.showAlert(
        "Deep Search dihentikan",
        `<p>${cause} ${next}</p>
<dl class="petaklien-summary">
  <div><dt>Ditandai "Belum dicek"</dt><dd>${uncheckedCount}</dd></div>
</dl>
<p>Tunggu beberapa menit, lalu jalankan <strong>Lacak Deep Search</strong> dari tab Manifest untuk mengecek ulang.</p>`,
        "PERHATIAN"
      );
    }
  }

  async function handleStart(settings) {
    startKeepAlive();
    config.filter = settings.filter;
    config.limit = settings.limit;
    config.enableDeepSearch = settings.enableDeepSearch !== false;
    deepSearchGuard = createDeepSearchGuard();
    config.advanced = settings.advanced || {};
    config.gridScan = settings.gridScan || false;

    if (settings.resetBeforeStart) {
      leads = [];
      scannedCount = 0;
      currentCardIndex = 0;
      recalculateStats();
      persistLeads();
      updateUI("Memulai sesi pencarian baru dari nol...");
    }

    currentState = State.RUNNING;
    markRunStart();

    if (settings.gridScan && settings.keyword && settings.location) {
      isGridScanning = true;
      gridScanQueue = resolveGridSubAreas(settings.keyword, settings.location);
      if (gridScanQueue.length > 0) {
        const firstArea = gridScanQueue.shift();
        updateUI(`🌐 Mode Grid Scan: Mencari sub-wilayah 1 (${firstArea})...`);
        await triggerGoogleMapsSearch(firstArea);
      } else if (settings.query && settings.query.trim()) {
        await triggerGoogleMapsSearch(settings.query);
      }
    } else {
      isGridScanning = false;
      gridScanQueue = [];
      if (settings.query && settings.query.trim()) {
        updateUI(`Mencari "${settings.query}"...`);
        await triggerGoogleMapsSearch(settings.query);
      }
    }

    updateUI("Mempersiapkan otomasi Google Maps...");
    runAutomationLoop();
  }

  function handlePause() {
    stopKeepAlive();
    currentState = State.PAUSED;
    updateUI("Otomasi dijeda (Paused)");
  }

  function handleResume() {
    startKeepAlive();
    currentState = State.RUNNING;
    markRunStart();
    updateUI("Melanjutkan otomasi...");
    runAutomationLoop();
  }

  function handleStop() {
    stopKeepAlive();
    currentState = State.STOPPED;
    isGridScanning = false;
    gridScanQueue = [];
    updateUI("Otomasi dihentikan");
  }

  /**
   * Clearing keeps a backup so the user can undo (toast) or restore later.
   * Returns the number of leads that were backed up.
   */
  function handleClear() {
    const backedUp = leads.length;
    if (backedUp > 0) {
      try {
        chrome.storage.local.set({ [STORAGE_KEYS.backup]: { leads, at: Date.now() } });
      } catch (e) {}
    }
    leads = [];
    scannedCount = 0;
    currentCardIndex = 0;
    isGridScanning = false;
    gridScanQueue = [];
    recalculateStats();
    persistLeads();
    updateUI("Data prospek berhasil dibersihkan");
    return backedUp;
  }

  /** Puts the last cleared leads back (merged with anything collected since). */
  function handleRestore() {
    return new Promise((resolve) => {
      chrome.storage.local.get([STORAGE_KEYS.backup], (res) => {
        const backup = res && res[STORAGE_KEYS.backup];
        if (!backup || !Array.isArray(backup.leads) || backup.leads.length === 0) return resolve(0);
        const known = new Set(leads.map((l) => leadKey(l)));
        const restored = backup.leads.filter((l) => !known.has(leadKey(l)));
        leads = restored.concat(leads);
        recalculateStats();
        persistLeads();
        chrome.storage.local.remove(STORAGE_KEYS.backup);
        updateUI(`${restored.length} prospek dipulihkan`);
        resolve(restored.length);
      });
    });
  }

  let isBatchDeepSearching = false;

  /**
   * Batch Deep Search on all currently collected unlisted leads in Manifest
   */
  async function handleBatchDeepSearch() {
    if (isBatchDeepSearching) return;
    if (leads.length === 0) {
      if (window.PetaKlienOverlay && window.PetaKlienOverlay.showAlert) {
        window.PetaKlienOverlay.showAlert("Manifest Kosong", "Belum ada data prospek di Buku Manifest untuk dilacak!", "INFO");
      }
      return;
    }

    const unlistedLeads = leads.filter(
      (l) => statusKind(l.websiteStatus) !== "web" || !l.email || l.email === "-" || !l.techStack || l.techStack === "-"
    );

    if (unlistedLeads.length === 0) {
      if (window.PetaKlienOverlay && window.PetaKlienOverlay.showAlert) {
        window.PetaKlienOverlay.showAlert("Pemeriksaan Selesai", "Semua data di Buku Manifest sudah terverifikasi memiliki website resmi mandiri dan kontak lengkap!", "SUKSES");
      }
      return;
    }

    isBatchDeepSearching = true;
    startKeepAlive();
    updateUI(`Memulai Deep Search untuk ${unlistedLeads.length} data...`);
    let foundCount = 0;
    let checkedCount = 0;
    let stoppedReason = null;
    const batchGuard = createDeepSearchGuard();

    try {
      for (let i = 0; i < unlistedLeads.length; i++) {
        if (!isBatchDeepSearching) break;
        const lead = unlistedLeads[i];
        updateUI(`Deep Search (${i + 1}/${unlistedLeads.length}): Memeriksa "${lead.title}"...`);

        const existingLink = (lead.websiteUrl && lead.websiteUrl !== "-") ? lead.websiteUrl : (lead.socialUrl || "");
        const deepRes = await performAutoDeepSearch(lead.title, lead.address, lead.websiteStatus, existingLink);
        if (applyDeepSearchResult(lead, deepRes, statusKind)) foundCount++;
        if (deepRes && !deepRes.failed) checkedCount++;
        lead.updatedAt = Date.now();
        stoppedReason = batchGuard.record(deepRes);
        if (stoppedReason) break;

        recalculateStats();
        persistLeads();
        updateUI();

        await sleep(getRandomDelay(700, 1300));
      }
    } finally {
      isBatchDeepSearching = false;
      stopKeepAlive();
      recalculateStats();
      persistLeads();
      updateUI(`Deep Search selesai! Berhasil memperkaya ${foundCount} dari ${unlistedLeads.length} data.`);
    }

    if (stoppedReason) {
      warnDeepSearchStopped(stoppedReason, leads.filter((l) => l.deepSearchFailed).length, false);
      notifyIfHidden("Deep Search dihentikan", "Google membatasi pencarian otomatis. Coba lagi beberapa menit lagi.");
      return;
    }
    notifyIfHidden("Deep Search selesai", `${checkedCount} data diperiksa, ${foundCount} website resmi ditemukan.`);

    if (window.PetaKlienOverlay && window.PetaKlienOverlay.showAlert) {
      window.PetaKlienOverlay.showAlert(
        "Deep Search Selesai",
        `<p>Pemeriksaan Google Search pada data manifest selesai.</p>
<dl class="petaklien-summary">
  <div><dt>Total diperiksa</dt><dd>${checkedCount}</dd></div>
  <div><dt>Web resmi ditemukan</dt><dd class="is-signal-text">+${foundCount}</dd></div>
  <div><dt>Tetap tanpa web / medsos</dt><dd>${checkedCount - foundCount}</dd></div>
</dl>`,
        "SUKSES"
      );
    }
  }

  // --- Google Maps Automation Engine ---

  /**
   * Finds the Google Maps search results feed container
   */
  function getFeedContainer() {
    return (
      document.querySelector('div[role="feed"]') ||
      document.querySelector('div[aria-label*="Results for" i]') ||
      document.querySelector('div[aria-label*="Hasil untuk" i]') ||
      document.querySelector(".m6QErb.DxyBCb.kA9KIf.dS8AEf.ecceSd")
    );
  }

  /**
   * Gets all business / entity card wrappers currently rendered in feed
   */
  function getBusinessCards() {
    const feed = getFeedContainer();
    if (!feed) return [];

    // 1. Preferred: Card container div.Nv2PK
    const cards = Array.from(feed.querySelectorAll("div.Nv2PK"));
    if (cards.length > 0) return cards;

    // 2. Direct card links
    const links = Array.from(feed.querySelectorAll("a.hfpxzc"));
    if (links.length > 0) return links;

    // 3. Articles
    const articles = Array.from(feed.querySelectorAll('div[role="article"]'));
    if (articles.length > 0) return articles;

    return [];
  }

  /**
   * Robust feed scroll trigger using multiple fallback strategies
   */
  function triggerFeedScroll() {
    const feed = getFeedContainer();
    if (!feed) return;

    feed.scrollTop = feed.scrollHeight;
    feed.scrollBy(0, 2000);

    // Dispatch synthetic scroll and wheel events to wake up throttled background tabs
    feed.dispatchEvent(new Event("scroll", { bubbles: true }));
    try {
      feed.dispatchEvent(new WheelEvent("wheel", { deltaY: 1500, bubbles: true }));
    } catch (e) {}

    const lastCard = feed.querySelector("div.Nv2PK:last-child, a.hfpxzc:last-child");
    if (lastCard) {
      lastCard.scrollIntoView({ behavior: "auto", block: "end" });
    }

    // Try clicking "Search this area" if Google Maps ran out of immediate local results
    const searchThisAreaBtn = document.querySelector(
      'button[aria-label*="Telusuri area ini" i], button[aria-label*="Search this area" i], button.D6DuBc, button[jsaction*="searchThisArea" i]'
    );
    if (searchThisAreaBtn && searchThisAreaBtn.offsetParent !== null) {
      searchThisAreaBtn.click();
    }
  }

  /**
   * Helper to check if a title string is invalid (e.g. Google Maps UI headers)
   */
  function isInvalidTitle(str) {
    if (!str) return true;
    const s = str.trim().toLowerCase();
    return (
      s === "hasil" ||
      s === "results" ||
      s.startsWith("hasil untuk") ||
      s.startsWith("results for") ||
      s.startsWith("telusuri") ||
      s === "semua" ||
      s === "filter" ||
      s === "tutup" ||
      s === "rute" ||
      s === "simpan" ||
      s === "bagikan" ||
      s.includes("perbarui hasil") ||
      s.includes("peta digeser")
    );
  }

  /**
   * Helper to clean sponsored/ad prefixes and artifacts from place title
   */
  function cleanTitle(str) {
    if (!str) return "";
    return str
      .replace(/^Bersponsor[\s·•\-\s]*/i, "")
      .replace(/^Sponsored[\s·•\-\s]*/i, "")
      .replace(/^Iklan[\s·•\-\s]*/i, "")
      .replace(/^Ad[\s·•\-\s]*/i, "")
      .replace(/[\u2022\u00B7\u25A0\u25A1\uFFFD]/g, "")
      .trim();
  }

  /**
   * Helper to clean reviews count from contaminated rating numbers
   */
  function cleanReviewsCount(str, rating) {
    if (!str) return "0";
    let cleaned = str.replace(/[()]/g, "").trim();
    if (rating && cleaned.startsWith(rating)) {
      cleaned = cleaned.substring(rating.length).trim();
    }
    cleaned = cleaned.replace(/[^0-9]/g, "");
    return cleaned || "0";
  }

  /**
   * Helper to check if entity is permanently or temporarily closed
   */
  function isPermanentlyClosed(card, detailContainer) {
    const text = ((card ? card.innerText : "") + " " + (detailContainer ? detailContainer.innerText : "")).toLowerCase();
    return (
      text.includes("tutup permanen") ||
      text.includes("permanently closed") ||
      text.includes("tutup sementara") ||
      text.includes("temporarily closed")
    );
  }

  /**
   * Helper to classify phone number (WhatsApp mobile vs Landline office)
   */
  function classifyPhone(rawPhone) {
    if (!rawPhone || rawPhone === "-") {
      return { phone: "-", rawNumber: "", isMobile: false, phoneType: "-", waUrl: "-" };
    }
    const digits = rawPhone.replace(/[^0-9]/g, "");
    let waDigits = "";
    let isMobile = false;
    let phoneType = "Telepon Kantor / PSTN";

    if (digits.startsWith("08") || digits.startsWith("628")) {
      isMobile = true;
      phoneType = "Seluler (WhatsApp)";
      waDigits = digits.startsWith("0") ? "62" + digits.slice(1) : digits;
    } else if (rawPhone.startsWith("+628")) {
      isMobile = true;
      phoneType = "Seluler (WhatsApp)";
      waDigits = digits;
    }

    const waUrl = isMobile && waDigits ? `https://wa.me/${waDigits}` : "-";
    return {
      phone: rawPhone,
      rawNumber: digits,
      isMobile,
      phoneType,
      waUrl
    };
  }

  /**
   * Helper to check if a category string is invalid (e.g. Map UI controls)
   */
  function isInvalidCategory(str) {
    if (!str) return true;
    const s = str.trim().toLowerCase();
    return (
      s.includes("perbarui hasil") ||
      s.includes("peta digeser") ||
      s.includes("saat peta") ||
      s.includes("search this area") ||
      s.includes("update results") ||
      s.includes("telusuri area") ||
      s.includes("semua") ||
      s.includes("filter") ||
      s.includes("tutup") ||
      s.includes("buka") ||
      s.includes("rute") ||
      s.includes("simpan") ||
      s.includes("bagikan") ||
      s.includes("ulasan") ||
      s.includes("review") ||
      s.includes("hasil") ||
      /^[\d.,\s★()]+$/.test(s)
    );
  }

  /**
   * Smart fallback to infer category from business / entity title
   */
  function inferCategoryFromTitle(title) {
    if (!title) return "Instansi / Tempat";
    const t = title.toLowerCase();
    if (t.includes("sdn") || t.includes("sekolah dasar") || t.includes(" sds ") || t.includes("sd ")) return "Sekolah Dasar (SD)";
    if (t.includes("smpn") || t.includes("sekolah menengah pertama") || t.includes("smp ")) return "Sekolah Menengah Pertama (SMP)";
    if (t.includes("sman") || t.includes("sekolah menengah atas") || t.includes("sma ") || t.includes("smk ") || t.includes("smkn")) return "Sekolah Menengah Atas (SMA/SMK)";
    if (t.includes("tk ") || t.includes("taman kanak-kanak") || t.includes("paud")) return "Taman Kanak-Kanak (TK/PAUD)";
    if (t.includes("universitas") || t.includes("institut") || t.includes("politeknik") || t.includes("stie") || t.includes("stikom") || t.includes("sekolah tinggi")) return "Perguruan Tinggi / Universitas";
    if (t.includes("bimbel") || t.includes("kursus") || t.includes("les ")) return "Bimbingan Belajar / Kursus";
    if (t.includes("klinik") || t.includes("puskesmas") || t.includes("dental") || t.includes("dr.") || t.includes("dokter")) return "Klinik / Fasilitas Kesehatan";
    if (t.includes("rumah sakit") || t.includes("rsud") || t.includes(" rs ")) return "Rumah Sakit";
    if (t.includes("bengkel")) return "Bengkel Kendaraan";
    if (t.includes("cafe") || t.includes("kafe") || t.includes("coffee") || t.includes("kopi")) return "Kafe / Kedai Kopi";
    if (t.includes("restoran") || t.includes("resto") || t.includes("warung") || t.includes("rumah makan")) return "Restoran / Kuliner";
    if (t.includes("salon") || t.includes("barbershop") || t.includes("barber")) return "Salon & Barbershop";
    if (t.includes("notaris") || t.includes("ppat")) return "Kantor Notaris / PPAT";
    if (t.includes("toko") || t.includes("mart") || t.includes("shop") || t.includes("boutique")) return "Toko / Retail";
    return "Instansi / Tempat";
  }

  /**
   * Extracts initial preview data directly from the card element
   */
  function extractCardPreview(card) {
    let title = "";
    let category = "";
    let rating = "";
    let reviewsCount = "";
    let websiteUrl = "";
    let mapsUrl = "";
    let addressSnippet = "";

    // 1. Title & Maps URL from a.hfpxzc
    const linkEl = card.tagName === "A" ? card : card.querySelector("a.hfpxzc");
    if (linkEl) {
      title = cleanTitle((linkEl.getAttribute("aria-label") || "").trim());
      mapsUrl = linkEl.href || "";
    }

    if (!title || isInvalidTitle(title)) {
      const titleEl = card.querySelector(".qBF1Pd, .fontHeadlineSmall");
      if (titleEl) {
        const text = cleanTitle(titleEl.textContent.trim());
        if (!isInvalidTitle(text)) title = text;
      }
    }

    // 2. Rating & Reviews
    const ratingEl = card.querySelector("span.MW4etd, .ceNzKf");
    if (ratingEl) {
      rating = ratingEl.textContent.trim();
    }

    const reviewsEl = card.querySelector("span.UY7F9");
    if (reviewsEl) {
      reviewsCount = cleanReviewsCount(reviewsEl.textContent, rating);
    }

    // 3. Website button on card (Strict selector, never generic action class)
    const webEl = card.querySelector(
      'a[data-value="Situs Web"], a[data-value="Website"], a[aria-label*="Situs Web" i], a[aria-label*="Website" i]'
    );
    if (webEl && webEl.href) {
      const rawHref = webEl.href.trim();
      if (
        !rawHref.includes("google.com/maps") &&
        !rawHref.includes("google.co.id/maps") &&
        !rawHref.includes("javascript:")
      ) {
        websiteUrl = rawHref;
      }
    }

    // 4. Category & Address Snippet from .W4Efsd text rows
    const textRows = Array.from(card.querySelectorAll(".W4Efsd"));
    for (const row of textRows) {
      const text = row.textContent.trim();
      if (!text) continue;

      const parts = text.split("·").map((p) => p.trim());
      for (const part of parts) {
        // Skip invalid category patterns (e.g. Map UI controls)
        if (isInvalidCategory(part)) continue;
        // Skip ratings / review numbers e.g. "4,7(1.505)"
        if (/^[\d.,\s★()]+$/.test(part)) continue;
        // Skip open/close hours
        if (/^(buka|tutup|open|closed|buka 24 jam)/i.test(part)) continue;
        // Skip price range e.g. "Rp 25.000–50.000" or "$$"
        if (/^(Rp|\$|\€|IDR)/i.test(part)) continue;

        if (
          !category &&
          part.length < 40 &&
          !part.toLowerCase().startsWith("jl.") &&
          !part.toLowerCase().startsWith("jalan") &&
          !part.toLowerCase().startsWith("gg.")
        ) {
          category = part;
        } else if (!addressSnippet && (part.toLowerCase().startsWith("jl.") || part.toLowerCase().startsWith("jalan") || part.length > 10)) {
          addressSnippet = part;
        }
      }
    }

    return {
      title: isInvalidTitle(title) ? "" : title,
      category: category || "",
      rating: rating || "-",
      reviewsCount: reviewsCount || "0",
      websiteUrl: websiteUrl || "",
      mapsUrl: mapsUrl || "",
      addressSnippet: addressSnippet || ""
    };
  }

  /**
   * Main Automation Loop (Resilient to background tab throttling)
   */
  async function runAutomationLoop() {
    let scrollAttempts = 0;
    const maxScrollAttempts = 25; // Much higher retry limit so background tabs don't prematurely abort
    let lastCardsCount = 0;
    const health = createSelectorHealthMonitor({ threshold: 5, onUnhealthy: warnSelectorBroken });

    while (currentState === State.RUNNING && leads.length < config.limit) {
      if (currentState === State.PAUSED || currentState === State.STOPPED) break;

      const feed = getFeedContainer();
      if (!feed) {
        updateUI("Silakan cari lokasi/kata kunci di Google Maps terlebih dahulu!");
        currentState = State.STOPPED;
        updateUI();
        break;
      }

      const cards = getBusinessCards();

      // If we processed all currently loaded cards, scroll down to load more
      if (currentCardIndex >= cards.length) {
        const isBg = document.hidden;
        updateUI(isBg ? "Memuat data di background..." : "Memuat lebih banyak hasil...");

        triggerFeedScroll();

        // If tab is in background, wait slightly longer to give Chrome's throttled DOM time to render
        const waitTime = isBg ? getRandomDelay(3000, 4500) : getRandomDelay(1800, 2800);
        await sleep(waitTime);

        const updatedCards = getBusinessCards();
        if (updatedCards.length === lastCardsCount) {
          scrollAttempts++;
          triggerFeedScroll();

          // Try clicking "Telusuri area ini" / "Search this area" to expand search
          const searchThisAreaBtn = document.querySelector(
            'button[aria-label*="Telusuri area ini" i], button[aria-label*="Search this area" i], button.D6DuBc, button[jsaction*="searchThisArea" i]'
          );
          if (searchThisAreaBtn && searchThisAreaBtn.offsetParent !== null) {
            updateUI("Memperluas penelusuran ke area sekitar...");
            searchThisAreaBtn.click();
            await sleep(3500);
            scrollAttempts = 0;
            continue;
          }

          // Check if explicit Google Maps end notice is visible
          const endNotice = document.querySelector(".HlvSq, div.m6QErb[aria-label*='akhir' i], div[aria-label*='end of' i]");
          const endTextFound = endNotice || (feed.innerText && feed.innerText.includes("Anda telah mencapai akhir daftar"));

          if (endTextFound || scrollAttempts >= maxScrollAttempts) {
            if (isGridScanning && gridScanQueue.length > 0) {
              const nextArea = gridScanQueue.shift();
              updateUI(`🌐 Mode Grid Scan: Melanjutkan ke sub-wilayah (${nextArea}) [Sisa: ${gridScanQueue.length}]...`);
              currentCardIndex = 0;
              scrollAttempts = 0;
              lastCardsCount = 0;
              await triggerGoogleMapsSearch(nextArea);
              await sleep(3000);
              continue;
            }

            updateUI(`Selesai: Semua ${scannedCount} tempat telah dipindai (${leads.length} prospek cocok).`);
            notifyIfHidden("Pemindaian selesai", `${leads.length} prospek terkumpul dari ${scannedCount} tempat yang dipindai.`);
            currentState = State.STOPPED;
            updateUI();
            break;
          }
        } else {
          // Reset scroll attempts as soon as new cards appear
          scrollAttempts = 0;
          lastCardsCount = updatedCards.length;
        }

        continue;
      }

      const card = cards[currentCardIndex];
      currentCardIndex++;
      scannedCount++;

      // Scroll card into view immediately (auto behavior avoids background tab rAF throttling)
      try {
        card.scrollIntoView({ behavior: "auto", block: "center" });
      } catch (e) {}
      await sleep(getRandomDelay(250, 450));

      if (currentState !== State.RUNNING) break;

      // Extract card preview first
      const cardData = extractCardPreview(card);
      health.record("cardTitle", !!cardData.title);
      if (currentState !== State.RUNNING) break;
      const displayTitle = cardData.title || `Item #${scannedCount}`;
      updateUI(`Memeriksa: ${displayTitle}`);

      // Click card to open detail panel with full event emulation
      try {
        const clickTarget = card.querySelector("a.hfpxzc") || (card.tagName === "A" ? card : card);
        if (clickTarget) {
          try { clickTarget.focus(); } catch(e) {}
          clickTarget.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, view: window }));
          clickTarget.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
          clickTarget.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true, view: window }));
          clickTarget.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
          clickTarget.click();
        }
      } catch (err) {
        console.warn("PetaKlien: Click card error", err);
      }

      // Wait for detail panel to load (dynamic polling for high responsiveness)
      const maxWait = document.hidden ? 2800 : getRandomDelay(config.minDelay, config.maxDelay);
      const pollStart = Date.now();
      let detailFound = false;
      while (Date.now() - pollStart < maxWait) {
        const detailTitleEl = queryFirst("detailTitle");
        if (detailTitleEl && detailTitleEl.textContent.trim()) {
          detailFound = true;
          // Extra short buffer to ensure info buttons/fields are rendered
          await sleep(400);
          break;
        }
        await sleep(200);
      }
      health.record("detailTitle", detailFound);

      if (currentState !== State.RUNNING) break;

      // Extract complete data
      const detailData = extractDetailData(cardData, card);

      if (detailData && detailData.isClosed) {
        updateUI(`Dilewati: ${detailData.title} (Tutup Permanen)`);
        continue;
      }

      if (detailData && detailData.title && !isInvalidTitle(detailData.title)) {
        // Automatic Deep Search for places without website, only social, OR places with website needing techStack/email enrichment
        const needsEnrichment = (!detailData.email || detailData.email === "-") || (!detailData.techStack || detailData.techStack === "-");
        const hasWebsite = detailData.websiteUrl && detailData.websiteUrl !== "-";
        const shouldDeepSearch = (
          detailData.websiteStatus === "Tidak Ada Website" ||
          detailData.websiteStatus.includes("Hanya Medsos") ||
          (hasWebsite && needsEnrichment)
        ) && config.enableDeepSearch !== false;

        if (shouldDeepSearch) {
          updateUI(`Deep Search Google: Memeriksa "${detailData.title}"...`);
          const existingLink = hasWebsite ? detailData.websiteUrl : (detailData.socialUrl || "");
          const deepRes = await performAutoDeepSearch(detailData.title, detailData.address, detailData.websiteStatus, existingLink);
          applyDeepSearchResult(detailData, deepRes, statusKind);
          const tripped = deepSearchGuard.record(deepRes);
          if (tripped) {
            config.enableDeepSearch = false;
            const pendingCount = leads.filter((l) => l.deepSearchFailed).length + 1;
            warnDeepSearchStopped(tripped, pendingCount, true);
            notifyIfHidden("Deep Search dihentikan", "Google membatasi pencarian otomatis. Pemindaian tetap berjalan tanpa Deep Search.");
          }
        }

        const uniqueId = leadKey(detailData);

        if (!processedIds.has(uniqueId)) {
          processedIds.add(uniqueId);

          const webStatus = detailData.websiteStatus;
          let shouldAdd = false;

          if (config.filter === "all") {
            shouldAdd = true;
          } else if (config.filter === "no_website_only") {
            shouldAdd = webStatus === "Tidak Ada Website" || webStatus.startsWith("Tidak Ada") || webStatus.startsWith("Tanpa Web");
          } else if (config.filter === "no_website_and_social") {
            shouldAdd = webStatus === "Tidak Ada Website" || webStatus.startsWith("Tidak Ada") || webStatus.startsWith("Tanpa Web") || webStatus.includes("Hanya Medsos");
          }

          // Evaluate Advanced Filter Criteria
          const advCheck = meetsAdvancedFilters(detailData, config.advanced);
          if (!advCheck.pass) {
            shouldAdd = false;
          }

          if (webStatus === "Tidak Ada Website" || webStatus.startsWith("Tidak Ada") || webStatus.startsWith("Tanpa Web")) noWebCount++;
          else if (webStatus.includes("Hanya Medsos")) socialCount++;
          else hasWebCount++;

          if (shouldAdd) {
            applyContactHistory(detailData, contactHistory);
            leads.push(detailData);
            persistLeads();
            updateUI(`Ditemukan: ${detailData.title} (${webStatus})`);
          } else {
            const skipReason = !advCheck.pass ? `Filter: ${advCheck.reason}` : webStatus;
            updateUI(`Dilewati: ${detailData.title} (${skipReason})`);
          }
        }
      }

      // Human jitter delay before next item
      await sleep(getRandomDelay(600, 1400));
    }

    if (currentState === State.RUNNING) {
      currentState = State.IDLE;
      updateUI(`Selesai! Berhasil mengumpulkan ${leads.length} prospek.`);
      notifyIfHidden("Target tercapai", `${leads.length} prospek terkumpul dari ${scannedCount} tempat yang dipindai.`);
    }

    stopKeepAlive();
  }

  /**
   * Returns the first element matching the selectors in *priority* order.
   * (querySelector("a, b") returns whichever comes first in the document, not the preferred one.)
   */
  function pickFirst(root, selectors) {
    for (const sel of selectors) {
      const el = root.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  /**
   * Extract comprehensive entity data from Google Maps Detail Panel + Card
   */
  function extractDetailData(cardData, card) {
    let title = cardData.title;

    // 1. Entity / Place / Business Name
    const detailTitleEl = document.querySelector(
      'div[role="main"] h1.DUwDvf, div[role="main"] h1.fontHeadlineLarge, div.lMbq3e h1, h1.DUwDvf'
    );
    if (detailTitleEl) {
      const dTitle = cleanTitle(detailTitleEl.textContent.trim());
      if (dTitle && !isInvalidTitle(dTitle)) {
        title = dTitle;
      }
    }

    if (!title || isInvalidTitle(title)) {
      title = cleanTitle(cardData.title);
    }
    if (!title || isInvalidTitle(title)) return null;

    // All detail lookups are scoped to the detail panel. Document-wide queries used to hit the
    // results feed (same .m6QErb class, card review labels, card "Situs Web" buttons) and leak
    // another place's data into this lead.
    const detailMain = (detailTitleEl && detailTitleEl.closest('div[role="main"]')) || document.querySelector('div[role="main"]');
    const scope = detailMain || document;

    // Check if permanently or temporarily closed
    if (isPermanentlyClosed(card, detailMain)) {
      return { isClosed: true, title };
    }

    // 2. Category / Niche / Type (Strictly scoped inside detail panel)
    let category = cardData.category;
    if (isInvalidCategory(category)) category = "";

    if (detailMain) {
      const detailCatEl = detailMain.querySelector(
        'button[jsaction*="category"], button.DkEaL, div.lMbq3e button.DkEaL, div.fontBodyMedium button.DkEaL'
      );
      if (detailCatEl) {
        const dCat = detailCatEl.textContent.trim();
        if (dCat && !isInvalidCategory(dCat)) {
          category = dCat;
        }
      }
    }

    // Smart fallback if category is missing or invalid
    if (!category || isInvalidCategory(category)) {
      category = inferCategoryFromTitle(title);
    }

    // 3. Rating & Reviews
    let rating = cardData.rating;
    const ratingEl = pickFirst(scope, ['div.F7nice span[aria-hidden="true"]', "span.MW4etd", "span.ceNzKf"]);
    if (ratingEl) {
      const rText = ratingEl.textContent.trim();
      if (rText) rating = rText;
    }

    let reviewsCount = cardData.reviewsCount;
    const reviewsEl = pickFirst(scope, [
      'div.F7nice span[role="img"][aria-label*="ulasan" i]',
      'div.F7nice span[role="img"][aria-label*="review" i]',
      "span.UY7F9",
      "div.F7nice > span:last-child"
    ]);
    if (reviewsEl) {
      reviewsCount = cleanReviewsCount(reviewsEl.textContent, rating);
    }

    // 4. Phone Number
    let phone = "";
    const phoneBtn = scope.querySelector(
      'button[data-item-id^="phone:"], button[data-tooltip*="phone" i], button[data-tooltip*="telepon" i], button[aria-label*="Telepon:" i], button[aria-label*="Phone:" i], button[aria-label*="Telepon" i], button[aria-label*="Phone" i]'
    );
    if (phoneBtn) {
      const aria = phoneBtn.getAttribute("aria-label") || "";
      const itemId = phoneBtn.getAttribute("data-item-id") || "";
      const text = phoneBtn.textContent || "";

      if (itemId.startsWith("phone:tel:")) {
        phone = itemId.replace("phone:tel:", "").trim();
      } else if (aria) {
        phone = aria.replace(/^Telepon:\s*/i, "").replace(/^Phone:\s*/i, "").trim();
      } else if (text) {
        phone = text.trim();
      }
    }

    if (!phone) {
      // Regex search in detail container
      if (detailMain) {
        const text = detailMain.innerText || "";
        const phoneMatch = text.match(/(?:\+62|62|08|021|022|031|024|0274)[0-9\s-]{6,16}/);
        if (phoneMatch) {
          phone = phoneMatch[0].trim();
        }
      }
    }

    // 5. Address
    let address = cardData.addressSnippet || "";
    const addressBtn = scope.querySelector(
      'button[data-item-id="address"], button[data-tooltip*="address" i], button[data-tooltip*="alamat" i], button[aria-label*="Alamat:" i], button[aria-label*="Address:" i], button[aria-label*="Alamat" i], button[aria-label*="Address" i]'
    );
    if (addressBtn) {
      const aria = addressBtn.getAttribute("aria-label") || "";
      const text = addressBtn.textContent || "";
      if (aria) {
        address = aria.replace(/^Alamat:\s*/i, "").replace(/^Address:\s*/i, "").trim();
      } else if (text) {
        address = text.replace(/^Alamat:\s*/i, "").trim();
      }
    }

    // 6. Website & Social Media Classification (Separated Fields)
    let rawWebUrl = cardData.websiteUrl || "";
    const webBtn = scope.querySelector(
      'a[data-item-id="authority"], a[data-tooltip*="website" i], a[data-tooltip*="situs web" i], a[aria-label*="Situs Web:" i], a[aria-label*="Website:" i], a[aria-label*="Situs Web" i], a[aria-label*="Website" i]'
    );
    if (webBtn) {
      const href = webBtn.href || webBtn.getAttribute("href") || "";
      if (
        href &&
        !href.includes("google.com/maps") &&
        !href.includes("google.co.id/maps") &&
        !href.includes("javascript:")
      ) {
        rawWebUrl = href.trim();
      }
    }

    let websiteUrl = "-";
    let socialUrl = "-";
    let websiteStatus = "Tidak Ada Website";

    if (rawWebUrl && rawWebUrl !== "-") {
      const lowerUrl = rawWebUrl.toLowerCase();

      // Check if it's Google Business Profile mini-site, redirect, or directory
      const isGooglePlaceholder =
        lowerUrl.includes("business.google.com") ||
        lowerUrl.includes("business.site") ||
        lowerUrl.includes("google.com/business") ||
        lowerUrl.includes("g.page") ||
        lowerUrl.includes("googleadservices.com") ||
        lowerUrl.includes("google.com") ||
        lowerUrl.includes("google.co.id");

      // Check if it's a government directory, wiki, or aggregator site
      const isGovDirectory =
        lowerUrl.includes("kemdikbud.go.id") ||
        lowerUrl.includes("kemdikdasmen.go.id") ||
        lowerUrl.includes("kemenag.go.id") ||
        lowerUrl.includes("wikipedia.org") ||
        lowerUrl.includes("wikimapia.org") ||
        lowerUrl.includes("yellowpages.co.id") ||
        lowerUrl.includes("sekolahterbaikjakarta.com") ||
        lowerUrl.includes("kesekolah.com") ||
        lowerUrl.includes("siap-sekolah.com");

      const isFreeBuilder = FREE_BUILDER_DOMAINS.some((domain) => lowerUrl.includes(domain));

      if (isGooglePlaceholder || isGovDirectory) {
        websiteStatus = "Tidak Ada Website";
        websiteUrl = "-";
        socialUrl = "-";
      } else if (isFreeBuilder && (config.advanced?.treatFreeBuildersAsNoWeb !== false)) {
        websiteStatus = "Tidak Ada Website";
        websiteUrl = "-";
        socialUrl = rawWebUrl;
      } else {
        const isSocial = SOCIAL_DOMAINS.some((domain) => lowerUrl.includes(domain));
        if (isSocial) {
          websiteStatus = "Hanya Medsos";
          socialUrl = rawWebUrl;
          websiteUrl = "-";
        } else {
          websiteStatus = "Ada Website";
          websiteUrl = rawWebUrl;
          socialUrl = "-";
        }
      }
    }

    // 7. Google Maps URL
    const mapsUrl = cardData.mapsUrl || window.location.href;

    // 8. Classify Phone & WhatsApp URL
    const phoneInfo = classifyPhone(phone);

    let email = "-";
    const emailBtn = scope.querySelector(
      'button[data-item-id^="email:"], button[data-tooltip*="email" i], button[data-tooltip*="surel" i], button[aria-label*="Email:" i], button[aria-label*="Surel:" i], button[aria-label*="Email" i], button[aria-label*="Surel" i], a[href^="mailto:"]'
    );
    if (emailBtn) {
      const itemId = emailBtn.getAttribute("data-item-id") || "";
      const href = emailBtn.getAttribute("href") || "";
      const aria = emailBtn.getAttribute("aria-label") || "";
      const text = emailBtn.textContent || "";
      if (itemId.startsWith("email:")) {
        email = itemId.replace(/^email:/, "").replace(/^mailto:/, "").trim().toLowerCase();
      } else if (href.startsWith("mailto:")) {
        email = href.replace(/^mailto:/, "").split("?")[0].trim().toLowerCase();
      } else if (aria) {
        email = aria.replace(/^Email:\s*/i, "").replace(/^Surel:\s*/i, "").trim().toLowerCase();
      } else if (text.includes("@")) {
        email = text.trim().toLowerCase();
      }
    }
    if (email === "-") {
      const mailtoLink = scope.querySelector('a[href^="mailto:"]');
      if (mailtoLink) {
        const href = mailtoLink.getAttribute("href") || "";
        email = href.replace(/^mailto:/, "").split("?")[0].trim().toLowerCase();
      }
    }

    let techStack = "-";
    if (websiteUrl && websiteUrl !== "-") {
      techStack = detectWebsiteTech("", websiteUrl);
    }

    return {
      title,
      category: category || "Instansi / Tempat",
      websiteStatus,
      websiteUrl: (websiteUrl && websiteUrl !== "-") ? websiteUrl : "-",
      socialUrl: (socialUrl && socialUrl !== "-") ? socialUrl : "-",
      email,
      techStack,
      phone: phoneInfo.phone,
      phoneType: phoneInfo.phoneType,
      waUrl: phoneInfo.waUrl,
      address: address || "-",
      rating: rating || "-",
      reviewsCount: reviewsCount || "0",
      outreachStatus: "Belum Dihubungi",
      mapsUrl,
      placeId: extractPlaceId(mapsUrl),
      scrapedAt: new Date().toLocaleString("id-ID"),
      updatedAt: Date.now(),
      schemaVersion: SCHEMA_VERSION
    };
  }

  // --- Export Functions ---

  /**
   * Export leads to Excel (.xlsx) using the shared exporter (xlsx-js-style)
   */
  function handleExportXLSX() {
    if (leads.length === 0) {
      if (window.PetaKlienOverlay && window.PetaKlienOverlay.showAlert) {
        window.PetaKlienOverlay.showAlert("Buku Manifest Kosong", "Belum ada data prospek yang terkumpul untuk diekspor!", "INFO");
      }
      return;
    }

    if (typeof XLSX === "undefined") {
      if (window.PetaKlienOverlay && window.PetaKlienOverlay.showAlert) {
        window.PetaKlienOverlay.showAlert("Ekspor Data", "Library Excel (SheetJS) belum siap. Mengalihkan ke CSV...", "PERHATIAN");
      }
      handleExportCSV();
      return;
    }

    try {
      Exporter.downloadXLSX(XLSX, leads, Exporter.exportFilename("PetaKlien_Prospek", "xlsx", getSearchQueryKeyword()));
    } catch (err) {
      console.error("PetaKlien: Export XLSX Error", err);
      if (window.PetaKlienOverlay && window.PetaKlienOverlay.showAlert) {
        window.PetaKlienOverlay.showAlert("Ekspor Data", "Gagal mengunduh Excel (.xlsx). Mengalihkan ke format CSV...", "PERHATIAN");
      }
      handleExportCSV();
    }
  }

  /**
   * Export leads to CSV with UTF-8 BOM
   */
  function handleExportCSV() {
    if (leads.length === 0) {
      if (window.PetaKlienOverlay && window.PetaKlienOverlay.showAlert) {
        window.PetaKlienOverlay.showAlert("Buku Manifest Kosong", "Belum ada data prospek yang terkumpul untuk diekspor!", "INFO");
      }
      return;
    }
    Exporter.downloadCSV(leads, Exporter.exportFilename("PetaKlien_Prospek", "csv", getSearchQueryKeyword()));
  }

  function getSearchQueryKeyword() {
    try {
      const searchBox = document.querySelector("#searchboxinput, input[name='q']");
      if (searchBox && searchBox.value) {
        return searchBox.value.replace(/[^a-zA-Z0-9]/g, "_").substring(0, 25);
      }
    } catch (e) {}
    return "GoogleMaps";
  }

  // --- Utility Helpers ---

  function sleep(ms) {
    const hidden = typeof document !== "undefined" && document.hidden;
    const port = hidden && keepAliveWanted ? connectKeepAlivePort() : null;
    if (!port) return new Promise((resolve) => setTimeout(resolve, ms));

    return new Promise((resolve) => {
      const id = ++tickSeq;
      // Local timer is only a safety net (it may fire late in a throttled tab)
      const fallback = setTimeout(() => {
        if (pendingTicks.delete(id)) resolve();
      }, ms + 5000);
      pendingTicks.set(id, () => {
        clearTimeout(fallback);
        resolve();
      });
      try {
        port.postMessage({ type: "TICK", id, ms });
      } catch (e) {
        pendingTicks.delete(id);
        clearTimeout(fallback);
        setTimeout(resolve, ms);
      }
    });
  }

  function getRandomDelay(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // Start engine when DOM is ready
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", startEngine);
    } else {
      startEngine();
    }
  }
})();
