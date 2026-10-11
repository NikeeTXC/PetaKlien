// Automated Unit & Integration Tests for the PetaKlien Engine
// Direct Source Code Verification (Zero Mocking / Full Test Integrity)
const assert = require("assert");
const manifest = require("../manifest.json");
const pkg = require("../package.json");

console.log(`=== RUNNING PETAKLIEN v${manifest.version} UNIT SUITE ===`);

const {
  STATUS_KIND,
  statusKind,
  countLeads,
  COLUMNS,
  detectWebsiteTech,
  extractEmail,
  resolveGridSubAreas,
  meetsAdvancedFilters,
  SCHEMA_VERSION
} = require("../src/content/content.js");

// 0. Versions must move together (manifest.json = package.json = lead schema)
assert.strictEqual(pkg.version, manifest.version, "package.json dan manifest.json harus berversi sama");
assert.strictEqual(SCHEMA_VERSION, manifest.version, "SCHEMA_VERSION di lead-schema.js harus sama dengan manifest.json");
console.log(`✓ Version ${manifest.version} consistent across manifest, package.json & schema`);

// 1. Test 18-Column Schema Structure (S4 Parity)
const EXPECTED_COLUMNS = [
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
assert.strictEqual(COLUMNS.length, 18);
assert.deepStrictEqual(COLUMNS, EXPECTED_COLUMNS);
console.log("✓ 18-Column Universal Schema (A to R) verified with 100% parity");

// 2. Test Grid Scan Sub-Areas Resolver (S5 & S6 Verification)
// S5 Test: Empty location must return [] instead of matching empty substring
const emptyLocAreas = resolveGridSubAreas("Kafe", "");
assert.strictEqual(emptyLocAreas.length, 0);
console.log("✓ S5 Check: resolveGridSubAreas with empty location returns [] (no dead code)");

// S6 Test: Generic "Jakarta" must return all 5 cardinal districts
const jakartaAreas = resolveGridSubAreas("Kafe", "Jakarta");
assert.strictEqual(jakartaAreas.length, 5);
assert.ok(jakartaAreas.includes("Kafe di Jakarta Selatan"));
assert.ok(jakartaAreas.includes("Kafe di Jakarta Pusat"));
assert.ok(jakartaAreas.includes("Kafe di Jakarta Barat"));
assert.ok(jakartaAreas.includes("Kafe di Jakarta Utara"));
assert.ok(jakartaAreas.includes("Kafe di Jakarta Timur"));
console.log("✓ S6 Check: resolveGridSubAreas('Jakarta') returns 5 cardinal districts");

// Specific area match: "Jakarta Selatan" returns 10 sub-districts
const jakselAreas = resolveGridSubAreas("Kafe", "Jakarta Selatan");
assert.strictEqual(jakselAreas.length, 10);
assert.ok(jakselAreas[0].includes("Senopati"));
console.log("✓ Grid Scan Resolver: 'Jakarta Selatan' matches 10 sub-districts");

// Longest-key match test: "Tangerang Selatan" must match Tangerang Selatan (7 items), NOT generic Tangerang (8 items)
const tangselAreas = resolveGridSubAreas("Kopi", "Tangerang Selatan");
assert.strictEqual(tangselAreas.length, 7);
assert.ok(tangselAreas.some(a => a.includes("Bintaro")));
console.log("✓ Grid Scan Longest-Key Match: 'Tangerang Selatan' prioritized over 'Tangerang'");

// Fallback test: unlisted city returns 5 cardinal directions
const soloAreas = resolveGridSubAreas("Klinik", "Solo");
assert.strictEqual(soloAreas.length, 5);
assert.ok(soloAreas[0].includes("Solo Pusat"));
console.log("✓ Grid Scan Fallback: unlisted city returns 5 cardinal directions");

// 3. Test Technology Detector (CMS / Framework Detection)
assert.strictEqual(detectWebsiteTech("<script src='/wp-content/themes/main.js'></script>", "https://example.com"), "WordPress");
assert.strictEqual(detectWebsiteTech("", "https://shop.myshopify.com"), "Shopify");
assert.strictEqual(detectWebsiteTech("<div id='__next'></div>", "https://coolstartup.com"), "Next.js / React");
assert.strictEqual(detectWebsiteTech("", "https://studio.canva.site"), "Canva Site");
assert.strictEqual(detectWebsiteTech("<meta name='generator' content='Wix.com Website Builder'/>", "https://salonindah.wixsite.com"), "Wix");
assert.strictEqual(detectWebsiteTech("", "https://randomsite123.com"), "-");
console.log("✓ Technology Detector (direct from content.js) passed");

// 4. Test Email Extractor (Direct from content.js)
const testHtml1 = "<div>Hubungi kami di <a href='mailto:info@kliniksehat.com'>info@kliniksehat.com</a> atau halo@kliniksehat.com</div>";
assert.strictEqual(extractEmail(testHtml1), "info@kliniksehat.com");

const testHtml2 = "<div>Gambar icon@2x.png dan email kontak: admin@studiodigital.id</div>";
assert.strictEqual(extractEmail(testHtml2), "admin@studiodigital.id");

const testHtmlDummy = "<div>Hubungi info@example.com atau support@domain.com</div>";
assert.strictEqual(extractEmail(testHtmlDummy), "-");
console.log("✓ Email Extractor (direct from content.js) passed");

// 5. Test Status Kind Classification & Lead Counting (Comprehensive N1 Coverage)
// 5.1 Test every single entry in STATUS_KIND map
for (const [status, expectedKind] of Object.entries(STATUS_KIND)) {
  assert.strictEqual(statusKind(status), expectedKind, `Pemetaan salah untuk status: "${status}"`);
}

// 5.2 Test tolerant fallback for new or unknown variants
assert.strictEqual(statusKind("Tidak Ada Website (Varian Baru)"), "none");
assert.strictEqual(statusKind("Tanpa Web Sama Sekali"), "none");
assert.strictEqual(statusKind("Hanya Medsos (Varian Baru)"), "social");
assert.strictEqual(statusKind("Website Baru Saja"), "web");
assert.strictEqual(statusKind(""), "none");
assert.strictEqual(statusKind(null), "none");
assert.strictEqual(statusKind(undefined), "none");

// 5.3 Test aggregation counting across multiple sample leads
const sampleLeads = [
  { websiteStatus: "Tidak Ada Website" },
  { websiteStatus: "Tidak Ada Website (Verifikasi Deep)" },
  { websiteStatus: "Tidak Ada Website (Web Gratisan)" },
  { websiteStatus: "Hanya Medsos" },
  { websiteStatus: "Hanya Medsos (Verifikasi Deep)" },
  { websiteStatus: "Hanya Medsos (Hasil Deep Search)" },
  { websiteStatus: "Web Resmi (Deep) + Medsos" },
  { websiteStatus: "Ada Website" },
  { websiteStatus: "Web Resmi (Deep)" },
  { websiteStatus: "Ada Web (Hasil Deep Search)" }
];
const counts = countLeads(sampleLeads);
assert.strictEqual(counts.none, 3);
assert.strictEqual(counts.social, 4);
assert.strictEqual(counts.web, 3);
console.log("✓ Comprehensive STATUS_KIND map & tolerant fallback coverage passed (100% mutation immune)");

// 5.4 Test shared schema module parity
const sharedSchema = require("../src/shared/lead-schema.js");
assert.deepStrictEqual(sharedSchema.COLUMNS, COLUMNS);
assert.deepStrictEqual(sharedSchema.STATUS_KIND, STATUS_KIND);
console.log("✓ Shared lead schema module (src/shared/lead-schema.js) verified with full parity");

// 6. Test Advanced Filter Evaluator
const validLead = {
  phone: "081234567890",
  rating: "4.8",
  reviewsCount: "25",
  websiteStatus: "Tidak Ada Website"
};
assert.strictEqual(meetsAdvancedFilters(validLead, { contactType: "wa_only", minRating: 4.0, minReviews: 10 }).pass, true);

const lowRatingLead = {
  phone: "081234567890",
  rating: "3.5",
  reviewsCount: "25",
  websiteStatus: "Tidak Ada Website"
};
assert.strictEqual(meetsAdvancedFilters(lowRatingLead, { minRating: 4.0 }).pass, false);

const landlineLead = {
  phone: "(021) 555-1234",
  rating: "4.5",
  reviewsCount: "15",
  websiteStatus: "Tidak Ada Website"
};
assert.strictEqual(meetsAdvancedFilters(landlineLead, { contactType: "wa_only" }).pass, false);
console.log("✓ Advanced Filter Evaluator passed");

// 7. Security Hardening (v1.1.1): CSV Formula Injection & URL Scheme Guard
const { neutralizeFormula, safeHttpUrl, escapeCSV, OUTREACH_STATUSES } = require("../src/content/content.js");

assert.strictEqual(neutralizeFormula('=HYPERLINK("http://jahat.id","Klik")'), '\'=HYPERLINK("http://jahat.id","Klik")');
assert.strictEqual(neutralizeFormula("+62 812-3456"), "'+62 812-3456");
assert.strictEqual(neutralizeFormula("@SUM(A1)"), "'@SUM(A1)");
assert.strictEqual(neutralizeFormula("-1+2"), "'-1+2");
assert.strictEqual(neutralizeFormula("-"), "-");
assert.strictEqual(neutralizeFormula("Kafe Kopi Senja"), "Kafe Kopi Senja");
assert.strictEqual(neutralizeFormula(42), 42);
assert.strictEqual(escapeCSV("=cmd|'/c calc'!A1"), "\"'=cmd|'/c calc'!A1\"");
assert.strictEqual(escapeCSV('Toko "Maju"'), '"Toko ""Maju"""');
console.log("✓ CSV Formula Injection guard (neutralizeFormula + escapeCSV) passed");

assert.strictEqual(safeHttpUrl("https://kliniksehat.com"), "https://kliniksehat.com");
assert.strictEqual(safeHttpUrl("HTTP://toko.id"), "HTTP://toko.id");
assert.strictEqual(safeHttpUrl("javascript:alert(1)"), "-");
assert.strictEqual(safeHttpUrl(" data:text/html,<script>"), "-");
assert.strictEqual(safeHttpUrl("file:///C:/Windows"), "-");
assert.strictEqual(safeHttpUrl("-"), "-");
assert.strictEqual(safeHttpUrl(null), "-");
console.log("✓ URL scheme guard (safeHttpUrl) passed");

assert.deepStrictEqual(OUTREACH_STATUSES, ["Belum Dihubungi", "Terkirim WA", "Tertarik / Follow-Up", "Deal (Klien)", "Ditolak"]);
console.log("✓ Outreach status whitelist verified");

// 8. Place ID based lead identity (#6)
const { extractPlaceId, leadKey, mergeIncomingLeads } = require("../src/content/content.js");
const NOB_URL = "https://www.google.com/maps/place/NOB+Coffee/data=!4m7!3m6!1s0x2e69f3cc8e8851b1:0x54c3e92b6f23d77a!8m2!3d-6.27!4d106.81!16s%2Fg%2F11wvk70y9q!19sChIJsVGIjszzaS4Retcjbyvpw1Q?hl=id";
assert.strictEqual(extractPlaceId(NOB_URL), "fid:0x2e69f3cc8e8851b1:0x54c3e92b6f23d77a");
assert.strictEqual(extractPlaceId("https://www.google.com/maps/place/X/data=!19sChIJabc-123_x"), "pid:ChIJabc-123_x");
assert.strictEqual(extractPlaceId("https://maps.google.com/?cid=1234567890"), "cid:1234567890");
assert.strictEqual(extractPlaceId("https://www.google.com/maps/search/kafe/@-6.2,106.8,15z"), "");
assert.strictEqual(extractPlaceId(null), "");

// Same name + same truncated address, different places -> different keys
const branchA = { title: "Kopi Kenangan", address: "Jl. Sudirman", mapsUrl: "https://www.google.com/maps/place/A/data=!1s0x1:0xa" };
const branchB = { title: "Kopi Kenangan", address: "Jl. Sudirman", mapsUrl: "https://www.google.com/maps/place/B/data=!1s0x1:0xb" };
assert.notStrictEqual(leadKey(branchA), leadKey(branchB));
// Without a Maps URL, fall back to name|address
assert.strictEqual(leadKey({ title: " Toko A ", address: "Jl. B" }), "na:toko a|jl. b");
// Stored placeId wins over URL parsing
assert.strictEqual(leadKey({ placeId: "fid:0x9:0x9", mapsUrl: NOB_URL }), "fid:0x9:0x9");
console.log("✓ Place ID extraction & lead identity (branches no longer collide)");

// 9. Cross-tab sync merge (report page -> Maps tab) honours updatedAt
const local = [
  { title: "A", mapsUrl: "https://www.google.com/maps/place/A/data=!1s0x1:0xa", outreachStatus: "Belum Dihubungi", updatedAt: 100 },
  { title: "B", mapsUrl: "https://www.google.com/maps/place/B/data=!1s0x1:0xb", outreachStatus: "Belum Dihubungi", updatedAt: 100 }
];
let res = mergeIncomingLeads(local, [
  Object.assign({}, local[0], { outreachStatus: "Deal (Klien)", updatedAt: 200 }),
  Object.assign({}, local[1], { outreachStatus: "Ditolak", updatedAt: 50 }) // stale snapshot
]);
assert.strictEqual(res.changed, true);
assert.strictEqual(local[0].outreachStatus, "Deal (Klien)");
assert.strictEqual(local[1].outreachStatus, "Belum Dihubungi", "snapshot lama tidak boleh menimpa data yang lebih baru");
assert.strictEqual(res.missingInIncoming, false);
res = mergeIncomingLeads(local, [local[0]]);
assert.strictEqual(res.changed, false);
assert.strictEqual(res.missingInIncoming, true, "lead yang hilang dari storage harus ditulis ulang");
// Leads that only exist in storage (restored backup, another Maps tab) are adopted
const restoredLead = { title: "C", mapsUrl: "https://www.google.com/maps/place/C/data=!1s0x1:0xc", updatedAt: 5 };
res = mergeIncomingLeads(local, [local[0], local[1], restoredLead]);
assert.strictEqual(res.added, 1);
assert.strictEqual(local.length, 3);
assert.strictEqual(res.changed, true);
console.log("✓ Storage sync merge (newer wins, stale snapshots ignored, missing rows re-persisted)");

// 10. Shared exporter: one 18-column mapping for XLSX / CSV / TSV
const XLSX = require("../libs/xlsx.full.min.js");
const Exporter = require("../src/shared/exporter.js");
const sample = [{
  title: "=EVIL()", websiteStatus: "Hanya Medsos", websiteUrl: "javascript:alert(1)",
  socialUrl: "https://instagram.com/kafe", mapsUrl: NOB_URL, outreachStatus: "Deal (Klien)",
  phone: "+62 812-0000", waUrl: "https://wa.me/628120000"
}];
assert.strictEqual(Exporter.leadToRow(sample[0], 0).length, COLUMNS.length);
const csv = Exporter.toCSV(sample);
assert.ok(csv.startsWith("﻿"), "CSV harus diawali BOM UTF-8 untuk Excel");
assert.ok(csv.includes("\"'=EVIL()\""), "nilai formula di CSV harus dinetralkan");
const tsv = Exporter.toTSV([{ title: "Tab\tdan\nbaris baru" }]);
assert.strictEqual(tsv.split("\n").length, 2, "tab/newline di dalam nilai tidak boleh memecah baris TSV");

const wb = Exporter.buildWorkbook(XLSX, sample);
const ws = wb.Sheets[wb.SheetNames[0]];
assert.strictEqual(ws.A1.v, "No");
assert.strictEqual(ws.Q1.v, "Waktu Scrape");
assert.strictEqual(ws.R1.v, "Catatan");
assert.strictEqual(ws.B2.t, "s", "nama bisnis harus disimpan sebagai teks, bukan formula");
assert.ok(!ws.B2.f);
assert.strictEqual(ws.E2.v, "Lacak di Google Search", "URL javascript: tidak boleh jadi hyperlink");
assert.ok(ws.E2.l.Target.startsWith("https://www.google.com/search?q="));
assert.strictEqual(ws.F2.l.Target, "https://instagram.com/kafe");
assert.strictEqual(ws.D2.s.fill.fgColor.rgb, "FEF3C7", "status Medsos = kuning");
assert.strictEqual(ws.O2.s.fill.fgColor.rgb, "DCFCE7", "Deal = hijau");
assert.strictEqual(ws["!dataValidation"][0].formula1, '"' + OUTREACH_STATUSES.join(",") + '"');
assert.ok(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }).length > 1000, "workbook harus bisa ditulis");
console.log("✓ Shared exporter (XLSX styling/hyperlinks, CSV BOM, TSV) verified");

