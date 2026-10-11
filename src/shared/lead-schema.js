/**
 * PetaKlien - Shared Lead Schema & Domain Definitions
 * Single Source of Truth for Statuses, Classifications, and the 18-Column Manifest
 */

(function (root) {
  "use strict";

  const SCHEMA_VERSION = "1.2.0";

  // Unified Status Mapping
  const STATUS_KIND = {
    "Tidak Ada Website":                   "none",
    "Tidak Ada Website (Verifikasi Deep)": "none",
    "Tidak Ada Website (Web Gratisan)":    "none",
    "Hanya Medsos":                        "social",
    "Hanya Medsos (Verifikasi Deep)":      "social",
    "Hanya Medsos (Hasil Deep Search)":    "social",
    "Web Resmi (Deep) + Medsos":           "social",
    "Ada Web (Hasil Deep Search)":         "web",
    "Web Resmi (Deep)":                    "web",
    "Ada Website":                         "web"
  };

  /**
   * Determine broad category: 'none', 'social', or 'web'
   */
  function statusKind(status) {
    if (STATUS_KIND[status]) return STATUS_KIND[status];
    if (!status || status.startsWith("Tidak Ada") || status.startsWith("Tanpa Web")) return "none";
    if (status.includes("Medsos")) return "social";
    return "web";
  }

  /**
   * Aggregate leads counter
   */
  function countLeads(leadList) {
    const counts = { none: 0, social: 0, web: 0 };
    for (const l of (leadList || [])) {
      counts[statusKind(l.websiteStatus)]++;
    }
    return counts;
  }

  // 18-Column Manifest Universal Headers (A to R)
  const COLUMNS = [
    "No",
    "Nama Tempat / Bisnis",
    "Kategori Usaha",
    "Status Website",
    "Link Website Resmi",
    "Link Media Sosial",
    "Email Kontak / Bisnis",
    "Teknologi Website (CMS / Platform)",
    "Nomor Telepon",
    "Tipe Kontak",
    "Link WhatsApp",
    "Alamat Lengkap",
    "Rating",
    "Jumlah Ulasan",
    "Status Outreach",
    "Link Google Maps",
    "Waktu Scrape",
    "Catatan"
  ];

  // Valid Mini-CRM outreach statuses (whitelist for cross-tab sync)
  const OUTREACH_STATUSES = [
    "Belum Dihubungi",
    "Terkirim WA",
    "Tertarik / Follow-Up",
    "Deal (Klien)",
    "Ditolak"
  ];

  /**
   * CSV / TSV Formula Injection guard (OWASP).
   * Scraped business names are user-controlled; a value like =HYPERLINK(...)
   * would be executed by Excel / Sheets. Prefix dangerous leading chars with '.
   */
  function neutralizeFormula(val) {
    if (val === null || val === undefined) return "";
    if (typeof val === "number") return val;
    const str = String(val);
    if (str === "-") return str; // placeholder kosong, aman
    return /^[=+\-@\t\r]/.test(str) ? "'" + str : str;
  }

  /**
   * Returns the URL only if it uses http(s); otherwise "-".
   * Blocks javascript:, data:, file:, vbscript: etc. in hrefs & Excel hyperlinks.
   */
  function safeHttpUrl(url) {
    if (!url || typeof url !== "string") return "-";
    const trimmed = url.trim();
    return /^https?:\/\//i.test(trimmed) ? trimmed : "-";
  }

  /**
   * Stable Google Maps place identifier from a Maps URL.
   * Order matters (most consistently present first) so that the same place
   * resolves to the same id regardless of which URL variant was captured:
   *   1. Feature id  "!1s0x2e69f3...:0x5a7c..."  (selalu ada di link kartu & URL detail)
   *   2. Place id    "!19sChIJ..."
   *   3. CID         "?cid=123..." / "ludocid=123..."
   */
  function extractPlaceId(url) {
    if (!url || typeof url !== "string") return "";
    let decoded = url;
    try { decoded = decodeURIComponent(url); } catch (e) {}
    const fid = decoded.match(/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i);
    if (fid) return "fid:" + fid[1].toLowerCase();
    const pid = decoded.match(/!19s(ChIJ[\w-]+)/);
    if (pid) return "pid:" + pid[1];
    const cid = decoded.match(/[?&](?:ludocid|cid)=(\d+)/);
    if (cid) return "cid:" + cid[1];
    return "";
  }

  /**
   * Unique key of a lead: place id when available, otherwise name|address.
   * Two branches with the same name and a truncated address no longer collide.
   */
  function leadKey(lead) {
    if (!lead) return "";
    const pid = lead.placeId || extractPlaceId(lead.mapsUrl);
    if (pid) return pid;
    return "na:" + (lead.title || "").trim().toLowerCase() + "|" + (lead.address || "").trim().toLowerCase();
  }

  function escapeHtml(str) {
    if (str === null || str === undefined || str === "") return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // chrome.storage keys shared by the Maps tab, popup and report page
  const STORAGE_KEYS = {
    leads: "mapsLeadsData",
    backup: "mapsLeadsBackup",           // last cleared/deleted leads, for undo
    history: "petaklien_contact_history", // outreach status per place, survives clearing
    deleted: "petaklien_deleted_keys",    // { keys, at }: rows deleted in the report, so the Maps tab drops them too
    theme: "petaklien_theme"              // "light" (default) | "dark", shared by sidebar, popup & report
  };

  // Cleared data stays restorable for a week, then the offer disappears
  const BACKUP_TTL_MS = 7 * 24 * 60 * 60 * 1000;

  /** The backup when it still has leads and is younger than BACKUP_TTL_MS, otherwise null. */
  function usableBackup(backup, now = Date.now()) {
    if (!backup || !Array.isArray(backup.leads) || !backup.leads.length) return null;
    if (backup.at && now - backup.at > BACKUP_TTL_MS) return null;
    return backup;
  }

  /**
   * Contact history entry for a lead whose outreach has started, or null when
   * it is (back to) "Belum Dihubungi". Kept small: status, time, title.
   */
  function historyEntryFor(lead) {
    if (!lead || !lead.outreachStatus || lead.outreachStatus === "Belum Dihubungi") return null;
    return { s: lead.outreachStatus, t: lead.statusChangedAt || Date.now(), n: lead.title || "" };
  }

  /**
   * Restores the outreach status a place had before (even after the data was
   * cleared and the place was scraped again). Returns true when applied.
   */
  function applyContactHistory(lead, history) {
    const entry = history && history[leadKey(lead)];
    if (!entry || !entry.s) return false;
    lead.outreachStatus = entry.s;
    lead.statusChangedAt = entry.t || null;
    lead.previouslyContacted = true;
    return true;
  }

  const leadSchema = {
    SCHEMA_VERSION,
    STATUS_KIND,
    statusKind,
    countLeads,
    COLUMNS,
    OUTREACH_STATUSES,
    neutralizeFormula,
    safeHttpUrl,
    extractPlaceId,
    leadKey,
    escapeHtml,
    STORAGE_KEYS,
    historyEntryFor,
    applyContactHistory,
    BACKUP_TTL_MS,
    usableBackup
  };

  // UMD Export
  if (typeof module !== "undefined" && module.exports) {
    module.exports = leadSchema;
  }
  if (typeof root !== "undefined") {
    root.PetaKlienSchema = Object.assign(root.PetaKlienSchema || {}, leadSchema);
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
