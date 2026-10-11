/**
 * PetaKlien - Report Page (Spreadsheet Viewer, Mini-CRM & Pitching Hub)
 * Runs as an extension page: data lives in chrome.storage.local ("mapsLeadsData"),
 * which is also how status edits sync back to the Google Maps sidebar.
 */

(function () {
  "use strict";

  const { statusKind, countLeads, leadKey, escapeHtml, safeHttpUrl, OUTREACH_STATUSES, STORAGE_KEYS, historyEntryFor } = window.PetaKlienSchema;
  const { performAutoDeepSearch, applyDeepSearchResult, createDeepSearchGuard } = window.PetaKlienDeepSearch;
  const Exporter = window.PetaKlienExporter;
  const { getPitchTemplateText } = window.PetaKlienPitch;

  const STORAGE_KEY = "mapsLeadsData";
  const PREF_CUSTOM_TEMPLATE = "petaklien_custom_pitch_template";
  const PREF_PITCH_INTENT = "petaklien_pitch_intent";
  const PREF_TEMPLATES = "petaklien_pitch_templates";       // [{ id, name, text }]
  const PREF_TEMPLATE_ID = "petaklien_pitch_template_id";

  let leads = [];
  let prefs = { [PREF_PITCH_INTENT]: "business", [PREF_TEMPLATE_ID]: "" };
  let currentPitchLead = null;
  let isBatchRunning = false;

  // View state (#4): filter chip, search text, sort column
  const FOLLOW_UP_AFTER_DAYS = 3;
  const view = { filter: "all", query: "", sortCol: null, sortDir: 1 };

  // #5 row selection (keys) and #7 active cell, both survive re-renders
  const selection = new Set();
  let selectionAnchor = null;
  let active = null; // { key, col }
  let templates = [];

  const $ = (id) => document.getElementById(id);

  // --- Storage ---

  async function loadLeads() {
    const res = await chrome.storage.local.get(STORAGE_KEY);
    return Array.isArray(res[STORAGE_KEY]) ? res[STORAGE_KEY] : [];
  }

  /**
   * Read-modify-write one lead by key. `updatedAt` lets the Maps tab accept this edit
   * over any older snapshot it may still be holding.
   */
  async function patchLead(key, patch) {
    const list = await loadLeads();
    const target = list.find((l) => leadKey(l) === key);
    if (!target) return false;
    Object.assign(target, patch, { updatedAt: Date.now() });
    await chrome.storage.local.set({ [STORAGE_KEY]: list });
    return true;
  }

  /** #4: remember outreach per place so it survives clearing and re-scraping. */
  async function recordHistory(list) {
    const res = await chrome.storage.local.get(STORAGE_KEYS.history);
    const history = res[STORAGE_KEYS.history] || {};
    for (const lead of list) {
      const entry = historyEntryFor(lead);
      if (entry) history[leadKey(lead)] = entry;
      else delete history[leadKey(lead)];
    }
    await chrome.storage.local.set({ [STORAGE_KEYS.history]: history });
  }

  // --- Rendering ---

  // Kumo Badge variants (styled in report.css)
  const PILL = {
    webDeep: '<span class="excel-pill pill-deep">Web (deep)</span>',
    medsos: '<span class="excel-pill pill-social">Medsos</span>',
    onlyMedsos: '<span class="excel-pill pill-social">Hanya medsos</span>',
    medsosDeep: '<span class="excel-pill pill-social">Medsos (deep)</span>',
    verified: '<span class="excel-pill pill-verified"><svg width="12" height="12" viewBox="0 0 256 256" aria-hidden="true"><path fill="currentColor" d="M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z"/></svg>Deep</span>',
    noWeb: '<span class="excel-pill pill-noweb">Tanpa web</span>',
    hasWeb: '<span class="excel-pill pill-neutral">Ada web</span>'
  };
  const pair = (a, b) => `<span class="excel-pill-group">${a}${b}</span>`;

  function statusBadgeHtml(websiteStatus) {
    const ws = websiteStatus || "Tidak Ada Website";
    if (ws.includes("Web Resmi (Deep)") && ws.includes("Medsos")) return pair(PILL.webDeep, PILL.medsos);
    if (ws.includes("Hanya Medsos") && ws.includes("Verifikasi Deep")) return pair(PILL.onlyMedsos, PILL.verified);
    if (ws.includes("Tidak Ada Website") && ws.includes("Verifikasi Deep")) return pair(PILL.noWeb, PILL.verified);
    if (ws.includes("Hanya Medsos (Hasil Deep")) return PILL.medsosDeep;
    if (ws.includes("Ada Web (Hasil Deep") || ws.includes("Web Resmi (Deep")) return PILL.webDeep;
    if (ws.includes("Hanya Medsos")) return PILL.onlyMedsos;
    if (ws === "Ada Website") return PILL.hasWeb;
    return PILL.noWeb;
  }

  function statusCellHtml(lead) {
    const html = statusBadgeHtml(lead.websiteStatus);
    if (!lead.deepSearchFailed) return html;
    return `<span class="excel-pill-group">${html}<span class="excel-pill pill-pending" title="Deep Search gagal (dibatasi Google). Jalankan Lacak Deep Search massal untuk mengecek ulang.">Belum dicek</span></span>`;
  }

  const DASH = '<span class="excel-muted">-</span>';

  const NOT_CONTACTED = "Belum Dihubungi";
  const isPending = (lead) => !lead.outreachStatus || lead.outreachStatus === NOT_CONTACTED;
  const hasWhatsApp = (lead) => (lead.waUrl && lead.waUrl !== "-") || isMobile(lead.phone || "");

  function isMobile(phone) {
    return phone.startsWith("08") || phone.startsWith("628") || phone.startsWith("+628");
  }

  function webCellHtml(lead) {
    const url = safeHttpUrl(lead.websiteUrl);
    if (url !== "-") {
      return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener" class="excel-link">${escapeHtml(url)}</a>`;
    }
    return `<a href="${escapeHtml(Exporter.googleSearchUrl(lead))}" target="_blank" rel="noopener" class="excel-link excel-link-search" title="Deep Search: Lacak keberadaan website resmi di Google Search">Lacak di Google</a>`;
  }

  function socialCellHtml(lead) {
    const url = safeHttpUrl(lead.socialUrl);
    return url !== "-"
      ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener" class="excel-link">${escapeHtml(url)}</a>`
      : DASH;
  }

  function emailCellHtml(lead) {
    const email = lead.email || "-";
    return email !== "-"
      ? `<a href="mailto:${escapeHtml(email)}" class="excel-link">${escapeHtml(email)}</a>`
      : DASH;
  }

  function techCellHtml(lead) {
    const tech = lead.techStack || "-";
    return tech !== "-"
      ? `<span class="excel-pill pill-tech">${escapeHtml(tech)}</span>`
      : DASH;
  }

  const relTime = new Intl.RelativeTimeFormat("id", { numeric: "auto" });
  function timeAgo(ms) {
    const diffMin = Math.round((ms - Date.now()) / 60000);
    if (Math.abs(diffMin) < 60) return relTime.format(diffMin, "minute");
    const diffHour = Math.round(diffMin / 60);
    if (Math.abs(diffHour) < 24) return relTime.format(diffHour, "hour");
    return relTime.format(Math.round(diffHour / 24), "day");
  }

  /** "Perlu follow-up": interested, or messaged FOLLOW_UP_AFTER_DAYS+ days ago without an answer. */
  function needsFollowUp(lead) {
    if (lead.outreachStatus === "Tertarik / Follow-Up") return true;
    return lead.outreachStatus === "Terkirim WA" && lead.statusChangedAt &&
      Date.now() - lead.statusChangedAt >= FOLLOW_UP_AFTER_DAYS * 86400000;
  }

  function outreachCellHtml(lead) {
    const outreach = lead.outreachStatus || NOT_CONTACTED;
    const select = `<select class="excel-status-select" data-status="${escapeHtml(outreach)}">${OUTREACH_STATUSES.map((s) =>
      `<option value="${escapeHtml(s)}"${s === outreach ? " selected" : ""}>${escapeHtml(s)}</option>`).join("")}</select>`;
    if (!lead.statusChangedAt || outreach === NOT_CONTACTED) return select;
    const due = needsFollowUp(lead) ? " is-due" : "";
    const title = new Date(lead.statusChangedAt).toLocaleString("id-ID");
    const past = lead.previouslyContacted ? " · dari riwayat" : "";
    return `<span class="excel-status-wrap">${select}<span class="excel-status-age${due}" title="Status diubah ${escapeHtml(title)}${lead.previouslyContacted ? " (sebelum data dikosongkan)" : ""}">${escapeHtml(timeAgo(lead.statusChangedAt) + past)}</span></span>`;
  }

  function rowHtml(lead, idx, originalIdx = idx) {
    const rowNum = idx + 2; // Row 1 is the header
    const key = leadKey(lead);
    const phone = lead.phone || "-";
    const phoneType = lead.phoneType || (isMobile(phone) ? "Seluler (WhatsApp)" : (phone !== "-" ? "Telepon Kantor" : "-"));
    const hasWa = hasWhatsApp(lead);
    const outreach = lead.outreachStatus || "Belum Dihubungi";
    const mapsUrl = safeHttpUrl(lead.mapsUrl);
    const cell = (col, cls, html) => `<td class="excel-cell ${cls}" data-col="${col}" data-coord="${col}${rowNum}">${html}</td>`;

    return `
      <tr data-row="${rowNum}" data-key="${escapeHtml(key)}"${selection.has(key) ? ' class="is-selected" aria-selected="true"' : ""}>
        <th class="excel-row-num" title="Klik untuk memilih baris (Shift: rentang)">${rowNum}</th>
        ${cell("A", "text-center", originalIdx + 1)}
        ${cell("B", "text-left font-bold excel-name-cell", `<div class="excel-name-wrap"><span class="excel-name-text">${escapeHtml(lead.title)}</span>${hasWa
          ? `<button type="button" class="excel-name-wa" data-action="open-pitch" aria-label="Kirim WhatsApp ke ${escapeHtml(lead.title)}" title="Kirim WhatsApp"><svg width="15" height="15" viewBox="0 0 256 256" aria-hidden="true"><path fill="currentColor" d="M187.58,144.84l-32-16a8,8,0,0,0-8,.5l-14.69,9.8a40.55,40.55,0,0,1-16-16l9.8-14.69a8,8,0,0,0,.5-8l-16-32A8,8,0,0,0,104,64a40,40,0,0,0-40,40,88.1,88.1,0,0,0,88,88,40,40,0,0,0,40-40A8,8,0,0,0,187.58,144.84ZM152,176a72.08,72.08,0,0,1-72-72A24,24,0,0,1,99.29,80.46l11.48,23L101,118a8,8,0,0,0-.73,7.51,56.47,56.47,0,0,0,30.15,30.15A8,8,0,0,0,138,155l14.61-9.74,23,11.48A24,24,0,0,1,152,176ZM128,24A104,104,0,0,0,36.18,176.88L24.83,210.93a16,16,0,0,0,20.24,20.24l34.05-11.35A104,104,0,1,0,128,24Zm0,192a87.87,87.87,0,0,1-44.06-11.81,8,8,0,0,0-6.54-.67L40,216,52.47,178.6a8,8,0,0,0-.66-6.54A88,88,0,1,1,128,216Z"/></svg></button>`
          : ""}</div>`)}
        ${cell("C", "text-left", escapeHtml(lead.category || "Instansi / Usaha"))}
        ${cell("D", "text-center", statusCellHtml(lead))}
        ${cell("E", "text-left", webCellHtml(lead))}
        ${cell("F", "text-left", socialCellHtml(lead))}
        ${cell("G", "text-left font-mono", emailCellHtml(lead))}
        ${cell("H", "text-center", techCellHtml(lead))}
        ${cell("I", "text-left font-mono", escapeHtml(phone))}
        ${cell("J", "text-center", `<span class="excel-pill pill-neutral">${escapeHtml(phoneType)}</span>`)}
        ${cell("K", "text-center", hasWa
          ? `<button class="excel-pitch-btn" data-action="open-pitch" title="Buka Generator Penawaran & WhatsApp">Kirim WA</button>`
          : DASH)}
        ${cell("L", "text-left", escapeHtml(lead.address || "-"))}
        ${cell("M", "text-center font-mono", escapeHtml(lead.rating || "-"))}
        ${cell("N", "text-center font-mono", escapeHtml(lead.reviewsCount || "0"))}
        ${cell("O", "text-center", outreachCellHtml(lead))}
        ${cell("P", "text-left", mapsUrl !== "-" ? `<a href="${escapeHtml(mapsUrl)}" target="_blank" rel="noopener" class="excel-link">Buka di Maps</a>` : "-")}
        ${cell("Q", "text-center font-mono", escapeHtml(lead.scrapedAt || "-"))}
        ${cell("R", "text-left excel-note-cell", `<input class="excel-note-input" type="text" value="${escapeHtml(lead.note || "")}" placeholder="Tambah catatan…" maxlength="500" aria-label="Catatan untuk ${escapeHtml(lead.title)}" />`)}
      </tr>`;
  }

  function renderStatusBar() {
    const c = countLeads(leads);
    // Numbers only, so building HTML here is safe
    $("excel-status-info").innerHTML = [
      `<span><b>${leads.length}</b> prospek</span>`,
      `<span class="stat-noweb"><b>${c.none}</b> tanpa web</span>`,
      `<span class="stat-extra"><b>${c.social}</b> medsos</span>`,
      `<span class="stat-extra"><b>${c.web}</b> ada web</span>`
    ].join('<span class="excel-status-sep"></span>');
  }

  const FILTERS = {
    all: () => true,
    noweb: (l) => statusKind(l.websiteStatus) === "none",
    social: (l) => statusKind(l.websiteStatus) === "social",
    pending: (l) => isPending(l),
    followup: needsFollowUp,
    unchecked: (l) => Boolean(l.deepSearchFailed)
  };

  const STATUS_ORDER = { none: 0, social: 1, web: 2 };
  const num = (v) => {
    const n = parseFloat(String(v || "").replace(",", "."));
    return Number.isNaN(n) ? -1 : n;
  };
  const SORT_KEYS = {
    A: (l, i) => i,
    B: (l) => (l.title || "").toLowerCase(),
    C: (l) => (l.category || "").toLowerCase(),
    D: (l) => STATUS_ORDER[statusKind(l.websiteStatus)],
    H: (l) => (l.techStack && l.techStack !== "-" ? l.techStack.toLowerCase() : "~"),
    J: (l) => (l.phoneType || "").toLowerCase(),
    L: (l) => (l.address || "").toLowerCase(),
    M: (l) => num(l.rating),
    N: (l) => num(l.reviewsCount),
    O: (l) => OUTREACH_STATUSES.indexOf(l.outreachStatus || NOT_CONTACTED),
    Q: (l, i) => i
  };

  function matchesQuery(lead, q) {
    if (!q) return true;
    return [lead.title, lead.category, lead.address, lead.phone, lead.email]
      .some((v) => (v || "").toLowerCase().includes(q));
  }

  /** Rows to show, as [lead, originalIndex] pairs. */
  function visibleRows() {
    const pred = FILTERS[view.filter] || FILTERS.all;
    const q = view.query.trim().toLowerCase();
    const rows = leads.map((l, i) => [l, i]).filter(([l]) => pred(l) && matchesQuery(l, q));
    const key = view.sortCol && SORT_KEYS[view.sortCol];
    if (key) {
      rows.sort(([a, ia], [b, ib]) => {
        const ka = key(a, ia);
        const kb = key(b, ib);
        return (ka < kb ? -1 : ka > kb ? 1 : ia - ib) * view.sortDir;
      });
    }
    return rows;
  }

  function renderFilterBar() {
    document.querySelectorAll("[data-filter]").forEach((chip) => {
      const name = chip.getAttribute("data-filter");
      chip.classList.toggle("on", name === view.filter);
      chip.setAttribute("aria-pressed", String(name === view.filter));
      const count = chip.querySelector(".chip-count");
      if (count) count.textContent = leads.filter(FILTERS[name]).length;
    });
    document.querySelectorAll("tr.excel-header-row td[data-col]").forEach((td) => {
      const col = td.getAttribute("data-col");
      td.classList.toggle("is-sortable", Boolean(SORT_KEYS[col]));
      if (col === view.sortCol) td.setAttribute("data-sort", view.sortDir > 0 ? "asc" : "desc");
      else td.removeAttribute("data-sort");
    });
  }

  function renderRows() {
    const tbody = $("excel-data-rows");
    const rows = visibleRows();
    if (!leads.length) {
      tbody.innerHTML = `<tr><td class="excel-cell excel-empty" colspan="18">Belum ada data prospek. Jalankan otomasi di Google Maps terlebih dahulu.</td></tr>`;
    } else if (!rows.length) {
      tbody.innerHTML = `<tr><td class="excel-cell excel-empty" colspan="18">Tidak ada prospek yang cocok dengan filter ini. <button type="button" class="excel-link-btn" data-action="reset-view">Tampilkan semua</button></td></tr>`;
    } else {
      tbody.innerHTML = rows.map(([lead, originalIdx], idx) => rowHtml(lead, idx, originalIdx)).join("");
    }
    // Drop selections of rows that no longer exist
    const existing = new Set(leads.map((l) => leadKey(l)));
    for (const key of [...selection]) if (!existing.has(key)) selection.delete(key);
    renderSelection();
    restoreActiveCell();
    updateFrozenColumns();
    const info = $("report-filter-info");
    if (info) info.textContent = rows.length === leads.length ? "" : `Menampilkan ${rows.length} dari ${leads.length}`;
    $("excel-corner").title = "Klik untuk memilih semua baris yang tampil";
    renderFilterBar();
    renderStatusBar();
  }

  function setFilter(name) {
    view.filter = FILTERS[name] ? name : "all";
    renderRows();
  }

  function toggleSort(col) {
    if (!SORT_KEYS[col]) return;
    if (view.sortCol === col) {
      if (view.sortDir === 1) view.sortDir = -1;
      else { view.sortCol = null; view.sortDir = 1; } // third click: back to original order
    } else {
      view.sortCol = col;
      view.sortDir = 1;
    }
    renderRows();
  }

  /**
   * Re-renders only the cells Deep Search can change.
   */
  function refreshRow(lead) {
    const row = document.querySelector(`tr[data-key="${CSS.escape(leadKey(lead))}"]`);
    if (!row) return;
    const set = (col, html) => {
      const td = row.querySelector(`td[data-col="${col}"]`);
      if (td) td.innerHTML = html;
    };
    set("D", statusCellHtml(lead));
    set("E", webCellHtml(lead));
    set("F", socialCellHtml(lead));
    set("G", emailCellHtml(lead));
    set("H", techCellHtml(lead));
  }

  /**
   * #1 Freeze panes: columns A (No) and B (Nama) stick to the left like Excel's
   * "Freeze First Columns". Offsets come from the rendered widths.
   */
  function updateFrozenColumns() {
    const table = $("main-excel-table");
    const corner = $("excel-corner");
    const colA = document.querySelector('th.excel-col-letter[data-col="A"]');
    if (!table || !corner || !colA) return;
    table.style.setProperty("--freeze-a", corner.offsetWidth + "px");
    table.style.setProperty("--freeze-b", corner.offsetWidth + colA.offsetWidth + "px");
  }

  function syncFrozenShadow() {
    const grid = document.querySelector(".excel-grid-container");
    if (grid) grid.classList.toggle("is-scrolled-x", grid.scrollLeft > 0);
  }

  function findLeadByRow(el) {
    const row = el.closest("tr[data-key]");
    if (!row) return null;
    const key = row.getAttribute("data-key");
    return leads.find((l) => leadKey(l) === key) || null;
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

  // --- Toast ---

  let toastTimer = null;
  let toastAction = null;

  /**
   * @param {string} msg
   * @param {{label: string, onClick: Function}} [action] e.g. an "Undo" button
   */
  function showToast(msg, action) {
    const t = $("excel-toast");
    t.textContent = msg;
    toastAction = action || null;
    if (action) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "excel-toast-action";
      btn.textContent = action.label;
      t.appendChild(btn);
    }
    // countdown bar: its animation decides when the toast hides; hovering pauses it
    const bar = document.createElement("span");
    bar.className = "excel-toast-timer";
    bar.style.animationDuration = (action ? 6000 : 2500) + "ms";
    bar.addEventListener("animationend", () => { t.style.display = "none"; toastAction = null; });
    t.appendChild(bar);
    t.style.display = "flex";
    clearTimeout(toastTimer);
  }

  // --- Mini-CRM ---

  async function updateLeadStatus(lead, newStatus, { quiet = false, changedAt } = {}) {
    if (!OUTREACH_STATUSES.includes(newStatus)) return false;
    lead.outreachStatus = newStatus;
    lead.statusChangedAt = changedAt !== undefined ? changedAt : Date.now();
    syncStatusSelect(lead);
    try {
      const ok = await patchLead(leadKey(lead), { outreachStatus: newStatus, statusChangedAt: lead.statusChangedAt });
      if (ok) await recordHistory([lead]);
      if (!quiet) {
        showToast(ok
          ? `Status "${lead.title}" diperbarui: ${newStatus}`
          : "Data ini sudah tidak ada di penyimpanan (mungkin sudah dihapus).");
      }
      return ok;
    } catch (e) {
      console.warn("PetaKlien: Gagal menyimpan status outreach", e);
      showToast("Gagal menyimpan status. Coba lagi.");
      return false;
    }
  }

  /** Keeps the row's dropdown (value + colour) in step with the lead. */
  function syncStatusSelect(lead) {
    const row = document.querySelector(`tr[data-key="${CSS.escape(leadKey(lead))}"]`);
    const select = row && row.querySelector(".excel-status-select");
    if (select) {
      select.value = lead.outreachStatus;
      select.dataset.status = lead.outreachStatus;
    }
  }

  /** The live object for a lead (storage sync may have replaced the array since). */
  function liveLead(lead) {
    const key = leadKey(lead);
    return leads.find((l) => leadKey(l) === key) || lead;
  }

  /**
   * #1: opening WhatsApp marks a not-yet-contacted lead as "Terkirim WA",
   * with an undo in case the message was not actually sent.
   */
  async function markContacted(lead, note = "") {
    const target = liveLead(lead);
    if (!isPending(target)) {
      if (note) showToast(note.replace(/^ · /, ""));
      return;
    }
    const previous = target.outreachStatus || NOT_CONTACTED;
    const previousAt = target.statusChangedAt || null;
    await updateLeadStatus(target, "Terkirim WA", { quiet: true });
    showToast(`${target.title} ditandai Terkirim WA${note}`, {
      label: "Batalkan",
      onClick: () => updateLeadStatus(liveLead(target), previous, { quiet: true, changedAt: previousAt })
        .then(() => {
          showToast(`Status ${target.title} dikembalikan`);
          updatePitchProgress();
        })
    });
  }

  // --- Pitch modal ---

  function updateCharCount() {
    $("pitch-char-count").textContent = ($("pitch-message-text").value || "").length + " karakter";
  }

  function insertVariable(v) {
    const area = $("pitch-message-text");
    const start = area.selectionStart || 0;
    const end = area.selectionEnd || 0;
    area.value = area.value.substring(0, start) + v + area.value.substring(end);
    area.focus();
    area.selectionStart = area.selectionEnd = start + v.length;
    updateCharCount();
  }

  async function savePref(key, value) {
    prefs[key] = value;
    try {
      await chrome.storage.local.set({ [key]: value });
      return true;
    } catch (e) {
      return false;
    }
  }

  // --- #6 saved pitch templates ---

  function selectedTemplate() {
    return templates.find((t) => t.id === prefs[PREF_TEMPLATE_ID]) || null;
  }

  function renderTemplateSelect() {
    const select = $("pitch-template-select");
    if (!select) return;
    const current = prefs[PREF_TEMPLATE_ID] || "";
    select.innerHTML = `<option value="">Template bawaan</option>` + templates.map((t) =>
      `<option value="${escapeHtml(t.id)}"${t.id === current ? " selected" : ""}>${escapeHtml(t.name)}</option>`).join("");
    $("template-update-btn").disabled = !selectedTemplate();
    $("template-delete-btn").disabled = !selectedTemplate();
  }

  async function persistTemplates() {
    await chrome.storage.local.set({ [PREF_TEMPLATES]: templates, [PREF_TEMPLATE_ID]: prefs[PREF_TEMPLATE_ID] || "" });
  }

  async function saveTemplateAsNew() {
    const text = $("pitch-message-text").value;
    const name = $("pitch-template-name").value.trim();
    if (!text.trim()) return showToast("Teks template tidak boleh kosong.");
    if (!name) {
      $("pitch-template-name").focus();
      return showToast("Beri nama template dulu.");
    }
    const id = "t" + Date.now().toString(36);
    templates.push({ id, name: name.slice(0, 40), text });
    prefs[PREF_TEMPLATE_ID] = id;
    await persistTemplates();
    $("pitch-template-name").value = "";
    renderTemplateSelect();
    showToast(`Template "${name}" disimpan`);
  }

  async function updateTemplate() {
    const t = selectedTemplate();
    if (!t) return;
    t.text = $("pitch-message-text").value;
    await persistTemplates();
    showToast(`Template "${t.name}" diperbarui`);
  }

  async function deleteTemplate() {
    const t = selectedTemplate();
    if (!t) return;
    templates = templates.filter((x) => x.id !== t.id);
    prefs[PREF_TEMPLATE_ID] = "";
    await persistTemplates();
    renderTemplateSelect();
    applyPitchTemplate();
    showToast(`Template "${t.name}" dihapus`, {
      label: "Batalkan",
      onClick: async () => {
        templates.push(t);
        prefs[PREF_TEMPLATE_ID] = t.id;
        await persistTemplates();
        renderTemplateSelect();
        applyPitchTemplate();
      }
    });
  }

  function applyPitchTemplate() {
    if (!currentPitchLead) return;
    $("pitch-message-text").value = getPitchTemplateText(
      $("pitch-intent-select").value,
      $("pitch-category-select").value,
      currentPitchLead,
      (selectedTemplate() && selectedTemplate().text) || ""
    );
    updateCharCount();
  }

  function handleIntentChange() {
    const intent = $("pitch-intent-select").value;
    savePref(PREF_PITCH_INTENT, intent);
    $("custom-template-helper").style.display = intent === "custom" ? "block" : "none";
    renderTemplateSelect();
    applyPitchTemplate();
  }

  /** WhatsApp-able leads still waiting for a first message, in table order. */
  // Keys of the rows chosen for "Kirim WA" from the bulk bar; null = all leads
  let outreachKeys = null;

  function inOutreach(l) {
    return !outreachKeys || outreachKeys.has(leadKey(l));
  }

  function pendingQueue() {
    return leads.filter((l) => isPending(l) && hasWhatsApp(l) && inOutreach(l));
  }

  /** Next pending lead after `lead` in table order (wraps around), or null. */
  function nextPendingLead(lead) {
    const key = leadKey(lead);
    const start = leads.findIndex((l) => leadKey(l) === key);
    for (let step = 1; step <= leads.length; step++) {
      const candidate = leads[(start + step) % leads.length];
      if (candidate && leadKey(candidate) !== key && isPending(candidate) && hasWhatsApp(candidate) && inOutreach(candidate)) return candidate;
    }
    return null;
  }

  function updatePitchProgress() {
    const sub = $("pitch-modal-sub");
    if (!sub || !currentPitchLead) return;
    const remaining = pendingQueue().length;
    const scope = outreachKeys ? " dari pilihan" : "";
    sub.textContent = remaining > 0
      ? `${remaining} prospek ber-WhatsApp${scope} belum dihubungi`
      : `Semua prospek ber-WhatsApp${scope} sudah dihubungi`;
    const nextBtn = $("btn-send-next");
    if (nextBtn) nextBtn.disabled = !nextPendingLead(currentPitchLead) && !isPending(liveLead(currentPitchLead));
  }

  function openPitchModal(lead) {
    currentPitchLead = lead;
    $("pitch-modal-title").textContent = lead.title || "Pesan outreach";
    updatePitchProgress();
    $("pitch-intent-select").value = prefs[PREF_PITCH_INTENT] || "business";
    $("pitch-category-select").value = "auto";
    $("custom-template-helper").style.display = $("pitch-intent-select").value === "custom" ? "block" : "none";
    applyPitchTemplate();
    $("pitch-modal").style.display = "flex";
  }

  function closePitchModal() {
    $("pitch-modal").style.display = "none";
    outreachKeys = null;
  }

  /** #2 Bulk "Kirim WA": walk through the selected rows with "Kirim & lanjut". */
  function bulkWhatsApp() {
    const chosen = leads.filter((l) => selection.has(leadKey(l)) && hasWhatsApp(l));
    const pending = chosen.filter(isPending);
    if (!chosen.length) {
      showToast("Tidak ada nomor WhatsApp di prospek yang dipilih");
      return;
    }
    outreachKeys = new Set(chosen.map(leadKey));
    openPitchModal(pending[0] || chosen[0]);
  }

  /** Opens wa.me synchronously (inside the click, so it is not popup-blocked). */
  function openWhatsApp(lead) {
    let waNumber = (lead.phone || "").replace(/[^0-9]/g, "");
    if (waNumber.startsWith("0")) waNumber = "62" + waNumber.slice(1);
    if (!waNumber) {
      showToast("Nomor WhatsApp tidak valid untuk bisnis ini.");
      return false;
    }
    window.open("https://wa.me/" + waNumber + "?text=" + encodeURIComponent($("pitch-message-text").value), "_blank", "noopener");
    return true;
  }

  function sendPitchWhatsApp() {
    if (!currentPitchLead) return false;
    if (!openWhatsApp(currentPitchLead)) return false;
    markContacted(currentPitchLead).then(updatePitchProgress);
    return true;
  }

  /**
   * #2: send to this lead, then load the next not-yet-contacted lead into the
   * same dialog, so an outreach session needs no scrolling or reopening.
   */
  async function sendAndNext() {
    if (!currentPitchLead) return;
    const current = currentPitchLead;
    const next = nextPendingLead(current);
    const shouldSend = isPending(liveLead(current));
    if (shouldSend && !openWhatsApp(current)) return;
    if (next) {
      openPitchModal(next);
      const row = document.querySelector(`tr[data-key="${CSS.escape(leadKey(next))}"]`);
      if (row) row.scrollIntoView({ block: "center", behavior: "smooth" });
      if (shouldSend) markContacted(current).then(updatePitchProgress);
    } else {
      closePitchModal();
      // One toast for both facts, so the completion message is not overwritten
      const done = " · Semua prospek ber-WhatsApp sudah dihubungi";
      if (shouldSend) markContacted(current, done);
      else showToast(done.replace(/^ · /, ""));
    }
  }

  // --- Batch Deep Search (shared engine via background service worker) ---

  async function runBatchDeepSearch() {
    if (isBatchRunning) return;
    const targets = leads.filter((l) =>
      statusKind(l.websiteStatus) !== "web" || !l.email || l.email === "-" || !l.techStack || l.techStack === "-");
    if (targets.length === 0) {
      showToast("Semua baris sudah terverifikasi memiliki website resmi & kontak lengkap!");
      return;
    }

    isBatchRunning = true;
    const btn = $("btn-batch-deepsearch");
    btn.disabled = true;
    btn.classList.add("is-loading");
    btn.setAttribute("aria-busy", "true");
    const idleLabel = btn.textContent;
    let found = 0;
    let stopped = null;
    const guard = createDeepSearchGuard();

    try {
      for (let i = 0; i < targets.length; i++) {
        const lead = targets[i];
        btn.textContent = `Melacak ${i + 1}/${targets.length}`;
        showToast(`Deep Search (${i + 1}/${targets.length}): ${lead.title || "Prospek"}`);
        const existingLink = (lead.websiteUrl && lead.websiteUrl !== "-") ? lead.websiteUrl : (lead.socialUrl || "");
        const deepRes = await performAutoDeepSearch(lead.title, lead.address, lead.websiteStatus, existingLink);
        if (applyDeepSearchResult(lead, deepRes, statusKind)) found++;
        refreshRow(lead);
        await patchLead(leadKey(lead), {
          websiteStatus: lead.websiteStatus,
          websiteUrl: lead.websiteUrl,
          socialUrl: lead.socialUrl,
          email: lead.email,
          techStack: lead.techStack,
          deepSearchFailed: Boolean(lead.deepSearchFailed)
        });
        stopped = guard.record(deepRes);
        if (stopped) break;
        await new Promise((r) => setTimeout(r, 700 + Math.random() * 600));
      }
      renderStatusBar();
      if (stopped) {
        showToast(stopped === "blocked"
          ? "Deep Search dihentikan: Google meminta CAPTCHA. Coba lagi beberapa menit lagi."
          : "Deep Search dihentikan: pencarian Google gagal berulang kali. Coba lagi nanti.");
      } else {
        showToast(`Deep Search selesai! ${found} dari ${targets.length} data menemukan website resmi.`);
      }
    } finally {
      isBatchRunning = false;
      btn.disabled = false;
      btn.classList.remove("is-loading");
      btn.removeAttribute("aria-busy");
      btn.textContent = idleLabel;
      // Pick up rows scraped in the Maps tab while the batch was running
      leads = await loadLeads();
      renderRows();
    }
  }

  // --- #1 exports follow the filter / selection ---

  /** Small choice dialog (Kumo Dialog). Resolves with the chosen option value, or null. */
  function choose(title, text, options) {
    return new Promise((resolve) => {
      $("choice-title").textContent = title;
      $("choice-text").textContent = text;
      const actions = $("choice-actions");
      actions.innerHTML = "";
      const done = (value) => {
        $("choice-modal").style.display = "none";
        resolve(value);
      };
      options.forEach((opt, i) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "excel-btn" + (i === options.length - 1 ? " excel-btn-primary" : "");
        btn.textContent = opt.label;
        btn.addEventListener("click", () => done(opt.value));
        actions.appendChild(btn);
      });
      $("choice-close").onclick = () => done(null);
      $("choice-modal").style.display = "flex";
      actions.lastChild.focus();
    });
  }

  /** Which rows an export/copy should use: asks only when a filter or selection is active. */
  async function exportScope(actionLabel) {
    if (!leads.length) {
      showToast("Belum ada data untuk diekspor.");
      return null;
    }
    const shown = visibleRows().map(([l]) => l);
    const picked = leads.filter((l) => selection.has(leadKey(l)));
    const options = [{ label: `Semua (${leads.length})`, value: "all" }];
    if (shown.length !== leads.length) options.push({ label: `Yang tampil (${shown.length})`, value: "shown" });
    if (picked.length) options.push({ label: `Yang dipilih (${picked.length})`, value: "picked" });
    if (options.length === 1) return { list: leads, suffix: "" };
    const choice = await choose(actionLabel, "Data mana yang mau dipakai?", options);
    if (choice === "shown") return { list: shown, suffix: "filter" };
    if (choice === "picked") return { list: picked, suffix: "pilihan" };
    if (choice === "all") return { list: leads, suffix: "" };
    return null;
  }

  async function exportXLSX() {
    const scope = await exportScope("Unduh Excel");
    if (scope) Exporter.downloadXLSX(XLSX, scope.list, Exporter.exportFilename("PetaKlien_Prospek", "xlsx", scope.suffix));
  }

  async function exportCSV() {
    const scope = await exportScope("Unduh CSV");
    if (scope) Exporter.downloadCSV(scope.list, Exporter.exportFilename("PetaKlien_Prospek", "csv", scope.suffix));
  }

  async function copyTable() {
    const scope = await exportScope("Salin tabel");
    if (!scope) return;
    navigator.clipboard.writeText(Exporter.toTSV(scope.list)).then(() => {
      showToast(`${scope.list.length} baris disalin. Tekan Ctrl+V di Excel atau Google Sheets.`);
    });
  }

  // --- #3 notes ---

  async function saveNote(lead, value) {
    const note = value.trim().slice(0, 500);
    if ((lead.note || "") === note) return;
    lead.note = note;
    const ok = await patchLead(leadKey(lead), { note });
    showToast(ok ? (note ? "Catatan disimpan" : "Catatan dihapus") : "Gagal menyimpan catatan.");
  }

  // --- #5 selection & bulk actions ---

  function visibleKeys() {
    return visibleRows().map(([l]) => leadKey(l));
  }

  function toggleRowSelection(key, extendRange) {
    const keys = visibleKeys();
    if (extendRange && selectionAnchor && keys.includes(selectionAnchor)) {
      const [a, b] = [keys.indexOf(selectionAnchor), keys.indexOf(key)].sort((x, y) => x - y);
      keys.slice(a, b + 1).forEach((k) => selection.add(k));
    } else if (selection.has(key)) {
      selection.delete(key);
    } else {
      selection.add(key);
    }
    selectionAnchor = key;
    renderSelection();
  }

  function toggleSelectAllVisible() {
    const keys = visibleKeys();
    const allSelected = keys.length && keys.every((k) => selection.has(k));
    keys.forEach((k) => (allSelected ? selection.delete(k) : selection.add(k)));
    renderSelection();
  }

  function clearSelection() {
    selection.clear();
    renderSelection();
  }

  function renderSelection() {
    document.querySelectorAll("#excel-data-rows tr[data-key]").forEach((tr) => {
      const on = selection.has(tr.getAttribute("data-key"));
      tr.classList.toggle("is-selected", on);
      if (on) tr.setAttribute("aria-selected", "true"); else tr.removeAttribute("aria-selected");
    });
    const bar = $("bulk-bar");
    if (!bar) return;
    bar.hidden = selection.size === 0;
    $("bulk-count").textContent = `${selection.size} dipilih`;
    $("report-filter-info").hidden = selection.size > 0;
  }

  async function bulkSetStatus(status) {
    if (!selection.size || !OUTREACH_STATUSES.includes(status)) return;
    const list = await loadLeads();
    const now = Date.now();
    const changed = [];
    for (const lead of list) {
      if (!selection.has(leadKey(lead)) || lead.outreachStatus === status) continue;
      lead.outreachStatus = status;
      lead.statusChangedAt = now;
      lead.updatedAt = now;
      changed.push(lead);
    }
    await chrome.storage.local.set({ [STORAGE_KEY]: list });
    await recordHistory(changed);
    leads = list;
    renderRows();
    showToast(`${changed.length} prospek diubah ke "${status}"`);
  }

  async function bulkDelete() {
    if (!selection.size) return;
    const list = await loadLeads();
    const removed = list.filter((l) => selection.has(leadKey(l)));
    const kept = list.filter((l) => !selection.has(leadKey(l)));
    // remember where each row was, so undo puts it back in place
    const positions = new Map(list.map((l, i) => [leadKey(l), i]));
    const keys = removed.map((l) => leadKey(l));
    await chrome.storage.local.set({
      [STORAGE_KEY]: kept,
      [STORAGE_KEYS.backup]: { leads: removed, at: Date.now() },
      [STORAGE_KEYS.deleted]: { keys, at: Date.now() } // tells the Maps tab to drop them too
    });
    selection.clear();
    leads = kept;
    renderRows();
    showToast(`${removed.length} prospek dihapus`, { label: "Batalkan", onClick: () => restoreRows(removed, positions) });
  }

  async function restoreRows(rows, positions = new Map()) {
    const list = await loadLeads();
    const known = new Set(list.map((l) => leadKey(l)));
    const now = Date.now();
    const back = rows.filter((l) => !known.has(leadKey(l))).map((l) => Object.assign({}, l, { updatedAt: now }));
    // re-insert at the original positions (ascending, so earlier inserts don't shift later targets)
    const merged = list.slice();
    back
      .map((l) => [l, positions.has(leadKey(l)) ? positions.get(leadKey(l)) : Infinity])
      .sort((a, b) => a[1] - b[1])
      .forEach(([l, idx]) => merged.splice(Math.min(idx, merged.length), 0, l));
    await chrome.storage.local.set({ [STORAGE_KEY]: merged });
    await chrome.storage.local.remove(STORAGE_KEYS.backup);
    leads = merged;
    renderRows();
    showToast(`${back.length} prospek dikembalikan`);
  }

  async function bulkExport() {
    const picked = leads.filter((l) => selection.has(leadKey(l)));
    if (picked.length) Exporter.downloadXLSX(XLSX, picked, Exporter.exportFilename("PetaKlien_Prospek", "xlsx", "pilihan"));
  }

  // --- #7 keyboard: active cell & navigation ---

  const COLS = "ABCDEFGHIJKLMNOPQR".split("");

  function activateCell(cell) {
    document.querySelectorAll("td.active-cell, th.is-active").forEach((c) => c.classList.remove("active-cell", "is-active"));
    cell.classList.add("active-cell");
    const colHeader = document.querySelector(`th.excel-col-letter[data-col="${cell.getAttribute("data-col")}"]`);
    const rowHeader = cell.parentElement.querySelector("th.excel-row-num");
    if (colHeader) colHeader.classList.add("is-active");
    if (rowHeader) rowHeader.classList.add("is-active");
    $("excel-active-coord").textContent = cell.getAttribute("data-coord") || "A1";
    $("excel-formula-val").value = (cell.innerText || cell.textContent || "").trim();
    const row = cell.closest("tr[data-key]");
    active = row ? { key: row.getAttribute("data-key"), col: cell.getAttribute("data-col") } : null;
  }

  function restoreActiveCell() {
    if (!active) return;
    const row = document.querySelector(`#excel-data-rows tr[data-key="${CSS.escape(active.key)}"]`);
    const cell = row && row.querySelector(`td[data-col="${active.col}"]`);
    if (cell) activateCell(cell);
  }

  function moveActive(dRow, dCol) {
    const rows = [...document.querySelectorAll("#excel-data-rows tr[data-key]")];
    if (!rows.length) return;
    let r = active ? rows.findIndex((tr) => tr.getAttribute("data-key") === active.key) : -1;
    let c = active ? COLS.indexOf(active.col) : 1;
    if (r < 0) { r = 0; c = 1; dRow = 0; dCol = 0; }
    r = Math.max(0, Math.min(rows.length - 1, r + dRow));
    c = Math.max(0, Math.min(COLS.length - 1, c + dCol));
    const cell = rows[r].querySelector(`td[data-col="${COLS[c]}"]`);
    if (cell) {
      activateCell(cell);
      cell.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }

  function isTyping(target) {
    return target && (target.matches("input, textarea, select") || target.isContentEditable);
  }

  function handleShortcut(e) {
    const modalOpen = $("pitch-modal").style.display === "flex" || $("choice-modal").style.display === "flex";
    if (e.key === "Escape") {
      if ($("choice-modal").style.display === "flex") $("choice-close").click();
      else if ($("pitch-modal").style.display === "flex") closePitchModal();
      else if (selection.size) clearSelection();
      else if (isTyping(e.target)) e.target.blur();
      return;
    }
    if (modalOpen || isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    const moves = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (moves[e.key]) {
      e.preventDefault();
      moveActive(...moves[e.key]);
    } else if (e.key === "/") {
      e.preventDefault();
      $("report-search").focus();
    } else if (e.key === "Enter" && active) {
      const lead = leads.find((l) => leadKey(l) === active.key);
      if (lead && hasWhatsApp(lead)) {
        e.preventDefault();
        openPitchModal(lead);
      }
    } else if (e.key === " " && active) {
      e.preventDefault();
      toggleRowSelection(active.key, e.shiftKey);
    } else if (e.key === "n" && active) {
      e.preventDefault();
      const input = document.querySelector(`#excel-data-rows tr[data-key="${CSS.escape(active.key)}"] .excel-note-input`);
      if (input) input.focus();
    }
  }

  // --- Events (delegated; extension CSP forbids inline handlers) ---

  const ACTIONS = {
    "batch-deepsearch": runBatchDeepSearch,
    "export-xlsx": exportXLSX,
    "export-csv": exportCSV,
    "print": () => window.print(),
    "copy-table": copyTable,
    "close-tab": () => window.close(),
    "close-pitch": closePitchModal,
    "insert-var": (el) => insertVariable(el.getAttribute("data-var")),
    "template-save-new": saveTemplateAsNew,
    "template-update": updateTemplate,
    "template-delete": deleteTemplate,
    "bulk-export": bulkExport,
    "bulk-delete": bulkDelete,
    "bulk-clear": clearSelection,
    "open-google-search": () => currentPitchLead && window.open(Exporter.googleSearchUrl(currentPitchLead), "_blank", "noopener"),
    "copy-pitch": () => navigator.clipboard.writeText($("pitch-message-text").value)
      .then(() => showToast("Teks pesan penawaran berhasil disalin ke clipboard!")),
    "send-wa": sendPitchWhatsApp,
    "send-next": sendAndNext,
    "set-filter": (el) => setFilter(el.getAttribute("data-filter")),
    "reset-view": () => {
      view.filter = "all";
      view.query = "";
      $("report-search").value = "";
      renderRows();
    },
    "open-pitch": (el) => {
      const lead = findLeadByRow(el);
      outreachKeys = null;
      if (lead) openPitchModal(lead);
    },
    "bulk-wa": bulkWhatsApp
  };

  function bindEvents() {
    $("excel-toast").addEventListener("click", (e) => {
      if (e.target.closest(".excel-toast-action") && toastAction) {
        const action = toastAction;
        toastAction = null;
        $("excel-toast").style.display = "none";
        action.onClick();
      }
    });

    document.addEventListener("click", (e) => {
      const el = e.target.closest("[data-action]");
      if (el && ACTIONS[el.getAttribute("data-action")]) {
        ACTIONS[el.getAttribute("data-action")](el);
        return;
      }

      // Excel-style sort: click a column name in row 1
      const headerCell = e.target.closest("tr.excel-header-row td[data-col]");
      if (headerCell) toggleSort(headerCell.getAttribute("data-col"));

      // Excel-style row selection: row number (Shift = range), corner = all visible
      const rowNum = e.target.closest("#excel-data-rows th.excel-row-num");
      if (rowNum) {
        toggleRowSelection(rowNum.parentElement.getAttribute("data-key"), e.shiftKey);
        return;
      }
      if (e.target.closest("th.excel-corner")) {
        toggleSelectAllVisible();
        return;
      }

      // Cell highlight & formula bar
      const cell = e.target.closest("td.excel-cell");
      if (cell) activateCell(cell);
    });

    document.addEventListener("keydown", handleShortcut);

    // #3 notes: Enter saves (via change), Escape cancels
    document.addEventListener("keydown", (e) => {
      if (!e.target.matches || !e.target.matches(".excel-note-input")) return;
      if (e.key === "Enter") e.target.blur();
    });

    document.addEventListener("change", (e) => {
      if (e.target.id === "bulk-status") {
        // checked first: it shares the .excel-status-select styling with the row dropdowns
        bulkSetStatus(e.target.value);
        e.target.value = "";
      } else if (e.target.matches(".excel-status-select")) {
        e.target.dataset.status = e.target.value; // drives the status colour
        const lead = findLeadByRow(e.target);
        if (lead) updateLeadStatus(lead, e.target.value);
      } else if (e.target.id === "pitch-intent-select") {
        handleIntentChange();
      } else if (e.target.id === "pitch-category-select") {
        applyPitchTemplate();
      } else if (e.target.matches(".excel-note-input")) {
        const lead = findLeadByRow(e.target);
        if (lead) saveNote(lead, e.target.value);
      } else if (e.target.id === "pitch-template-select") {
        prefs[PREF_TEMPLATE_ID] = e.target.value;
        persistTemplates();
        renderTemplateSelect();
        applyPitchTemplate();
      }
    });

    $("pitch-message-text").addEventListener("input", updateCharCount);

    let searchTimer = null;
    $("report-search").addEventListener("input", (e) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        view.query = e.target.value;
        renderRows();
      }, 120);
    });

    // Live sync: rows scraped / edited in the Maps tab appear here without reloading
    let rerenderTimer = null;
    let pendingLeads = null;
    const editingNote = () => document.activeElement && document.activeElement.matches(".excel-note-input");
    const applyPending = () => {
      if (!pendingLeads) return;
      leads = pendingLeads;
      pendingLeads = null;
      renderRows();
    };
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !changes[STORAGE_KEY] || isBatchRunning) return;
      clearTimeout(rerenderTimer);
      rerenderTimer = setTimeout(() => {
        pendingLeads = Array.isArray(changes[STORAGE_KEY].newValue) ? changes[STORAGE_KEY].newValue : [];
        if (!editingNote()) applyPending(); // otherwise wait until the note loses focus
      }, 250);
    });
    document.addEventListener("focusout", (e) => {
      if (e.target.matches && e.target.matches(".excel-note-input")) setTimeout(applyPending, 0);
    });
  }

  async function init() {
    setupTheme();
    const grid = document.querySelector(".excel-grid-container");
    if (grid) grid.addEventListener("scroll", syncFrozenShadow, { passive: true });
    window.addEventListener("resize", updateFrozenColumns);
    if (window.PetaKlienTooltip) window.PetaKlienTooltip.installTooltips({ host: document.body });
    bindEvents();
    const stored = await chrome.storage.local.get([STORAGE_KEY, PREF_CUSTOM_TEMPLATE, PREF_PITCH_INTENT, PREF_TEMPLATES, PREF_TEMPLATE_ID]);
    leads = Array.isArray(stored[STORAGE_KEY]) ? stored[STORAGE_KEY] : [];
    if (stored[PREF_PITCH_INTENT]) prefs[PREF_PITCH_INTENT] = stored[PREF_PITCH_INTENT];
    templates = Array.isArray(stored[PREF_TEMPLATES]) ? stored[PREF_TEMPLATES] : [];
    prefs[PREF_TEMPLATE_ID] = stored[PREF_TEMPLATE_ID] || "";
    if (!templates.length && stored[PREF_CUSTOM_TEMPLATE]) {
      // One-time migration from the single custom template of earlier versions
      templates = [{ id: "t-legacy", name: "Template saya", text: stored[PREF_CUSTOM_TEMPLATE] }];
      prefs[PREF_TEMPLATE_ID] = "t-legacy";
      await persistTemplates();
      await chrome.storage.local.remove(PREF_CUSTOM_TEMPLATE);
    }
    renderRows();
  }

  init();
})();