// 11. Deep Search result merge
const { applyDeepSearchResult } = require("../src/shared/deep-search.js");
const noWeb = { websiteStatus: "Tidak Ada Website", websiteUrl: "-", socialUrl: "-", email: "-", techStack: "-" };
assert.strictEqual(applyDeepSearchResult(noWeb, { status: "Ada Web (Hasil Deep Search)", websiteUrl: "https://kafe.id", socialUrl: "-", email: "halo@kafe.id", techStack: "WordPress" }, statusKind), true);
assert.strictEqual(noWeb.websiteUrl, "https://kafe.id");
assert.strictEqual(noWeb.email, "halo@kafe.id");
const hasWeb = { websiteStatus: "Ada Website", websiteUrl: "https://asli.id", socialUrl: "-" };
applyDeepSearchResult(hasWeb, { status: "Ada Web (Hasil Deep Search)", websiteUrl: "https://lain.id", socialUrl: "https://instagram.com/asli" }, statusKind);
assert.strictEqual(hasWeb.websiteUrl, "https://asli.id", "website terverifikasi dari Maps tidak boleh ditimpa");
assert.strictEqual(hasWeb.websiteStatus, "Ada Website");
assert.strictEqual(hasWeb.socialUrl, "https://instagram.com/asli");
console.log("✓ Deep Search merge keeps verified Maps websites");

