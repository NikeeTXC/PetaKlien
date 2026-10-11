/**
 * PetaKlien - Popup Script (100% Custom Non-Default Dialogs)
 */

document.addEventListener("DOMContentLoaded", () => {
  let leads = [];

  const statusDot = document.getElementById("status-dot");
  const statusText = document.getElementById("status-text");
  const openMapsBtn = document.getElementById("open-maps-btn");

  const statTotal = document.getElementById("stat-total");
  const statNoWeb = document.getElementById("stat-noweb");
  const statSocial = document.getElementById("stat-social");

  const exportXlsxBtn = document.getElementById("popup-export-xlsx");
  const exportCsvBtn = document.getElementById("popup-export-csv");
  const clearDataBtn = document.getElementById("popup-clear-data");

  // Custom Modal Controller in Popup
  const modalEl = document.getElementById("popup-modal");
  const modalMsg = document.getElementById("popup-modal-msg");
  const modalStamp = document.getElementById("popup-modal-stamp");
  const modalClose = document.getElementById("popup-modal-close");
  const modalActions = document.getElementById("popup-modal-actions");

  function showPopupAlert(title, message) {
    return new Promise((resolve) => {
      modalStamp.textContent = title || "Informasi";
      modalMsg.textContent = message;
      modalActions.innerHTML = `<button id="popup-modal-ok-btn" class="btn">Mengerti</button>`;
      modalEl.style.display = "flex";

      const cleanup = () => {
        modalEl.style.display = "none";
        resolve();
      };

      document.getElementById("popup-modal-ok-btn").onclick = cleanup;
      modalClose.onclick = cleanup;
    });
  }

  function showPopupConfirm(title, message) {
    return new Promise((resolve) => {
      modalStamp.textContent = title || "Konfirmasi";
      modalMsg.textContent = message;
      modalActions.innerHTML = `
        <button id="popup-modal-cancel-btn" class="btn">Batal</button>
        <button id="popup-modal-confirm-btn" class="btn btn-danger">Hapus</button>
      `;
      modalEl.style.display = "flex";

      const cleanup = (confirmed) => {
        modalEl.style.display = "none";
        resolve(confirmed);
      };

      document.getElementById("popup-modal-confirm-btn").onclick = () => cleanup(true);
      document.getElementById("popup-modal-cancel-btn").onclick = () => cleanup(false);
      modalClose.onclick = () => cleanup(false);
    });
  }

  // Check active tab
  if (chrome.tabs && chrome.tabs.query) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const currentTab = tabs[0];
      if (currentTab && currentTab.url && currentTab.url.includes("google.") && currentTab.url.includes("/maps")) {
        statusDot.className = "status-dot active";
        statusText.textContent = "Google Maps terbuka di tab ini";
        openMapsBtn.style.display = "none";
      } else {
        statusDot.className = "status-dot inactive";
        statusText.textContent = "Tab ini bukan Google Maps";
        openMapsBtn.style.display = "inline-flex";
      }
    });
  }


  // --- Light / dark theme (default light), shared with the sidebar & popup ---
  function applyTheme(theme) {
    const dark = theme === "dark";
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    const btn = document.getElementById("theme-btn");
    if (btn) {
      btn.setAttribute("aria-pressed", String(dark));
      btn.title = dark ? "Mode terang" : "Mode gelap";
      btn.setAttribute("aria-label", btn.title);
    }
  }
  function setupTheme() {
    applyTheme("light");
    chrome.storage.local.get(["petaklien_theme"], (res) => applyTheme(res && res.petaklien_theme));
    if (chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && changes.petaklien_theme) applyTheme(changes.petaklien_theme.newValue);
      });
    }
    const btn = document.getElementById("theme-btn");
    if (btn) {
      btn.addEventListener("click", () => {
        const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
        applyTheme(next);
        chrome.storage.local.set({ petaklien_theme: next });
      });
    }
  }

  setupTheme();
  if (window.PetaKlienTooltip) window.PetaKlienTooltip.installTooltips({ host: document.body });

  try {
    document.getElementById("popup-version").textContent = "v" + chrome.runtime.getManifest().version;
  } catch (e) {}

  // Open the report page (same handler the Maps sidebar uses)
  document.getElementById("popup-open-report").addEventListener("click", async () => {
    if (leads.length === 0) {
      await showPopupAlert("Belum ada data", "Jalankan otomasi di Google Maps terlebih dahulu.");
      return;
    }
    chrome.runtime.sendMessage({ type: "OPEN_REPORT" }, () => window.close());
  });

  openMapsBtn.addEventListener("click", () => {
    chrome.tabs.create({ url: "https://www.google.com/maps" });
  });

  // Shared modules (loaded by popup.html before this script)
  const { countLeads, leadKey, STORAGE_KEYS } = window.PetaKlienSchema;
  const Exporter = window.PetaKlienExporter;

  // Load leads from storage
  function loadData() {
    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.get([STORAGE_KEYS.leads, STORAGE_KEYS.backup], (res) => {
        leads = res[STORAGE_KEYS.leads] || [];
        backup = res[STORAGE_KEYS.backup] || null;
        updateStats();
        renderRestore();
      });
    }
  }

  function updateStats() {
    statTotal.textContent = leads.length;
    const c = countLeads(leads);
    statNoWeb.textContent = c.none;
    statSocial.textContent = c.social;
  }

  // Export XLSX (18-Column Professional Format A-R)
  exportXlsxBtn.addEventListener("click", async () => {
    if (leads.length === 0) {
      await showPopupAlert("Belum ada data", "Belum ada prospek tersimpan untuk diekspor.");
      return;
    }

    if (typeof XLSX === "undefined") {
      await showPopupAlert("Ekspor CSV", "Library Excel belum siap. Mengalihkan ke format CSV.");
      exportCSV();
      return;
    }

    Exporter.downloadXLSX(XLSX, leads, Exporter.exportFilename("PetaKlien_Prospek", "xlsx"));
  });

  // Export CSV (18 Columns Synchronized)
  exportCsvBtn.addEventListener("click", async () => {
    if (leads.length === 0) {
      await showPopupAlert("Belum ada data", "Belum ada prospek tersimpan untuk diekspor.");
      return;
    }
    exportCSV();
  });

  function exportCSV() {
    Exporter.downloadCSV(leads, Exporter.exportFilename("PetaKlien_Export", "csv"));
  }

  // Clear data
  // #2: clearing keeps a backup; "Pulihkan" stays available until the next clear
  const restoreBtn = document.getElementById("popup-restore");
  let backup = null;

  function renderRestore() {
    const has = Boolean(window.PetaKlienSchema.usableBackup(backup));
    restoreBtn.style.display = has ? "inline-flex" : "none";
    if (has) restoreBtn.textContent = `Pulihkan ${backup.leads.length} prospek yang dihapus`;
  }

  clearDataBtn.addEventListener("click", async () => {
    if (leads.length === 0) {
      await showPopupAlert("Belum ada data", "Tidak ada prospek untuk dihapus.");
      return;
    }
    const confirmed = await showPopupConfirm("Hapus semua data?", "Seluruh prospek yang tersimpan akan dihapus. Anda bisa memulihkannya lagi dari popup ini atau tab Manifest.");
    if (!confirmed) return;
    backup = { leads, at: Date.now() };
    leads = [];
    chrome.storage.local.set({ [STORAGE_KEYS.backup]: backup, [STORAGE_KEYS.leads]: [] }, () => {
      updateStats();
      renderRestore();
    });
  });

  restoreBtn.addEventListener("click", () => {
    if (!backup) return;
    chrome.storage.local.get([STORAGE_KEYS.leads], (res) => {
      const current = Array.isArray(res[STORAGE_KEYS.leads]) ? res[STORAGE_KEYS.leads] : [];
      const known = new Set(current.map((l) => leadKey(l)));
      const merged = backup.leads.filter((l) => !known.has(leadKey(l))).concat(current);
      chrome.storage.local.set({ [STORAGE_KEYS.leads]: merged }, () => {
        chrome.storage.local.remove(STORAGE_KEYS.backup);
        backup = null;
        leads = merged;
        updateStats();
        renderRestore();
      });
    });
  });

  loadData();
});
