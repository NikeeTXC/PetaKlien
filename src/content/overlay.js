/**
 * PetaKlien - Estetika "Arsip Kertas & Stempel Tinta"
 * Inspirasi: Cek Plagiasi Turnitin (NikeeTXC)
 * Clean, Non-Emoji, Professional Tabbed Controller + Web/PDF Report Viewer
 */

window.PetaKlienOverlay = (function () {
  let rootEl = null;
  let isCollapsed = false;
  // Collapsed launcher: what the run is doing, so the sidebar can stay closed
  const launcher = { state: "idle", pct: 0, infinite: false, count: null, target: 0, attention: false, doneTimer: null, bumpTimer: null };
  let activeTab = "control"; // "control" | "manifest"
  let callbacks = {};
  let currentLeads = [];

  /**
   * UI preferences live in chrome.storage.local (extension-owned), not in google.com's
   * localStorage, so clearing Google site data no longer wipes them.
   * Values saved by older versions in localStorage are migrated once.
   */
  function loadPref(key, legacyKey = key) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([key], (res) => {
          if (res && res[key] !== undefined) return resolve(res[key]);
          let legacy = null;
          try {
            legacy = localStorage.getItem(legacyKey);
            if (legacy !== null) {
              localStorage.removeItem(legacyKey);
              chrome.storage.local.set({ [key]: legacy });
            }
          } catch (e) {}
          resolve(legacy);
        });
      } catch (e) {
        resolve(null);
      }
    });
  }

  function savePref(key, value) {
    try {
      chrome.storage.local.set({ [key]: value });
    } catch (e) {}
  }

  /**
   * Initializes and mounts the sidebar
   */
  /** URL of a packaged (web-accessible) file, e.g. the logo. */
  function assetUrl(path) {
    try {
      return chrome.runtime.getURL(path);
    } catch (e) {
      return "";
    }
  }

  function init(options = {}) {
    callbacks = options;
    if (document.getElementById("petaklien-widget-root")) {
      return;
    }

    rootEl = document.createElement("div");
    rootEl.id = "petaklien-widget-root";
    rootEl.innerHTML = `
      <!-- Launcher (collapsed state, draggable along the right edge) -->
      <div id="petaklien-launcher-btn" class="petaklien-launcher" style="display: none;" role="button" tabindex="0" title="Buka PetaKlien (bisa digeser ke atas/bawah)">
        <span class="petaklien-launcher-logo" aria-hidden="true">
          <svg class="petaklien-launcher-ring" viewBox="0 0 36 36">
            <circle class="ring-track" cx="18" cy="18" r="16.5" pathLength="100" />
            <circle id="petaklien-launcher-ring-fill" class="ring-fill" cx="18" cy="18" r="16.5" pathLength="100" />
          </svg>
          <img class="petaklien-launcher-mark" src="${assetUrl("icons/icon48.png")}" alt="" />
          <span class="petaklien-launcher-dot"></span>
        </span>
        <span class="petaklien-launcher-text">
          <span class="petaklien-launcher-main"><b id="petaklien-launcher-count">0</b> prospek</span>
          <span id="petaklien-launcher-sub" class="petaklien-launcher-sub" hidden></span>
        </span>
        <span id="petaklien-launcher-bump" class="petaklien-launcher-bump" aria-hidden="true"></span>
      </div>

      <!-- Sidebar -->
      <aside id="petaklien-card" class="petaklien-card" aria-label="PetaKlien">
        <div id="petaklien-resize-handle" class="petaklien-resize-handle" role="separator" aria-orientation="vertical" aria-label="Ubah lebar panel" title="Tarik untuk mengubah lebar panel (klik ganda: lebar bawaan)"></div>
        <div id="petaklien-toast" class="petaklien-toast" role="status" aria-live="polite"></div>
        <header class="petaklien-header">
          <div class="petaklien-brand">
            <img class="petaklien-brand-mark" src="${assetUrl("icons/icon128.png")}" alt="" aria-hidden="true" />
            <span class="petaklien-brand-text">
              <span class="petaklien-wordmark">PetaKlien</span>
              <span class="petaklien-brand-sub">Prospek Google Maps</span>
            </span>
          </div>
          <div class="petaklien-header-actions">
            <button id="petaklien-theme-btn" type="button" class="petaklien-icon-btn petaklien-theme-btn" aria-pressed="false" title="Mode gelap" aria-label="Mode gelap"><svg class="icon-sun" width="16" height="16" viewBox="0 0 256 256" aria-hidden="true"><path fill="currentColor" d="M120 40V16a8 8 0 0 1 16 0v24a8 8 0 0 1-16 0Zm72 88a64 64 0 1 1-64-64 64.07 64.07 0 0 1 64 64Zm-16 0a48 48 0 1 0-48 48 48.05 48.05 0 0 0 48-48ZM58.34 69.66a8 8 0 0 0 11.32-11.32l-16-16a8 8 0 0 0-11.32 11.32Zm0 116.68-16 16a8 8 0 0 0 11.32 11.32l16-16a8 8 0 0 0-11.32-11.32ZM192 72a8 8 0 0 0 5.66-2.34l16-16a8 8 0 0 0-11.32-11.32l-16 16A8 8 0 0 0 192 72Zm5.66 114.34a8 8 0 0 0-11.32 11.32l16 16a8 8 0 0 0 11.32-11.32ZM48 128a8 8 0 0 0-8-8H16a8 8 0 0 0 0 16h24a8 8 0 0 0 8-8Zm80 80a8 8 0 0 0-8 8v24a8 8 0 0 0 16 0v-24a8 8 0 0 0-8-8Zm112-88h-24a8 8 0 0 0 0 16h24a8 8 0 0 0 0-16Z"/></svg><svg class="icon-moon" width="16" height="16" viewBox="0 0 256 256" aria-hidden="true"><path fill="currentColor" d="M233.54 142.23a8 8 0 0 0-8-2 88.08 88.08 0 0 1-109.8-109.8 8 8 0 0 0-10-10 104.84 104.84 0 0 0-52.91 37A104 104 0 0 0 136 224a103.09 103.09 0 0 0 62.52-20.88 104.84 104.84 0 0 0 37-52.91 8 8 0 0 0-1.98-7.98Zm-44.64 48.11A88 88 0 0 1 65.66 67.11a89 89 0 0 1 31.4-26A106 106 0 0 0 96 56a104.11 104.11 0 0 0 104 104 106 106 0 0 0 14.92-1.06 89 89 0 0 1-26.02 31.4Z"/></svg></button>
            <button id="petaklien-minimize-btn" type="button" class="petaklien-icon-btn" title="Sembunyikan panel" aria-label="Sembunyikan panel"><svg width="16" height="16" viewBox="0 0 256 256" aria-hidden="true"><path fill="currentColor" d="M189.66,122.34a8,8,0,0,1,0,11.32l-72,72a8,8,0,0,1-11.32-11.32L164.69,136H32a8,8,0,0,1,0-16H164.69L106.34,61.66a8,8,0,0,1,11.32-11.32ZM216,32a8,8,0,0,0-8,8V216a8,8,0,0,0,16,0V40A8,8,0,0,0,216,32Z"/></svg></button>
          </div>
        </header>

        <nav class="petaklien-tabs" aria-label="Bagian PetaKlien">
          <span class="petaklien-tab-indicator" aria-hidden="true"></span>
          <button id="petaklien-tab-btn-control" type="button" class="petaklien-tab-btn active" data-tab="control">Kontrol</button>
          <button id="petaklien-tab-btn-manifest" type="button" class="petaklien-tab-btn" data-tab="manifest">
            Manifest <span id="petaklien-tab-count" class="petaklien-tab-count">0</span>
          </button>
          <button id="petaklien-tab-btn-info" type="button" class="petaklien-tab-btn" data-tab="info">Panduan</button>
        </nav>

        <!-- TAB 1: Kontrol -->
        <div id="petaklien-tab-content-control" class="petaklien-tab-content active">
          <div class="petaklien-body">

            <!-- Kartu 1: Cari -->
            <section class="petaklien-panel">
              <div class="petaklien-layer-head"><h3 class="petaklien-panel-title">Cari prospek</h3></div>
              <div class="petaklien-layer-body">
              <div class="petaklien-field-grid">
                <input type="text" id="petaklien-search-keyword" name="peta_keyword_query" class="petaklien-input"
                  placeholder="Jenis usaha, mis. kafe" title="Jenis tempat atau bisnis. Tekan Enter untuk mulai."
                  autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-lpignore="true" />
                <input type="text" id="petaklien-search-location" name="peta_location_query" class="petaklien-input"
                  placeholder="Lokasi, mis. Jaksel" title="Kota atau area target. Kosongkan keduanya untuk memindai pencarian Maps yang sedang terbuka."
                  autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-lpignore="true" />
              </div>
              <div class="petaklien-row">
                <select id="petaklien-filter-select" class="petaklien-select petaklien-grow" title="Kriteria prospek yang dikumpulkan">
                  <option value="no_website_and_social">Tanpa web &amp; medsos</option>
                  <option value="no_website_only">Tanpa web saja</option>
                  <option value="all">Semua tempat</option>
                </select>
                <label class="petaklien-limit" title="Otomasi berhenti setelah sekian prospek yang LOLOS kriteria terkumpul. Tempat yang tidak lolos tetap dipindai, jadi jumlah tempat terpindai bisa jauh lebih banyak.">
                  <span>Maks</span>
                  <input type="number" id="petaklien-limit-input" class="petaklien-limit-input" min="1" max="10000" value="20" autocomplete="off" />
                  <select id="petaklien-limit-preset" class="petaklien-limit-preset" aria-label="Preset batas">
                    <option value="" disabled selected></option>
                    <option value="10">10</option>
                    <option value="20">20</option>
                    <option value="50">50</option>
                    <option value="100">100</option>
                    <option value="200">200</option>
                    <option value="999999">∞</option>
                  </select>
                </label>
              </div>
              <p id="petaklien-start-error" class="petaklien-field-error" role="alert" hidden></p>
              <div class="petaklien-actions">
                <button id="petaklien-start-btn" type="button" class="petaklien-btn petaklien-btn-primary">
                  <span>Mulai otomasi</span>
                </button>
                <button id="petaklien-pause-btn" type="button" class="petaklien-btn petaklien-btn-ghost" style="display: none;">Jeda</button>
                <button id="petaklien-resume-btn" type="button" class="petaklien-btn petaklien-btn-primary" style="display: none;">
                  <span>Lanjutkan</span>
                </button>
                <button id="petaklien-stop-btn" type="button" class="petaklien-btn petaklien-btn-danger" style="display: none;">Berhenti</button>
              </div>
              </div>
            </section>

            <!-- Kartu 2: Hasil -->
            <section class="petaklien-panel">
              <div class="petaklien-layer-head"><div class="petaklien-panel-head">
                <h3 class="petaklien-panel-title">Hasil</h3>
                <span id="petaklien-status-badge" class="petaklien-status-badge idle">Siap</span>
              </div></div>
              <div class="petaklien-layer-body">
              <div class="petaklien-stats">
                <div class="petaklien-stat">
                  <span id="petaklien-count-leads" class="petaklien-stat-val">0</span>
                  <span class="petaklien-stat-label">prospek</span>
                </div>
                <div class="petaklien-stat is-signal">
                  <span id="petaklien-count-noweb" class="petaklien-stat-val">0</span>
                  <span class="petaklien-stat-label">tanpa web</span>
                </div>
                <div class="petaklien-stat">
                  <span id="petaklien-count-social" class="petaklien-stat-val">0</span>
                  <span class="petaklien-stat-label">medsos</span>
                </div>
              </div>
              <div class="petaklien-progress">
                <div class="petaklien-progress-track"><div id="petaklien-progress-fill" class="petaklien-progress-fill"></div></div>
                <div class="petaklien-progress-stats">
                  <span id="petaklien-progress-label">PROGRES: 0 / 20</span>
                  <span id="petaklien-scanned-total">TERPINDAI: 0</span>
                  <span id="petaklien-progress-pct">0%</span>
                </div>
              </div>
              <p id="petaklien-status-text" class="petaklien-status-text" title="Siap memulai pencarian">Isi target lalu tekan Mulai.</p>
              <ul id="petaklien-recent" class="petaklien-recent" aria-label="Temuan terakhir"></ul>
              <button id="petaklien-clear-btn-control" type="button" class="petaklien-text-btn" title="Hasil baru selalu ditambahkan ke data yang ada. Kosongkan untuk mulai dari nol.">Mulai dari nol</button>
              </div>
            </section>

            <!-- Kartu 3: Opsi -->
            <section class="petaklien-panel petaklien-panel-tight">
              <div class="petaklien-layer-body"><label class="petaklien-switch-row" for="petaklien-deepsearch-toggle" title="Cari website tersembunyi lewat Google Search untuk setiap tempat">
                <span>Deep Search otomatis</span>
                <input type="checkbox" id="petaklien-deepsearch-toggle" class="petaklien-switch" checked />
              </label>
              <label id="petaklien-gridscan-row" class="petaklien-switch-row is-disabled" for="petaklien-gridscan-toggle" title="Isi lokasi dulu untuk memakai Grid Scan">
                <span class="petaklien-switch-label">Grid Scan per kecamatan<small id="petaklien-gridscan-hint">Isi lokasi dulu</small></span>
                <input type="checkbox" id="petaklien-gridscan-toggle" class="petaklien-switch" disabled />
              </label>
              <div class="petaklien-switch-row petaklien-adv-row">
                <label class="petaklien-accordion-label" for="petaklien-adv-enabled">Filter lanjutan <span id="petaklien-adv-count" class="petaklien-adv-count" hidden></span></label>
                <span class="petaklien-adv-controls">
                  <input type="checkbox" id="petaklien-adv-enabled" class="petaklien-switch" title="Aktifkan filter lanjutan. Saat mati, filter tidak dipakai (nilainya tetap tersimpan)." />
                  <button type="button" id="petaklien-adv-toggle" class="petaklien-accordion" aria-expanded="false" aria-controls="petaklien-adv-box" aria-label="Tampilkan pengaturan filter lanjutan" title="Atur filter lanjutan">
                    <span id="petaklien-adv-arrow" class="petaklien-accordion-icon" aria-hidden="true"><svg class="icon-plus" width="14" height="14" viewBox="0 0 256 256" aria-hidden="true"><path fill="currentColor" d="M224,128a8,8,0,0,1-8,8H136v80a8,8,0,0,1-16,0V136H40a8,8,0,0,1,0-16h80V40a8,8,0,0,1,16,0v80h80A8,8,0,0,1,224,128Z"/></svg><svg class="icon-minus" width="14" height="14" viewBox="0 0 256 256" aria-hidden="true"><path fill="currentColor" d="M224,128a8,8,0,0,1-8,8H40a8,8,0,0,1,0-16H216A8,8,0,0,1,224,128Z"/></svg></span>
                  </button>
                </span>
              </div>

              <div id="petaklien-adv-box" class="petaklien-adv-box" style="display: none;">
                <div class="petaklien-chips">
                  <button type="button" id="btn-preset-hot-leads" class="petaklien-chip" data-preset="hot_leads" aria-pressed="false" title="WA + ulasan ≥ 10 + rating ≥ 4.0">Hot leads</button>
                  <button type="button" id="btn-preset-skripsi" class="petaklien-chip" data-preset="skripsi" aria-pressed="false" title="Ada kontak + ulasan ≥ 25 + rating ≥ 4.0">Skripsi</button>
                  <button type="button" id="btn-preset-wa-only" class="petaklien-chip" data-preset="wa_only" aria-pressed="false" title="Khusus nomor HP / WhatsApp">Khusus WA</button>
                  <button type="button" id="btn-preset-reset" class="petaklien-chip is-muted" title="Kembali ke default">Reset</button>
                </div>
                <label class="petaklien-field">
                  <span>Kontak</span>
                  <select id="petaklien-adv-contact" class="petaklien-select">
                    <option value="all">Semua (termasuk tanpa nomor)</option>
                    <option value="has_phone">Wajib ada nomor</option>
                    <option value="wa_only">Khusus WhatsApp (08..)</option>
                  </select>
                </label>
                <div class="petaklien-row">
                  <label class="petaklien-field petaklien-grow">
                    <span>Rating</span>
                    <select id="petaklien-adv-min-rating" class="petaklien-select">
                      <option value="0">Semua</option>
                      <option value="3.5">3.5+</option>
                      <option value="4.0">4.0+</option>
                      <option value="4.5">4.5+</option>
                      <option value="4.8">4.8+</option>
                    </select>
                  </label>
                  <label class="petaklien-field petaklien-grow">
                    <span>Ulasan min</span>
                    <input type="number" id="petaklien-adv-min-reviews" class="petaklien-input" placeholder="0" min="0" />
                  </label>
                  <label class="petaklien-field petaklien-grow">
                    <span>Ulasan maks</span>
                    <input type="number" id="petaklien-adv-max-reviews" class="petaklien-input" placeholder="∞" min="0" />
                  </label>
                </div>
                <div class="petaklien-row">
                  <label class="petaklien-field petaklien-grow">
                    <span>Wajib ada kata</span>
                    <input type="text" id="petaklien-adv-include-kw" class="petaklien-input" placeholder="Studio, Kopi" />
                  </label>
                  <label class="petaklien-field petaklien-grow">
                    <span>Kecualikan kata</span>
                    <input type="text" id="petaklien-adv-exclude-kw" class="petaklien-input" placeholder="Cabang" />
                  </label>
                </div>
                <label class="petaklien-field">
                  <span>Wilayah spesifik</span>
                  <input type="text" id="petaklien-adv-location" class="petaklien-input" placeholder="Kemang, BSD" />
                </label>
                <label class="petaklien-switch-row" for="petaklien-adv-free-builders" title="Blogspot, Wix, WordPress.com, dll.">
                  <span>Web gratisan dianggap tanpa web</span>
                  <input type="checkbox" id="petaklien-adv-free-builders" class="petaklien-switch" checked />
                </label>
              </div>
              </div>
            </section>
          </div>
        </div>

        <!-- TAB 2: Manifest -->
        <div id="petaklien-tab-content-manifest" class="petaklien-tab-content">
          <div class="petaklien-body">
            <section class="petaklien-panel petaklien-panel-list">
              <div class="petaklien-layer-head"><div class="petaklien-panel-head">
                <h3 class="petaklien-panel-title">Prospek terkumpul</h3>
                <span class="petaklien-panel-meta">100 terbaru</span>
              </div></div>
              <div class="petaklien-layer-body">
              <div class="petaklien-manifest-scroll">
                <table class="petaklien-table">
                  <thead>
                    <tr><th>Nama</th><th>Status</th><th>Kontak</th></tr>
                  </thead>
                  <tbody id="petaklien-table-body">
                    <tr><td colspan="3" class="petaklien-empty">Belum ada data. Mulai dari tab Kontrol.</td></tr>
                  </tbody>
                </table>
              </div>
              </div>
            </section>

            <section class="petaklien-panel">
              <div class="petaklien-layer-body"><button id="petaklien-open-report-btn" type="button" class="petaklien-btn petaklien-btn-primary" title="Spreadsheet, Mini-CRM, dan pitching WhatsApp">
                <span>Buka laporan lengkap</span>
              </button>
              <div class="petaklien-btn-grid">
                <button id="petaklien-batch-deepsearch-btn" type="button" class="petaklien-btn petaklien-btn-ghost petaklien-btn-sm petaklien-span-2" title="Lacak website tersembunyi untuk data yang belum lengkap">Lacak Deep Search</button>
                <button id="petaklien-export-xlsx-btn" type="button" class="petaklien-btn petaklien-btn-excel petaklien-btn-sm">Excel</button>
                <button id="petaklien-export-csv-btn" type="button" class="petaklien-btn petaklien-btn-ghost petaklien-btn-sm">CSV</button>
              </div>
              <button id="petaklien-clear-btn" type="button" class="petaklien-text-btn is-danger" title="Kosongkan seluruh data">Hapus semua data</button>
              </div>
            </section>
          </div>
        </div>

        <!-- TAB 3: Panduan -->
        <div id="petaklien-tab-content-info" class="petaklien-tab-content" style="display: none;">
          <div class="petaklien-body">
            <section class="petaklien-panel">
              <div class="petaklien-layer-head"><h3 class="petaklien-panel-title">Cara pakai</h3></div>
              <div class="petaklien-layer-body">
              <ol class="petaklien-steps">
                <li><span class="petaklien-step-no">1</span><p>Isi <strong>jenis usaha</strong> dan <strong>lokasi</strong>. Bisa juga dikosongkan untuk memindai hasil pencarian Google Maps yang sedang terbuka.</p></li>
                <li><span class="petaklien-step-no">2</span><p>Pilih kriteria dan <strong>Maks</strong>, yaitu jumlah prospek lolos yang ingin dikumpulkan.</p></li>
                <li><span class="petaklien-step-no">3</span><p>Tekan <strong>Mulai otomasi</strong>. Panel boleh ditutup; tombol di tepi kanan tetap menunjukkan progres.</p></li>
                <li><span class="petaklien-step-no">4</span><p>Buka <strong>laporan lengkap</strong> untuk mengirim WhatsApp, mencatat follow-up, dan mengunduh Excel.</p></li>
              </ol>
              </div>
            </section>

            <section class="petaklien-panel">
              <div class="petaklien-layer-head"><h3 class="petaklien-panel-title">Arti status</h3></div>
              <div class="petaklien-layer-body">
              <dl class="petaklien-legend">
                <div><dt><span class="petaklien-badge-tag no-web">Tanpa web</span></dt><dd>Belum punya website. Target utama.</dd></div>
                <div><dt><span class="petaklien-badge-tag social">Medsos</span></dt><dd>Hanya Instagram, TikTok, atau Linktree.</dd></div>
                <div><dt><span class="petaklien-badge-tag deep-web">Web (deep)</span></dt><dd>Website ditemukan lewat Google Search.</dd></div>
                <div><dt><span class="petaklien-badge-tag has-web">Ada web</span></dt><dd>Website tercantum di Google Maps.</dd></div>
                <div><dt><span class="petaklien-badge-tag verified"><svg width="12" height="12" viewBox="0 0 256 256" aria-hidden="true"><path fill="currentColor" d="M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z"/></svg>Deep</span></dt><dd>Sudah dicek lewat Google Search, memang tidak ada website.</dd></div>
                <div><dt><span class="petaklien-badge-tag pending">Belum dicek</span></dt><dd>Deep Search dibatasi Google. Cek ulang lewat <strong>Lacak Deep Search</strong>.</dd></div>
                <div><dt><span class="petaklien-badge-tag history">Pernah dihubungi</span></dt><dd>Sudah pernah dikontak sebelum data dikosongkan.</dd></div>
              </dl>
              </div>
            </section>

            <section class="petaklien-panel">
              <div class="petaklien-layer-head"><h3 class="petaklien-panel-title">Status di tombol samping</h3></div>
              <div class="petaklien-layer-body">
              <p class="petaklien-info-text">Saat panel ditutup, tombol di tepi kanan menunjukkan keadaan otomasi.</p>
              <dl class="petaklien-legend petaklien-dot-legend">
                <div><dt><span class="petaklien-legend-dot is-running"></span>Memindai</dt><dd>Cincin hijau terisi menuju target. Muncul <strong>+1</strong> tiap prospek baru.</dd></div>
                <div><dt><span class="petaklien-legend-dot is-paused"></span>Jeda</dt><dd>Otomasi dijeda, lanjutkan dari panel.</dd></div>
                <div><dt><span class="petaklien-legend-dot is-done"></span>Selesai</dt><dd>Target tercapai.</dd></div>
                <div><dt><span class="petaklien-legend-dot is-attention"></span>Perlu dicek</dt><dd>Ada peringatan. Buka panel untuk melihatnya.</dd></div>
              </dl>
              </div>
            </section>

            <section class="petaklien-panel">
              <div class="petaklien-layer-head"><h3 class="petaklien-panel-title">Fitur</h3></div>
              <div class="petaklien-layer-body petaklien-faq">
                <details>
                  <summary>Deep Search otomatis</summary>
                  <p>Prospek yang tampak tanpa website dicek ulang lewat Google Search. Kalau ternyata punya website resmi, statusnya berubah jadi <strong>Web (deep)</strong>. Jika Google membatasi, Deep Search berhenti sendiri dan prospeknya ditandai <strong>Belum dicek</strong>.</p>
                </details>
                <details>
                  <summary>Grid Scan per kecamatan</summary>
                  <p>Satu pencarian Google Maps hasilnya terbatas. Grid Scan memecah lokasi yang dikenal (mis. Jakarta Selatan) menjadi pencarian per kecamatan, sehingga hasilnya jauh lebih banyak. Isi lokasi dulu untuk mengaktifkannya.</p>
                </details>
                <details>
                  <summary>Filter lanjutan &amp; preset</summary>
                  <p>Saring berdasarkan kontak (mis. khusus WhatsApp), rating, jumlah ulasan, dan kata kunci. Preset <strong>Hot leads</strong>, <strong>Skripsi</strong>, dan <strong>Khusus WA</strong> mengisi semuanya sekaligus. Filter hanya dipakai saat switch-nya menyala.</p>
                </details>
                <details>
                  <summary>Outreach di laporan</summary>
                  <p>Klik ikon WhatsApp di samping nama, pilih template pesan, lalu <strong>Kirim &amp; lanjut</strong> ke prospek berikutnya. Status otomatis menjadi Terkirim WA, dan prospek yang lama tanpa kabar masuk filter <strong>Perlu follow-up</strong>. Pilih beberapa baris untuk ubah status, kirim WA, atau unduh sekaligus.</p>
                </details>
                <details>
                  <summary>Hapus data &amp; memulihkan</summary>
                  <p><strong>Mulai dari nol</strong> mengosongkan data. Penghapusan bisa dibatalkan dari notifikasi, atau dipulihkan lewat tombol Pulihkan. Status kontak tetap diingat, jadi tempat yang pernah dihubungi akan ditandai lagi.</p>
                </details>
              </div>
            </section>

            <section class="petaklien-panel">
              <div class="petaklien-layer-head"><h3 class="petaklien-panel-title">Pintasan di laporan</h3></div>
              <div class="petaklien-layer-body">
              <dl class="petaklien-legend petaklien-keys">
                <div><dt><kbd>/</kbd></dt><dd>Cari prospek</dd></div>
                <div><dt><kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd></dt><dd>Pindah sel</dd></div>
                <div><dt><kbd>Enter</kbd></dt><dd>Kirim WhatsApp ke baris aktif</dd></div>
                <div><dt><kbd>Spasi</kbd></dt><dd>Pilih baris (Shift untuk rentang)</dd></div>
                <div><dt><kbd>N</kbd></dt><dd>Tulis catatan</dd></div>
                <div><dt><kbd>Esc</kbd></dt><dd>Batalkan pilihan / tutup dialog</dd></div>
              </dl>
              </div>
            </section>

            <section class="petaklien-panel">
              <div class="petaklien-layer-head"><h3 class="petaklien-panel-title">Privasi</h3></div>
              <div class="petaklien-layer-body">
              <p class="petaklien-info-text">Data disimpan lokal di browser Anda dan tidak dikirim ke server mana pun. Kode terbuka (MIT).</p>
              <a id="petaklien-repo-link" class="petaklien-link-row" href="https://github.com/NikeeTXC/PetaKlien" target="_blank" rel="noopener">
                <span>GitHub · <span id="petaklien-version">PetaKlien</span></span>
                <span class="petaklien-round-arrow" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 256 256" aria-hidden="true"><path fill="currentColor" d="M224,104a8,8,0,0,1-16,0V59.32l-66.33,66.34a8,8,0,0,1-11.32-11.32L196.68,48H152a8,8,0,0,1,0-16h64a8,8,0,0,1,8,8Zm-40,24a8,8,0,0,0-8,8v72H48V80h72a8,8,0,0,0,0-16H48A16,16,0,0,0,32,80V208a16,16,0,0,0,16,16H176a16,16,0,0,0,16-16V136A8,8,0,0,0,184,128Z"/></svg></span>
              </a>
              </div>
            </section>
          </div>
        </div>
      </aside>

      <!-- Modal: clear confirmation -->
      <div id="petaklien-clear-modal" class="petaklien-modal-overlay" style="display: none;">
        <div class="petaklien-modal-box" role="dialog" aria-modal="true" aria-labelledby="petaklien-clear-title">
          <div class="petaklien-modal-header">
            <h3 id="petaklien-clear-title" class="petaklien-modal-title">Hapus semua data?</h3>
            <button id="petaklien-clear-modal-close-btn" type="button" class="petaklien-icon-btn" aria-label="Tutup"><svg width="16" height="16" viewBox="0 0 256 256" aria-hidden="true"><path fill="currentColor" d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z"/></svg></button>
          </div>
          <div class="petaklien-modal-body">
            <p>Seluruh prospek yang tersimpan akan dihapus. Anda masih bisa membatalkannya sesaat setelah dihapus, atau memulihkannya dari tab Manifest.</p>
          </div>
          <div class="petaklien-modal-actions">
            <button id="petaklien-clear-cancel-btn" type="button" class="petaklien-btn petaklien-btn-ghost">Batal</button>
            <button id="petaklien-clear-confirm-btn" type="button" class="petaklien-btn petaklien-btn-danger">Hapus</button>
          </div>
        </div>
      </div>

      <!-- Modal: permanent, irreversible action (Kumo Dialog, destructive) -->
      <div id="petaklien-danger-modal" class="petaklien-modal-overlay" style="display: none;">
        <div class="petaklien-modal-box" role="alertdialog" aria-modal="true" aria-labelledby="petaklien-danger-title" aria-describedby="petaklien-danger-text">
          <div class="petaklien-modal-header">
            <div>
              <span class="petaklien-status-badge error">Permanen</span>
              <h3 id="petaklien-danger-title" class="petaklien-modal-title">Hapus permanen?</h3>
            </div>
            <button id="petaklien-danger-close-btn" type="button" class="petaklien-icon-btn" aria-label="Tutup"><svg width="16" height="16" viewBox="0 0 256 256" aria-hidden="true"><path fill="currentColor" d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z"/></svg></button>
          </div>
          <div class="petaklien-modal-body">
            <div class="petaklien-danger-callout">
              <svg width="18" height="18" viewBox="0 0 256 256" aria-hidden="true"><path fill="currentColor" d="M236.8,188.09,149.35,36.22h0a24.76,24.76,0,0,0-42.7,0L19.2,188.09a23.51,23.51,0,0,0,0,23.72A24.35,24.35,0,0,0,40.55,224h174.9a24.35,24.35,0,0,0,21.33-12.19A23.51,23.51,0,0,0,236.8,188.09ZM222.93,203.8a8.5,8.5,0,0,1-7.48,4.2H40.55a8.5,8.5,0,0,1-7.48-4.2,7.59,7.59,0,0,1,0-7.72L120.52,44.21a8.75,8.75,0,0,1,15,0l87.45,151.87A7.59,7.59,0,0,1,222.93,203.8ZM120,144V104a8,8,0,0,1,16,0v40a8,8,0,0,1-16,0Zm20,36a12,12,0,1,1-12-12A12,12,0,0,1,140,180Z"/></svg>
              <p id="petaklien-danger-text"></p>
            </div>
            <p id="petaklien-danger-note" class="petaklien-danger-note"></p>
          </div>
          <div class="petaklien-modal-actions">
            <button id="petaklien-danger-cancel-btn" type="button" class="petaklien-btn petaklien-btn-ghost">Batal</button>
            <button id="petaklien-danger-confirm-btn" type="button" class="petaklien-btn petaklien-btn-danger">Hapus permanen</button>
          </div>
        </div>
      </div>

      <!-- Modal: alert / notice (replaces browser alert()) -->
      <div id="petaklien-alert-modal" class="petaklien-modal-overlay" style="display: none;">
        <div class="petaklien-modal-box" role="alertdialog" aria-modal="true" aria-labelledby="petaklien-alert-title">
          <div class="petaklien-modal-header">
            <div>
              <span id="petaklien-alert-stamp" class="petaklien-status-badge info">Informasi</span>
              <h3 id="petaklien-alert-title" class="petaklien-modal-title">Pemberitahuan</h3>
            </div>
            <button id="petaklien-alert-close-btn" type="button" class="petaklien-icon-btn" aria-label="Tutup"><svg width="16" height="16" viewBox="0 0 256 256" aria-hidden="true"><path fill="currentColor" d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z"/></svg></button>
          </div>
          <div class="petaklien-modal-body">
            <div id="petaklien-alert-message">Pemberitahuan.</div>
          </div>
          <div class="petaklien-modal-actions">
            <button id="petaklien-alert-ok-btn" type="button" class="petaklien-btn petaklien-btn-primary">
              <span>Mengerti</span>
            </button>
          </div>
        </div>
      </div>
`;

    document.body.appendChild(rootEl);
    if (window.PetaKlienTooltip) window.PetaKlienTooltip.installTooltips({ host: rootEl });

    try {
      const version = chrome.runtime.getManifest().version;
      document.getElementById("petaklien-version").textContent = `v${version}`;
      const home = chrome.runtime.getManifest().homepage_url;
      if (/^https:\/\/github\.com\//.test(home || "")) document.getElementById("petaklien-repo-link").href = home;
    } catch (e) {}

    setupEvents();
  }

  /**
   * Attach DOM events
   */
  function setupEvents() {
    const minBtn = document.getElementById("petaklien-minimize-btn");
    const launcherEl = document.getElementById("petaklien-launcher-btn");

    minBtn.addEventListener("click", () => setCollapsed(true));
    makeDraggable(launcherEl);

    // 3-Tab Switching Events (Kontrol | Manifest | Info)
    const tabBtnControl = document.getElementById("petaklien-tab-btn-control");
    const tabBtnManifest = document.getElementById("petaklien-tab-btn-manifest");
    const tabBtnInfo = document.getElementById("petaklien-tab-btn-info");
    const tabContentControl = document.getElementById("petaklien-tab-content-control");
    const tabContentManifest = document.getElementById("petaklien-tab-content-manifest");
    const tabContentInfo = document.getElementById("petaklien-tab-content-info");

    // Kumo Tabs (segmented): one indicator slides to the active tab (200 ms)
    const tabsNav = document.querySelector("#petaklien-widget-root .petaklien-tabs");
    function moveTabIndicator() {
      const btn = tabsNav && tabsNav.querySelector(".petaklien-tab-btn.active");
      if (!btn || !btn.offsetWidth) return;
      tabsNav.style.setProperty("--tab-left", btn.offsetLeft + "px");
      tabsNav.style.setProperty("--tab-width", btn.offsetWidth + "px");
      // first placement without animation, every later one slides
      if (!tabsNav.classList.contains("is-ready")) {
        void tabsNav.offsetWidth; // commit the first position before transitions are switched on
        tabsNav.classList.add("is-ready");
      }
    }
    if (tabsNav && typeof ResizeObserver !== "undefined") new ResizeObserver(moveTabIndicator).observe(tabsNav);

    function switchSidebarTab(target) {
      activeTab = target;
      if (tabBtnControl) tabBtnControl.classList.toggle("active", target === "control");
      if (tabBtnManifest) tabBtnManifest.classList.toggle("active", target === "manifest");
      if (tabBtnInfo) tabBtnInfo.classList.toggle("active", target === "info");

      if (tabContentControl) {
        tabContentControl.classList.toggle("active", target === "control");
        tabContentControl.style.display = (target === "control") ? "flex" : "none";
      }
      if (tabContentManifest) {
        tabContentManifest.classList.toggle("active", target === "manifest");
        tabContentManifest.style.display = (target === "manifest") ? "flex" : "none";
      }
      if (tabContentInfo) {
        tabContentInfo.classList.toggle("active", target === "info");
        tabContentInfo.style.display = (target === "info") ? "flex" : "none";
      }
      moveTabIndicator();
    }
    moveTabIndicator();

    if (tabBtnControl) tabBtnControl.addEventListener("click", () => switchSidebarTab("control"));
    if (tabBtnManifest) tabBtnManifest.addEventListener("click", () => switchSidebarTab("manifest"));
    if (tabBtnInfo) tabBtnInfo.addEventListener("click", () => switchSidebarTab("info"));

    const limitInput = document.getElementById("petaklien-limit-input");
    const limitPreset = document.getElementById("petaklien-limit-preset");
    const keywordInput = document.getElementById("petaklien-search-keyword");
    const locationInput = document.getElementById("petaklien-search-location");

    limitPreset.addEventListener("change", () => {
      if (limitPreset.value) {
        limitInput.value = limitPreset.value;
      }
    });

    limitInput.addEventListener("input", () => {
      limitPreset.value = "";
    });

    // Enter key inside search inputs triggers start
    const handleEnterSearch = (e) => {
      if (e.key === "Enter") {
        document.getElementById("petaklien-start-btn").click();
      }
    };
    keywordInput.addEventListener("keydown", handleEnterSearch);
    locationInput.addEventListener("keydown", handleEnterSearch);

    // Grid Scan splits a city into districts, so it only works with a location
    const syncGridScanAvailability = () => {
      const toggle = document.getElementById("petaklien-gridscan-toggle");
      const row = document.getElementById("petaklien-gridscan-row");
      const hasLocation = locationInput.value.trim().length > 0;
      if (!toggle || !row) return;
      toggle.disabled = !hasLocation || locationInput.disabled;
      row.classList.toggle("is-disabled", !hasLocation);
      row.title = hasLocation
        ? "Bagi kota jadi beberapa kecamatan agar hasil lebih banyak (>120 data)"
        : "Isi lokasi dulu untuk memakai Grid Scan";
    };
    locationInput.addEventListener("input", syncGridScanAvailability);
    syncGridScanAvailability();

    // #7 Kumo Input error: the message sits under the fields instead of a dialog
    const startError = document.getElementById("petaklien-start-error");
    const limitBox = limitInput.closest(".petaklien-limit");
    function clearStartError() {
      if (startError) { startError.hidden = true; startError.textContent = ""; }
      [keywordInput, locationInput, limitBox].forEach((el) => {
        if (!el) return;
        el.classList.remove("is-invalid");
        el.removeAttribute("aria-invalid");
      });
    }
    function showStartError(message, fields) {
      if (startError) { startError.textContent = message; startError.hidden = false; }
      fields.forEach((el) => {
        if (!el) return;
        el.classList.add("is-invalid");
        el.setAttribute("aria-invalid", "true");
      });
      const focusable = fields[0] && (fields[0].matches("input") ? fields[0] : fields[0].querySelector("input"));
      if (focusable) focusable.focus();
    }
    /** Checks the search form; returns false (and marks the fields) when it cannot start. */
    function validateStart() {
      clearStartError();
      const raw = limitInput.value.trim();
      const n = parseInt(raw, 10);
      if (raw && (isNaN(n) || n < 1)) {
        showStartError("Maks minimal 1 prospek.", [limitBox]);
        return false;
      }
      const hasQuery = keywordInput.value.trim() || locationInput.value.trim();
      const hasResults = document.querySelector('div[role="feed"]');
      if (!hasQuery && !hasResults) {
        showStartError("Isi jenis usaha atau lokasi dulu, atau cari sesuatu di Google Maps lalu tekan Mulai.", [keywordInput, locationInput]);
        return false;
      }
      return true;
    }
    [keywordInput, locationInput, limitInput].forEach((el) => el && el.addEventListener("input", clearStartError));
    if (limitPreset) limitPreset.addEventListener("change", clearStartError);

    document.getElementById("petaklien-start-btn").addEventListener("click", async () => {
      if (!validateStart()) return;
      const filter = document.getElementById("petaklien-filter-select").value;
      let rawVal = parseInt(limitInput.value, 10);
      if (isNaN(rawVal) || rawVal <= 0) {
        rawVal = 10;
        limitInput.value = "10";
      }
      const limit = rawVal;

      // Construct search query smartly
      const kw = keywordInput.value.trim();
      const loc = locationInput.value.trim();
      let query = "";
      if (kw && loc) {
        if (/^(di\b|dekat\b|deket\b|sekitar\b|area\b|kawasan\b|near\b|around\b)/i.test(loc)) {
          query = `${kw} ${loc}`;
        } else {
          query = `${kw} di ${loc}`;
        }
      } else if (kw) {
        query = kw;
      } else if (loc) {
        query = loc;
      }

      // New results are always appended; "Mulai dari nol" in the Hasil card clears first
      const resetBeforeStart = false;

      const deepToggle = document.getElementById("petaklien-deepsearch-toggle");
      const enableDeepSearch = deepToggle ? deepToggle.checked : true;

      // Extract Advanced Filters
      const advContact = document.getElementById("petaklien-adv-contact")?.value || "all";
      const advMinRating = parseFloat(document.getElementById("petaklien-adv-min-rating")?.value || 0) || 0;
      const advMinReviews = parseInt(document.getElementById("petaklien-adv-min-reviews")?.value || 0) || 0;
      const advMaxReviews = parseInt(document.getElementById("petaklien-adv-max-reviews")?.value || 0) || 999999;
      const advIncludeKw = document.getElementById("petaklien-adv-include-kw")?.value?.trim() || "";
      const advExcludeKw = document.getElementById("petaklien-adv-exclude-kw")?.value?.trim() || "";
      const advLocation = document.getElementById("petaklien-adv-location")?.value?.trim() || "";
      const advFreeBuilders = document.getElementById("petaklien-adv-free-builders") ? document.getElementById("petaklien-adv-free-builders").checked : true;

      const advanced = {
        contactType: advContact,
        minRating: advMinRating,
        minReviews: advMinReviews,
        maxReviews: advMaxReviews,
        includeKeywords: advIncludeKw,
        excludeKeywords: advExcludeKw,
        locationFilter: advLocation,
        treatFreeBuildersAsNoWeb: advFreeBuilders
      };

      savePref("petaklien_adv_filters", JSON.stringify(advanced));

      const gridScanToggle = document.getElementById("petaklien-gridscan-toggle");
      const gridScan = Boolean(gridScanToggle && gridScanToggle.checked && !gridScanToggle.disabled && loc);

      const advEnabledEl = document.getElementById("petaklien-adv-enabled");
      const advActive = Boolean(advEnabledEl && advEnabledEl.checked);
      if (callbacks.onStart) callbacks.onStart({ filter, limit, query, keyword: kw, location: loc, resetBeforeStart, enableDeepSearch, advanced: advActive ? advanced : null, gridScan });
    });

    // Restore Saved Advanced Filters
    loadPref("petaklien_adv_filters").then((raw) => {
     try {
      const savedAdv = JSON.parse(raw || "null");
      if (savedAdv) {
        if (savedAdv.contactType && document.getElementById("petaklien-adv-contact")) document.getElementById("petaklien-adv-contact").value = savedAdv.contactType;
        if (savedAdv.minRating !== undefined && document.getElementById("petaklien-adv-min-rating")) {
          const rVal = String(savedAdv.minRating);
          const rSelect = document.getElementById("petaklien-adv-min-rating");
          rSelect.value = rVal;
          if (rSelect.selectedIndex === -1) {
            if (rVal === "4") rSelect.value = "4.0";
            else if (rVal === "3.5") rSelect.value = "3.5";
            else if (rVal === "4.5") rSelect.value = "4.5";
            else if (rVal === "4.8") rSelect.value = "4.8";
            else rSelect.value = "0";
          }
        }
        if (savedAdv.minReviews && document.getElementById("petaklien-adv-min-reviews")) document.getElementById("petaklien-adv-min-reviews").value = String(savedAdv.minReviews);
        if (savedAdv.maxReviews && savedAdv.maxReviews < 999999 && document.getElementById("petaklien-adv-max-reviews")) document.getElementById("petaklien-adv-max-reviews").value = String(savedAdv.maxReviews);
        if (savedAdv.includeKeywords && document.getElementById("petaklien-adv-include-kw")) document.getElementById("petaklien-adv-include-kw").value = savedAdv.includeKeywords;
        if (savedAdv.excludeKeywords && document.getElementById("petaklien-adv-exclude-kw")) document.getElementById("petaklien-adv-exclude-kw").value = savedAdv.excludeKeywords;
        if (savedAdv.locationFilter && document.getElementById("petaklien-adv-location")) document.getElementById("petaklien-adv-location").value = savedAdv.locationFilter;
        if (savedAdv.treatFreeBuildersAsNoWeb !== undefined && document.getElementById("petaklien-adv-free-builders")) document.getElementById("petaklien-adv-free-builders").checked = savedAdv.treatFreeBuildersAsNoWeb;
      }
     } catch(e) {}
    });

    // Advanced Filter Toggle
    const advToggle = document.getElementById("petaklien-adv-toggle");
    const advBox = document.getElementById("petaklien-adv-box");
    if (advToggle && advBox) {
      advToggle.addEventListener("click", () => {
        const isHidden = advBox.style.display === "none";
        advBox.style.display = isHidden ? "flex" : "none";
        advToggle.setAttribute("aria-expanded", String(isHidden));
      });
    }

    // Preset Chip Buttons
    document.getElementById("btn-preset-hot-leads")?.addEventListener("click", () => applyAdvPreset("hot_leads"));
    document.getElementById("btn-preset-skripsi")?.addEventListener("click", () => applyAdvPreset("skripsi"));
    document.getElementById("btn-preset-wa-only")?.addEventListener("click", () => applyAdvPreset("wa_only"));
    document.getElementById("btn-preset-reset")?.addEventListener("click", () => {
      applyAdvPreset("reset");
      setActivePreset("");
      setAdvEnabled(false);
    });
    document.getElementById("petaklien-adv-enabled")?.addEventListener("change", (e) => setAdvEnabled(e.target.checked));

    const advBoxEl = document.getElementById("petaklien-adv-box");
    if (advBoxEl) {
      const onManualEdit = (e) => {
        if (e.target.closest("[data-preset], #btn-preset-reset")) return;
        if (activePreset) setActivePreset("");
        else updateAdvCount();
      };
      advBoxEl.addEventListener("input", onManualEdit);
      advBoxEl.addEventListener("change", onManualEdit);
    }
    Promise.all([loadPref("petaklien_adv_preset"), loadPref("petaklien_adv_enabled")]).then(([name, enabled]) => {
      // wait for saved filter values to be restored first
      setTimeout(() => {
        if (name) setActivePreset(name);
        const on = enabled === null || enabled === undefined ? countAdvFilters() > 0 : enabled === "1";
        setAdvEnabled(on, { save: false });
      }, 0);
    });

    setupTheme();

    document.getElementById("petaklien-pause-btn").addEventListener("click", () => {
      if (callbacks.onPause) callbacks.onPause();
    });

    document.getElementById("petaklien-resume-btn").addEventListener("click", () => {
      if (callbacks.onResume) callbacks.onResume();
    });

    document.getElementById("petaklien-stop-btn").addEventListener("click", () => {
      if (callbacks.onStop) callbacks.onStop();
    });

    const tableBody = document.getElementById("petaklien-table-body");
    if (tableBody) {
      tableBody.addEventListener("click", (e) => {
        if (e.target.closest("a")) return; // the WA chip handles itself
        const row = e.target.closest("tr[data-maps-url]");
        const url = row && row.getAttribute("data-maps-url");
        if (url) window.open(url, "_blank", "noopener");
      });
    }

    const batchDeepBtn = document.getElementById("petaklien-batch-deepsearch-btn");
    if (batchDeepBtn) {
      batchDeepBtn.addEventListener("click", () => {
        if (callbacks.onBatchDeepSearch) callbacks.onBatchDeepSearch();
      });
    }

    document.getElementById("petaklien-open-report-btn").addEventListener("click", () => {
      openReportTab(currentLeads);
    });

    document.getElementById("petaklien-export-xlsx-btn").addEventListener("click", () => {
      if (callbacks.onExportXLSX) callbacks.onExportXLSX();
    });

    document.getElementById("petaklien-export-csv-btn").addEventListener("click", () => {
      if (callbacks.onExportCSV) callbacks.onExportCSV();
    });

    const handleClearAction = async () => {
      const confirmed = await showClearConfirmDialog();
      if (!confirmed || !callbacks.onClear) return;
      const removed = callbacks.onClear();
      if (removed > 0) {
        showToast(`${removed} prospek dihapus`, { label: "Batalkan", onClick: restoreBackup });
      }
    };

    // Restore link in the empty Manifest
    if (tableBody) {
      tableBody.addEventListener("click", (e) => {
        if (e.target.closest("[data-restore]")) restoreBackup();
        if (e.target.closest("[data-dismiss-restore]")) dismissBackup();
      });
    }

    setupResize();

    const clearBtnTab1 = document.getElementById("petaklien-clear-btn-control");
    if (clearBtnTab1) clearBtnTab1.addEventListener("click", handleClearAction);

    const clearBtnTab2 = document.getElementById("petaklien-clear-btn");
    if (clearBtnTab2) clearBtnTab2.addEventListener("click", handleClearAction);
  }

  /**
   * Shows custom Archival Clear Confirmation Modal
   * Returns Promise: boolean (true = delete, false = cancel)
   */
  function showClearConfirmDialog() {
    return new Promise((resolve) => {
      const modal = document.getElementById("petaklien-clear-modal");
      const confirmBtn = document.getElementById("petaklien-clear-confirm-btn");
      const cancelBtn = document.getElementById("petaklien-clear-cancel-btn");
      const closeBtn = document.getElementById("petaklien-clear-modal-close-btn");

      modal.style.display = "flex";

      const cleanup = () => {
        modal.style.display = "none";
        confirmBtn.onclick = null;
        cancelBtn.onclick = null;
        closeBtn.onclick = null;
      };

      confirmBtn.onclick = () => {
        cleanup();
        resolve(true);
      };

      cancelBtn.onclick = () => {
        cleanup();
        resolve(false);
      };

      closeBtn.onclick = () => {
        cleanup();
        resolve(false);
      };
    });
  }

  /**
   * Shows custom Archival Alert / Notice Modal
   * Returns Promise: void (resolves when dismissed)
   */
  /** Kumo Badge variant for a dialog stamp: success / warning / error / info. */
  function stampVariant(stamp) {
    if (/SUKSES|SELESAI|BERHASIL/i.test(stamp)) return "success";
    if (/GAGAL|ERROR|HAPUS/i.test(stamp)) return "error";
    if (/PERHATIAN|PERINGATAN/i.test(stamp)) return "warning";
    return "info";
  }

  function showAlert(title = "Pemberitahuan", message = "", stamp = "INFORMASI") {
    return new Promise((resolve) => {
      const modal = document.getElementById("petaklien-alert-modal");
      if (!modal) {
        resolve();
        return;
      }
      const titleEl = document.getElementById("petaklien-alert-title");
      const msgEl = document.getElementById("petaklien-alert-message");
      const stampEl = document.getElementById("petaklien-alert-stamp");
      const okBtn = document.getElementById("petaklien-alert-ok-btn");
      const closeBtn = document.getElementById("petaklien-alert-close-btn");

      if (titleEl) titleEl.textContent = title;
      if (msgEl) {
        if (typeof message === "string" && (message.includes("<") || message.includes("\n"))) {
          if (message.includes("<")) {
            msgEl.innerHTML = message;
          } else {
            msgEl.innerHTML = message.replace(/\n/g, "<br/>");
          }
        } else {
          msgEl.textContent = message;
        }
      }
      if (stampEl) {
        stampEl.textContent = stamp.charAt(0) + stamp.slice(1).toLowerCase();
        stampEl.className = `petaklien-status-badge ${stampVariant(stamp)}`;
      }
      if (isCollapsed && /warning|error/.test(stampVariant(stamp))) {
        launcher.attention = true;
        renderLauncher();
      }
      modal.style.display = "flex";

      const cleanup = () => {
        modal.style.display = "none";
        if (okBtn) okBtn.onclick = null;
        if (closeBtn) closeBtn.onclick = null;
        resolve();
      };

      if (okBtn) okBtn.onclick = cleanup;
      if (closeBtn) closeBtn.onclick = cleanup;
    });
  }

  /**
   * Make launcher tab vertically draggable up and down along the right edge
   */
  function makeDraggable(el) {
    let startY = 0;
    let startTop = 0;
    let hasMoved = false;

    // Load saved vertical position
    loadPref("petaklien_launcher_top", "mapslead_launcher_top").then((savedTop) => {
      if (!savedTop) return;
      const topNum = parseInt(savedTop, 10);
      if (!isNaN(topNum)) {
        const maxTop = window.innerHeight - 60;
        el.style.top = Math.max(10, Math.min(maxTop, topNum)) + "px";
      }
    });

    el.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      startY = e.clientY;
      startTop = el.getBoundingClientRect().top;
      hasMoved = false;
      el.style.transition = "none";

      const onMouseMove = (moveEvent) => {
        const deltaY = moveEvent.clientY - startY;
        if (Math.abs(deltaY) > 3) {
          hasMoved = true;
        }
        let newTop = startTop + deltaY;
        const maxTop = window.innerHeight - el.offsetHeight - 10;
        newTop = Math.max(10, Math.min(maxTop, newTop));
        el.style.top = newTop + "px";
      };

      const onMouseUp = () => {
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
        el.style.transition = "";

        if (hasMoved) {
          savePref("petaklien_launcher_top", el.style.top);
        }
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    });

    el.addEventListener("click", (e) => {
      if (hasMoved) {
        e.preventDefault();
        e.stopPropagation();
        hasMoved = false;
        return;
      }
      setCollapsed(false);
    });
  }

  /**
   * Opens a standalone, beautifully formatted Web Report / PDF Viewer in a new browser tab
   */
  function openReportTab(leads) {
    if (!leads || leads.length === 0) {
      showAlert("Buku Manifest Kosong", "Belum ada data prospek yang tercatat di manifest.", "INFO");
      return;
    }

    // Report is an extension page (src/report/report.html) that reads chrome.storage directly.
    // The background worker opens it, so no pop-up permission or web_accessible_resources are needed.
    chrome.runtime.sendMessage({ type: "OPEN_REPORT" }, (res) => {
      if (chrome.runtime.lastError || !res || !res.ok) {
        showAlert("Gagal Membuka Laporan", "Tab laporan tidak dapat dibuka. Coba muat ulang ekstensi lalu ulangi.", "PERHATIAN");
      }
    });
  }

  /**
   * Toggles collapsed launcher vs expanded full sidebar
   */
  // --- Toast (with optional action, e.g. undo) ---
  /**
   * Toast with an optional action (e.g. undo). A bar along the bottom counts down
   * the time left; hovering pauses it, so there is time to read and click.
   */
  function showToast(message, action) {
    const el = document.getElementById("petaklien-toast");
    if (!el) return;
    const duration = action ? 8000 : 3000;
    el.textContent = "";
    const text = document.createElement("span");
    text.className = "petaklien-toast-text";
    text.textContent = message;
    el.appendChild(text);
    if (action) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "petaklien-toast-action";
      btn.textContent = action.label;
      btn.addEventListener("click", () => {
        el.classList.remove("is-visible");
        action.onClick();
      });
      el.appendChild(btn);
    }
    const bar = document.createElement("span");
    bar.className = "petaklien-toast-timer";
    bar.style.animationDuration = duration + "ms";
    // the bar's animation drives dismissal, so pausing it on hover also pauses the timeout
    bar.addEventListener("animationend", () => el.classList.remove("is-visible"));
    el.appendChild(bar);
    el.classList.add("is-visible");
  }

  // --- Light / dark theme (default light), shared with popup & report ---
  function applyTheme(theme) {
    const dark = theme === "dark";
    if (rootEl) rootEl.setAttribute("data-theme", dark ? "dark" : "light");
    const btn = document.getElementById("petaklien-theme-btn");
    if (btn) {
      btn.setAttribute("aria-pressed", String(dark));
      btn.title = dark ? "Mode terang" : "Mode gelap";
      btn.setAttribute("aria-label", btn.title);
    }
  }

  function setupTheme() {
    applyTheme("light");
    try {
      chrome.storage.local.get(["petaklien_theme"], (res) => applyTheme(res && res.petaklien_theme));
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && changes.petaklien_theme) applyTheme(changes.petaklien_theme.newValue);
      });
    } catch (e) {}
    const btn = document.getElementById("petaklien-theme-btn");
    if (btn) {
      btn.addEventListener("click", () => {
        const next = rootEl.getAttribute("data-theme") === "dark" ? "light" : "dark";
        applyTheme(next);
        savePref("petaklien_theme", next);
      });
    }
  }

  // --- #2 restore the last cleared data ---
  function restoreBackup() {
    if (!callbacks.onRestore) return;
    Promise.resolve(callbacks.onRestore()).then((n) => {
      showToast(n > 0 ? `${n} prospek dipulihkan` : "Tidak ada data untuk dipulihkan");
    });
  }

  function offerRestore() {
    try {
      chrome.storage.local.get(["mapsLeadsBackup"], (res) => {
        const stored = res && res.mapsLeadsBackup;
        const schema = window.PetaKlienSchema;
        const backup = schema && schema.usableBackup ? schema.usableBackup(stored) : stored;
        if (stored && !backup) chrome.storage.local.remove("mapsLeadsBackup"); // older than a week
        const slot = document.getElementById("petaklien-restore-slot");
        if (!slot || !backup || !Array.isArray(backup.leads) || !backup.leads.length) return;
        const when = new Date(backup.at).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
        slot.innerHTML = `<span class="petaklien-restore-row">
          <button type="button" class="petaklien-text-btn" data-restore>Pulihkan ${backup.leads.length} prospek yang dihapus (${escapeHtml(when)})</button>
          <button type="button" class="petaklien-text-btn is-danger" data-dismiss-restore title="Hapus cadangan ini secara permanen. Cadangan juga terhapus otomatis setelah 7 hari.">Hapus cadangan</button>
        </span>`;
      });
    } catch (e) {}
  }

  /** Deletes the backup behind the restore link for good, after a warning. */
  function dismissBackup() {
    chrome.storage.local.get(["mapsLeadsBackup"], async (res) => {
      const backup = res && res.mapsLeadsBackup;
      const n = backup && Array.isArray(backup.leads) ? backup.leads.length : 0;
      const when = backup && backup.at
        ? new Date(backup.at).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })
        : "";
      const ok = await showDangerConfirm({
        title: "Hapus cadangan permanen?",
        text: `${n} prospek yang dihapus${when ? ` pada ${when}` : ""} akan hilang selamanya dan tidak bisa dipulihkan lagi.`,
        note: "Status kontak (riwayat \"Pernah dihubungi\") tetap tersimpan.",
        confirmLabel: "Hapus permanen"
      });
      if (!ok) return;
      chrome.storage.local.remove("mapsLeadsBackup", () => {
        const slot = document.getElementById("petaklien-restore-slot");
        if (slot) slot.textContent = "";
        showToast(`Cadangan ${n} prospek dihapus permanen`);
      });
    });
  }

  /**
   * Warning dialog for an action that cannot be undone. Resolves true on confirm.
   * Batal has the focus, so Enter / Esc never destroy data by accident.
   */
  function showDangerConfirm({ title, text, note = "", confirmLabel = "Hapus permanen" }) {
    return new Promise((resolve) => {
      const $ = (id) => document.getElementById(id);
      const modal = $("petaklien-danger-modal");
      if (!modal) return resolve(false);
      $("petaklien-danger-title").textContent = title;
      $("petaklien-danger-text").textContent = text;
      const noteEl = $("petaklien-danger-note");
      noteEl.textContent = note;
      noteEl.hidden = !note;
      const confirmBtn = $("petaklien-danger-confirm-btn");
      confirmBtn.textContent = confirmLabel;
      const cancelBtn = $("petaklien-danger-cancel-btn");
      const closeBtn = $("petaklien-danger-close-btn");

      const done = (value) => {
        modal.style.display = "none";
        confirmBtn.onclick = cancelBtn.onclick = closeBtn.onclick = modal.onclick = null;
        modal.removeEventListener("keydown", onKey, true);
        resolve(value);
      };
      const onKey = (e) => {
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); done(false); }
      };
      confirmBtn.onclick = () => done(true);
      cancelBtn.onclick = () => done(false);
      closeBtn.onclick = () => done(false);
      modal.onclick = (e) => { if (e.target === modal) done(false); };
      modal.addEventListener("keydown", onKey, true);
      modal.style.display = "flex";
      cancelBtn.focus();
    });
  }

  function formatDuration(ms) {
    const min = Math.max(1, Math.round(ms / 60000));
    if (min < 60) return `${min} mnt`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m ? `${h} j ${m} mnt` : `${h} j`;
  }

  // --- #10 resizable panel (width remembered) ---
  const WIDTH_DEFAULT = 400;
  const WIDTH_MIN = 340;
  const WIDTH_MAX = 640;

  function applyWidth(px) {
    const card = document.getElementById("petaklien-card");
    if (!card) return;
    const width = Math.max(WIDTH_MIN, Math.min(WIDTH_MAX, Math.round(px)));
    card.style.width = width + "px";
    return width;
  }

  function setupResize() {
    const handle = document.getElementById("petaklien-resize-handle");
    if (!handle) return;
    loadPref("petaklien_sidebar_width").then((saved) => {
      const n = parseInt(saved, 10);
      if (!Number.isNaN(n)) applyWidth(n);
    });
    handle.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const card = document.getElementById("petaklien-card");
      card.classList.add("is-resizing");
      const onMove = (ev) => applyWidth(window.innerWidth - ev.clientX);
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        card.classList.remove("is-resizing");
        savePref("petaklien_sidebar_width", String(parseInt(card.style.width, 10) || WIDTH_DEFAULT));
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    });
    handle.addEventListener("dblclick", () => {
      applyWidth(WIDTH_DEFAULT);
      savePref("petaklien_sidebar_width", String(WIDTH_DEFAULT));
    });
    handle.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const card = document.getElementById("petaklien-card");
      const current = parseInt(card.style.width, 10) || WIDTH_DEFAULT;
      const width = applyWidth(current + (e.key === "ArrowLeft" ? 20 : -20));
      savePref("petaklien_sidebar_width", String(width));
    });
    handle.tabIndex = 0;
  }

  function setCollapsed(collapse) {
    isCollapsed = collapse;
    const cardEl = document.getElementById("petaklien-card");
    const launcherEl = document.getElementById("petaklien-launcher-btn");

    if (collapse) {
      cardEl.classList.add("collapsed");
      setTimeout(() => {
        if (isCollapsed) launcherEl.style.display = "flex";
      }, 200);
    } else {
      launcherEl.style.display = "none";
      cardEl.classList.remove("collapsed");
      launcher.attention = false;
      renderLauncher();
    }
  }

  /**
   * #1 Status-aware launcher: progress ring + coloured dot + short label.
   * idle · running (green, ring fills to the target) · paused (amber) ·
   * done (green check, a few seconds) · attention (red: an alert needs a look).
   */
  function renderLauncher() {
    const el = document.getElementById("petaklien-launcher-btn");
    if (!el) return;
    const state = launcher.attention ? "attention" : launcher.state;
    el.dataset.state = state;
    el.classList.toggle("is-indeterminate", launcher.infinite && launcher.state === "running");
    const fill = document.getElementById("petaklien-launcher-ring-fill");
    if (fill) fill.style.strokeDashoffset = String(100 - launcher.pct);
    const sub = document.getElementById("petaklien-launcher-sub");
    const progress = launcher.infinite || !launcher.target ? "" : ` · ${Math.min(launcher.count || 0, launcher.target)}/${launcher.target}`;
    const label = {
      running: `Memindai${progress}`,
      paused: `Jeda${progress}`,
      done: "Selesai",
      attention: "Perlu dicek"
    }[state] || "";
    if (sub) {
      sub.textContent = label;
      sub.hidden = !label;
    }
    const n = launcher.count || 0;
    el.title = (label ? `${label}. ` : "") + `${n} prospek. Klik untuk membuka PetaKlien (bisa digeser ke atas/bawah)`;
    el.setAttribute("aria-label", `PetaKlien: ${n} prospek${label ? ", " + label : ""}`);
  }

  function setLauncherState(next) {
    if (launcher.state === next) return;
    clearTimeout(launcher.doneTimer);
    launcher.state = next;
    if (next === "done") {
      launcher.doneTimer = setTimeout(() => {
        if (launcher.state === "done") { launcher.state = "idle"; renderLauncher(); }
      }, 8000);
    }
    renderLauncher();
  }

  /** #3 "+N" flies up from the count when new leads come in. */
  function bumpLauncher(gained) {
    const bump = document.getElementById("petaklien-launcher-bump");
    const el = document.getElementById("petaklien-launcher-btn");
    if (!bump || !el || gained <= 0) return;
    bump.textContent = `+${gained}`;
    el.classList.remove("is-bumping");
    void el.offsetWidth; // restart the animation
    el.classList.add("is-bumping");
    clearTimeout(launcher.bumpTimer);
    launcher.bumpTimer = setTimeout(() => el.classList.remove("is-bumping"), 1200);
  }

  /**
   * Update UI status state
   */
  function updateState(state, message, isBatchDeepSearching = false) {
    const busy = state === "RUNNING" || isBatchDeepSearching;
    if (busy) setLauncherState("running");
    else if (state === "PAUSED") setLauncherState("paused");
    else if (launcher.state === "running" && state === "IDLE" && /^Selesai/i.test(message || "")) setLauncherState("done");
    else if (launcher.state !== "done") setLauncherState("idle");
    const startBtn = document.getElementById("petaklien-start-btn");
    const pauseBtn = document.getElementById("petaklien-pause-btn");
    const resumeBtn = document.getElementById("petaklien-resume-btn");
    const stopBtn = document.getElementById("petaklien-stop-btn");
    const filterSelect = document.getElementById("petaklien-filter-select");
    const limitInput = document.getElementById("petaklien-limit-input");
    const limitPreset = document.getElementById("petaklien-limit-preset");
    const keywordInput = document.getElementById("petaklien-search-keyword");
    const locationInput = document.getElementById("petaklien-search-location");
    const statusBadge = document.getElementById("petaklien-status-badge");
    const statusText = document.getElementById("petaklien-status-text");
    const batchDeepBtn = document.getElementById("petaklien-batch-deepsearch-btn");
    const modalBatchDeepBtn = document.getElementById("btn-batch-deepsearch");

    if (isBatchDeepSearching) {
      statusBadge.className = "petaklien-status-badge running";
      statusBadge.textContent = "Deep Search";
    } else {
      statusBadge.className = `petaklien-status-badge ${state.toLowerCase()}`;
      statusBadge.textContent = state === "RUNNING" ? "Memindai" : state === "PAUSED" ? "Jeda" : state === "STOPPED" ? "Berhenti" : "Siap";
    }

    if (message) {
      statusText.textContent = message;
      statusText.title = message;
    }

    const isBusy = state === "RUNNING" || state === "PAUSED" || Boolean(isBatchDeepSearching);
    const clearCtlBtn = document.getElementById("petaklien-clear-btn-control");
    if (clearCtlBtn) clearCtlBtn.style.display = isBusy ? "none" : "inline-flex";
    if (filterSelect) filterSelect.disabled = isBusy;
    if (limitInput) limitInput.disabled = isBusy;
    if (limitPreset) limitPreset.disabled = isBusy;
    if (keywordInput) keywordInput.disabled = isBusy;
    if (locationInput) locationInput.disabled = isBusy;
    const gridToggle = document.getElementById("petaklien-gridscan-toggle");
    if (gridToggle && locationInput) gridToggle.disabled = isBusy || !locationInput.value.trim();
    if (batchDeepBtn) {
      batchDeepBtn.disabled = isBusy;
      batchDeepBtn.classList.toggle("is-loading", Boolean(isBatchDeepSearching));
      batchDeepBtn.setAttribute("aria-busy", String(Boolean(isBatchDeepSearching)));
      batchDeepBtn.textContent = isBatchDeepSearching ? "Sedang melacak" : "Lacak Deep Search";
    }
    if (modalBatchDeepBtn) modalBatchDeepBtn.disabled = isBusy;

    if (isBatchDeepSearching) {
      if (startBtn) startBtn.style.display = "none";
      if (pauseBtn) pauseBtn.style.display = "none";
      if (resumeBtn) resumeBtn.style.display = "none";
      if (stopBtn) stopBtn.style.display = "none";
    } else if (state === "RUNNING") {
      if (startBtn) startBtn.style.display = "none";
      if (pauseBtn) pauseBtn.style.display = "inline-flex";
      if (resumeBtn) resumeBtn.style.display = "none";
      if (stopBtn) stopBtn.style.display = "inline-flex";
    } else if (state === "PAUSED") {
      if (startBtn) startBtn.style.display = "none";
      if (pauseBtn) pauseBtn.style.display = "none";
      if (resumeBtn) resumeBtn.style.display = "inline-flex";
      if (stopBtn) stopBtn.style.display = "inline-flex";
    } else {
      if (startBtn) startBtn.style.display = "inline-flex";
      if (pauseBtn) pauseBtn.style.display = "none";
      if (resumeBtn) resumeBtn.style.display = "none";
      if (stopBtn) stopBtn.style.display = "none";
    }
  }

  /**
   * Update statistics
   */
  function updateStats(stats) {
    const { scannedCount, targetLimit, leads, noWebCount, socialCount, hasWebCount } = stats;

    const countLeadsEl = document.getElementById("petaklien-count-leads");
    if (countLeadsEl) countLeadsEl.textContent = leads.length;
    const countNoWebEl = document.getElementById("petaklien-count-noweb");
    if (countNoWebEl) countNoWebEl.textContent = noWebCount;
    const countSocialEl = document.getElementById("petaklien-count-social");
    if (countSocialEl) countSocialEl.textContent = socialCount;
    const scannedTotalEl = document.getElementById("petaklien-scanned-total");
    if (scannedTotalEl) scannedTotalEl.textContent = `${scannedCount} dipindai`;
    const tabCountEl = document.getElementById("petaklien-tab-count");
    if (tabCountEl) tabCountEl.textContent = leads.length;
    const launcherCountEl = document.getElementById("petaklien-launcher-count");
    if (launcherCountEl) launcherCountEl.textContent = leads.length;

    const max = targetLimit > 0 ? targetLimit : 20;
    const isInfinite = max >= 999999;
    const current = Math.min(leads.length, max);
    const pct = isInfinite ? (leads.length > 0 ? Math.min(100, (leads.length % 50) * 2 + 10) : 0) : Math.min(100, Math.round((current / max) * 100));

    const progressFillEl = document.getElementById("petaklien-progress-fill");
    if (progressFillEl) progressFillEl.style.width = `${pct}%`;
    if (launcher.count !== null && leads.length > launcher.count && launcher.state === "running") bumpLauncher(leads.length - launcher.count);
    launcher.count = leads.length;
    launcher.pct = isInfinite ? 30 : pct;
    launcher.infinite = isInfinite;
    launcher.target = isInfinite ? 0 : max;
    renderLauncher();
    const progressLabelEl = document.getElementById("petaklien-progress-label");
    if (progressLabelEl) progressLabelEl.textContent = `${leads.length} / ${isInfinite ? "∞" : targetLimit} prospek`;
    const progressPctEl = document.getElementById("petaklien-progress-pct");
    if (progressPctEl) {
      let eta;
      if (stats.etaMs > 0) eta = `± ${formatDuration(stats.etaMs)} lagi`;
      else if (stats.elapsedMs > 0) eta = `berjalan ${formatDuration(stats.elapsedMs)}`;
      else eta = isInfinite ? "" : `${pct}%`;
      progressPctEl.textContent = eta;
      progressPctEl.title = stats.etaMs > 0
        ? "Perkiraan dari kecepatan menemukan prospek di sesi ini"
        : "Estimasi sisa waktu muncul setelah prospek baru pertama di sesi ini ditemukan";
    }

    renderRecent(leads);
    renderTable(leads);
  }

  /**
   * Renders preview table
   */
  function badgesFor(lead) {
    const ws = lead.websiteStatus || "Tidak Ada Website";
    let html;
    if (ws.includes("Web Resmi (Deep)") && ws.includes("Medsos")) {
      html = `<span class="petaklien-badge-tag deep-web">Web (deep)</span> <span class="petaklien-badge-tag social">Medsos</span>`;
    } else if (ws.includes("Hanya Medsos") && ws.includes("Verifikasi Deep")) {
      html = `<span class="petaklien-badge-tag social">Hanya medsos</span> <span class="petaklien-badge-tag verified"><svg width="12" height="12" viewBox="0 0 256 256" aria-hidden="true"><path fill="currentColor" d="M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z"/></svg>Deep</span>`;
    } else if (ws.includes("Tidak Ada Website") && ws.includes("Verifikasi Deep")) {
      html = `<span class="petaklien-badge-tag no-web">Tanpa web</span> <span class="petaklien-badge-tag verified"><svg width="12" height="12" viewBox="0 0 256 256" aria-hidden="true"><path fill="currentColor" d="M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z"/></svg>Deep</span>`;
    } else if (ws.includes("Hanya Medsos (Hasil Deep")) {
      html = `<span class="petaklien-badge-tag social">Medsos (deep)</span>`;
    } else if (ws.includes("Ada Web (Hasil Deep") || ws.includes("Web Resmi (Deep")) {
      html = `<span class="petaklien-badge-tag deep-web">Web (deep)</span>`;
    } else if (ws.includes("Hanya Medsos")) {
      html = `<span class="petaklien-badge-tag social">Hanya medsos</span>`;
    } else if (ws === "Ada Website") {
      html = `<span class="petaklien-badge-tag has-web">Ada web</span>`;
    } else {
      html = `<span class="petaklien-badge-tag no-web">Tanpa web</span>`;
    }
    if (lead.deepSearchFailed) {
      html += ` <span class="petaklien-badge-tag pending" title="Deep Search gagal (dibatasi Google). Lacak ulang dari tombol Lacak Deep Search.">Belum dicek</span>`;
    }
    if (lead.previouslyContacted) {
      const when = lead.statusChangedAt ? new Date(lead.statusChangedAt).toLocaleDateString("id-ID") : "sebelumnya";
      html += ` <span class="petaklien-badge-tag history" title="Pernah dihubungi (${escapeHtml(lead.outreachStatus || "")}, ${escapeHtml(when)}) sebelum data dikosongkan">Pernah dihubungi</span>`;
    }
    return html;
  }

  /** #7: the three newest leads, shown in the Hasil card while a run is active. */
  function renderRecent(leads) {
    const list = document.getElementById("petaklien-recent");
    if (!list) return;
    list.innerHTML = leads.slice(-3).reverse().map((lead) => `
      <li>
        <span class="petaklien-recent-title" title="${escapeHtml(lead.title)}">${escapeHtml(lead.title)}</span>
        <span class="petaklien-recent-tags">${badgesFor(lead)}</span>
      </li>`).join("");
  }

  function waLinkFor(phone) {
    const digits = (phone || "").replace(/[^0-9]/g, "");
    if (!(digits.startsWith("08") || digits.startsWith("628"))) return "";
    return "https://wa.me/" + (digits.startsWith("0") ? "62" + digits.slice(1) : digits);
  }

  function renderTable(leads) {
    currentLeads = leads;
    const tbody = document.getElementById("petaklien-table-body");
    if (!tbody) return;

    if (leads.length === 0) {
      tbody.innerHTML = `<tr><td colspan="3" class="petaklien-empty">Belum ada data. Mulai dari tab Kontrol.<span id="petaklien-restore-slot"></span></td></tr>`;
      offerRestore();
      return;
    }

    const displayLeads = leads.slice(-100).reverse();
    tbody.innerHTML = displayLeads
      .map((lead) => {
        const badgesHtml = badgesFor(lead);
        const phone = lead.phone || "-";
        const mapsUrl = /^https?:\/\//i.test(lead.mapsUrl || "") ? lead.mapsUrl : "";
        const waUrl = waLinkFor(phone);
        return `
          <tr class="${mapsUrl ? "is-clickable" : ""}" data-maps-url="${escapeHtml(mapsUrl)}" title="${mapsUrl ? "Klik untuk membuka di Google Maps (tab baru)" : ""}">
            <td>
              <span class="petaklien-cell-title">${escapeHtml(lead.title)}</span>
              <span class="petaklien-cell-sub">${escapeHtml(lead.category || "Instansi")}</span>
            </td>
            <td><div class="petaklien-cell-tags">${badgesHtml}</div></td>
            <td class="petaklien-cell-mono">
              <span title="${escapeHtml(phone)}">${escapeHtml(phone)}</span>
              ${waUrl ? `<a class="petaklien-wa-chip" href="${escapeHtml(waUrl)}" target="_blank" rel="noopener" title="Chat WhatsApp">WA</a>` : ""}
            </td>
          </tr>`;
      })
      .join("");
  }

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // --- Advanced filters: active preset + "N aktif" badge ---
  let activePreset = "";

  function setActivePreset(name) {
    activePreset = name || "";
    document.querySelectorAll("#petaklien-adv-box [data-preset]").forEach((chip) => {
      const on = chip.getAttribute("data-preset") === activePreset;
      chip.classList.toggle("is-active", on);
      chip.setAttribute("aria-pressed", String(on));
    });
    savePref("petaklien_adv_preset", activePreset);
    updateAdvCount();
  }

  /** Counts filters that differ from the defaults, so a collapsed panel still shows they apply. */
  function countAdvFilters() {
    const v = (id) => (document.getElementById(id) || {}).value || "";
    let n = 0;
    if (v("petaklien-adv-contact") && v("petaklien-adv-contact") !== "all") n++;
    if (parseFloat(v("petaklien-adv-min-rating")) > 0) n++;
    if (parseInt(v("petaklien-adv-min-reviews"), 10) > 0) n++;
    if (parseInt(v("petaklien-adv-max-reviews"), 10) > 0) n++;
    if (v("petaklien-adv-include-kw").trim()) n++;
    if (v("petaklien-adv-exclude-kw").trim()) n++;
    if (v("petaklien-adv-location").trim()) n++;
    const free = document.getElementById("petaklien-adv-free-builders");
    if (free && !free.checked) n++;
    return n;
  }

  function updateAdvCount() {
    const n = countAdvFilters();
    const enabledEl = document.getElementById("petaklien-adv-enabled");
    const on = Boolean(enabledEl && enabledEl.checked);
    const badge = document.getElementById("petaklien-adv-count");
    if (!badge) return;
    badge.hidden = n === 0;
    badge.classList.toggle("is-off", !on);
    badge.textContent = on ? `${n} aktif` : "nonaktif";
    badge.title = on
      ? "Filter ini dipakai saat Mulai otomasi, walau panelnya tertutup"
      : `${n} filter tersimpan tapi tidak dipakai. Nyalakan switch untuk memakainya.`;
  }

  function setAdvEnabled(on, { save = true } = {}) {
    const el = document.getElementById("petaklien-adv-enabled");
    if (el) el.checked = Boolean(on);
    const box = document.getElementById("petaklien-adv-box");
    if (box) {
      box.classList.toggle("is-off", !on);
      // switched off: every control is locked; turn the switch on first
      box.querySelectorAll("input, select, button").forEach((el) => { el.disabled = !on; });
      box.setAttribute("aria-disabled", String(!on));
    }
    if (save) savePref("petaklien_adv_enabled", on ? "1" : "0");
    updateAdvCount();
  }

  function applyAdvPreset(presetName) {
    // Every preset starts from the defaults, so values of a previous preset never linger
    if (presetName !== "reset") applyAdvPreset("reset");
    const contactEl = document.getElementById("petaklien-adv-contact");
    const ratingEl = document.getElementById("petaklien-adv-min-rating");
    const minRevEl = document.getElementById("petaklien-adv-min-reviews");
    const maxRevEl = document.getElementById("petaklien-adv-max-reviews");
    const incKwEl = document.getElementById("petaklien-adv-include-kw");
    const excKwEl = document.getElementById("petaklien-adv-exclude-kw");
    const locEl = document.getElementById("petaklien-adv-location");
    const freeBuildEl = document.getElementById("petaklien-adv-free-builders");

    if (presetName === "hot_leads") {
      if (contactEl) contactEl.value = "wa_only";
      if (ratingEl) ratingEl.value = "4.0";
      if (minRevEl) minRevEl.value = "10";
      if (maxRevEl) maxRevEl.value = "";
      if (freeBuildEl) freeBuildEl.checked = true;
      if (excKwEl && !excKwEl.value) excKwEl.value = "Cabang, Franchise, Negeri";
    } else if (presetName === "skripsi") {
      if (contactEl) contactEl.value = "has_phone";
      if (ratingEl) ratingEl.value = "4.0";
      if (minRevEl) minRevEl.value = "25";
      if (maxRevEl) maxRevEl.value = "";
      if (freeBuildEl) freeBuildEl.checked = true;
    } else if (presetName === "wa_only") {
      if (contactEl) contactEl.value = "wa_only";
      if (ratingEl) ratingEl.value = "0";
      if (minRevEl) minRevEl.value = "";
      if (maxRevEl) maxRevEl.value = "";
    } else if (presetName === "reset") {
      if (contactEl) contactEl.value = "all";
      if (ratingEl) ratingEl.value = "0";
      if (minRevEl) minRevEl.value = "";
      if (maxRevEl) maxRevEl.value = "";
      if (incKwEl) incKwEl.value = "";
      if (excKwEl) excKwEl.value = "";
      if (locEl) locEl.value = "";
      if (freeBuildEl) freeBuildEl.checked = true;
    }
    if (presetName === "reset") {
      activePreset = "";
      return;
    }
    setActivePreset(presetName);
    setAdvEnabled(true);
  }

  return {
    init,
    updateState,
    updateStats,
    setCollapsed,
    showAlert,
    showToast,
    applyAdvPreset
  };
})();