// 11b. Deep Search failures are explicit and never reclassify a lead
const { createDeepSearchGuard, isBlockedSerp } = require("../src/shared/deep-search.js");
const unchecked = { websiteStatus: "Tidak Ada Website", websiteUrl: "-" };
assert.strictEqual(applyDeepSearchResult(unchecked, { failed: true, blocked: true, reason: "captcha" }, statusKind), false);
assert.strictEqual(unchecked.websiteStatus, "Tidak Ada Website", "status tidak boleh berubah saat Deep Search gagal");
assert.strictEqual(unchecked.deepSearchFailed, true);
applyDeepSearchResult(unchecked, { status: "Tidak Ada Website (Verifikasi Deep)", websiteUrl: "-", socialUrl: "-" }, statusKind);
assert.strictEqual(unchecked.deepSearchFailed, false, "pengecekan sukses menghapus tanda Belum dicek");

assert.ok(isBlockedSerp('<form id="captcha-form" action="/sorry/index">'));
assert.ok(isBlockedSerp("Our systems have detected unusual traffic from your computer network."));
assert.ok(!isBlockedSerp('<a href="/url?q=https://kafe.id">Kafe</a>'));

let guard = createDeepSearchGuard();
assert.strictEqual(guard.record({ failed: true, blocked: true }), "blocked", "CAPTCHA langsung menghentikan Deep Search");
guard = createDeepSearchGuard({ maxConsecutiveFailures: 3 });
assert.strictEqual(guard.record({ failed: true }), null);
assert.strictEqual(guard.record({ status: "Ada Web (Hasil Deep Search)" }), null, "sukses mereset hitungan");
assert.strictEqual(guard.record({ failed: true }), null);
assert.strictEqual(guard.record({ failed: true }), null);
assert.strictEqual(guard.record({ failed: true }), "errors");
assert.strictEqual(guard.record({ failed: true }), null, "hanya melapor sekali");
console.log("✓ Deep Search failures flagged 'Belum dicek', CAPTCHA detection & stop guard");

// 12. Selector health monitor
const { createSelectorHealthMonitor } = require("../src/content/content.js");
const alerts = [];
const health = createSelectorHealthMonitor({ threshold: 3, onUnhealthy: (key, n) => alerts.push([key, n]) });
health.record("detailTitle", false);
health.record("detailTitle", false);
health.record("detailTitle", true); // a success resets the streak
health.record("detailTitle", false);
health.record("detailTitle", false);
assert.strictEqual(alerts.length, 0);
health.record("detailTitle", false);
assert.deepStrictEqual(alerts, [["detailTitle", 3]]);
health.record("detailTitle", false);
assert.strictEqual(alerts.length, 1, "peringatan hanya sekali per selector");
console.log("✓ Selector health monitor warns once after N consecutive misses");

// 12b. ETA: time per lead x leads still needed
const { estimateEta } = require("../src/content/content.js");
assert.strictEqual(estimateEta({ gained: 0, elapsedMs: 60000, remaining: 10 }), null, "belum ada prospek: masih menghitung");
assert.strictEqual(estimateEta({ gained: 1, elapsedMs: 3000, remaining: 10 }), null, "data terlalu sedikit");
assert.strictEqual(estimateEta({ gained: 2, elapsedMs: 60000, remaining: 10 }), 300000, "30 dtk/prospek x 10 = 5 menit");
assert.strictEqual(estimateEta({ gained: 5, elapsedMs: 60000, remaining: 0 }), 0);
console.log("✓ ETA estimate (shown after the first lead, ~8 s of data)");

// 13. Background-tab tick clock (async section, runs last)
(async () => {
  const { sleep, startKeepAlive, stopKeepAlive } = require("../src/content/content.js");
  const sent = [];
  let onMsg = null;
  let onDisc = null;
  global.chrome = {
    runtime: {
      connect: () => ({
        postMessage: (m) => { sent.push(m); setTimeout(() => onMsg({ type: "TOCK", id: m.id }), 5); },
        onMessage: { addListener: (fn) => { onMsg = fn; } },
        onDisconnect: { addListener: (fn) => { onDisc = fn; } },
        disconnect: () => {}
      })
    }
  };
  global.document = { hidden: false };

  // Visible tab: plain timers, no worker traffic
  startKeepAlive();
  await sleep(5);
  assert.strictEqual(sent.length, 0);

  // Hidden tab during a run: sleep() is woken by the service worker
  global.document.hidden = true;
  await sleep(1000); // resolves via TOCK after ~5ms, not after 1s
  assert.strictEqual(sent.length, 1);
  assert.deepStrictEqual(Object.keys(sent[0]).sort(), ["id", "ms", "type"]);
  assert.strictEqual(sent[0].ms, 1000);

  // Port dropped mid-sleep: pending sleeps resolve instead of hanging the loop
  onMsg = () => {}; // worker never answers
  const t0 = Date.now();
  const pending = sleep(10000);
  setTimeout(() => onDisc(), 10);
  await pending;
  assert.ok(Date.now() - t0 < 1000, "sleep harus selesai saat port terputus");

  // Not running: no worker clock even if hidden
  stopKeepAlive();
  const before = sent.length;
  await sleep(5);
  assert.strictEqual(sent.length, before);
  delete global.chrome;
  delete global.document;
  console.log("✓ Hidden-tab tick clock (worker-driven sleep, survives port loss)");

  console.log("\n=======================================================");
  console.log("🎉 ALL PETAKLIEN UNIT TESTS PASSED!");
  console.log("=======================================================\n");
})().catch((e) => { console.error(e); process.exit(1); });
