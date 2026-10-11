// DOM extraction tests against real Google Maps markup (test/fixtures/*.html, captured 2026-10-10).
// When Google changes its DOM, re-capture the fixtures: a failure here is the early warning.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

// Load modules before a DOM exists so content.js does not auto-start its engine
const C = require("../src/content/content.js");
const { parseDeepSearchHtml } = require("../src/shared/deep-search.js");

const FEED = fs.readFileSync(path.join(__dirname, "fixtures/maps-feed.html"), "utf8");
const DETAIL = fs.readFileSync(path.join(__dirname, "fixtures/maps-detail.html"), "utf8");
const NOB = "NOB Coffee &amp; Eatery, Barnyard Kemang";

/**
 * Mounts markup as the current page. Google Maps keeps the results feed in the DOM
 * while a detail panel is open, so most tests mount both.
 */
function mount(html) {
  const dom = new JSDOM(`<!DOCTYPE html><body>${html}</body>`, { url: "https://www.google.com/maps/search/kafe" });
  // jsdom has no layout engine, so no innerText; textContent is close enough for these checks
  Object.defineProperty(dom.window.HTMLElement.prototype, "innerText", {
    get() { return this.textContent; }
  });
  global.window = dom.window;
  global.document = dom.window.document;
  global.DOMParser = dom.window.DOMParser;
  return dom;
}

/** Same detail panel, but describing another place (used to catch cross-contamination). */
function detailFor(name, rating, reviews) {
  return DETAIL.split(NOB).join(name).replace(/4,9/g, rating).replace(/2\.749/g, reviews);
}

console.log("=== RUNNING PETAKLIEN DOM FIXTURE SUITE ===");

// 1. Results feed & cards
mount(FEED);
const feed = C.getFeedContainer();
assert.ok(feed, "feed hasil pencarian harus ditemukan");
assert.strictEqual(feed.getAttribute("role"), "feed");
const cards = C.getBusinessCards();
assert.strictEqual(cards.length, 3);

const previews = cards.map(C.extractCardPreview);
assert.deepStrictEqual(previews.map((p) => p.title), ["NOB Coffee & Eatery, Barnyard Kemang", "Sable Cafe", "Deuce Cafe Kemang"]);
assert.deepStrictEqual(previews.map((p) => p.rating), ["4,9", "4,9", "5,0"]);
assert.deepStrictEqual(previews.map((p) => p.reviewsCount), ["2749", "536", "220"]);
assert.ok(previews.every((p) => p.category === "Kafe"));
assert.strictEqual(previews[0].addressSnippet, "Jl. Kemang Selatan 11 No.6, RT.1/RW.3");
assert.deepStrictEqual(previews.map((p) => C.extractPlaceId(p.mapsUrl)), [
  "fid:0x2e69f3cc8e8851b1:0x54c3e92b6f23d77a",
  "fid:0x2e69f10e7ed4f5f5:0x1cf4262410fa2b51",
  "fid:0x2e69f10051ab49a1:0xf738ef400fe40e03"
]);
console.log("✓ Feed: 3 cards, titles/ratings/reviews/category/place id extracted");

// 2. Detail panel (feed + detail both mounted, like the live page)
mount(FEED + DETAIL);
let lead = C.extractDetailData(C.extractCardPreview(C.getBusinessCards()[0]), C.getBusinessCards()[0]);
assert.strictEqual(lead.title, "NOB Coffee & Eatery, Barnyard Kemang");
assert.strictEqual(lead.category, "Kafe");
assert.strictEqual(lead.rating, "4,9");
assert.strictEqual(lead.reviewsCount, "2749");
assert.strictEqual(lead.websiteStatus, "Ada Website");
assert.strictEqual(lead.websiteUrl, "https://arkagroup.id/");
assert.strictEqual(lead.phone, "081200001234");
assert.strictEqual(lead.phoneType, "Seluler (WhatsApp)");
assert.strictEqual(lead.waUrl, "https://wa.me/6281200001234");
assert.ok(lead.address.startsWith("Jl. Kemang Selatan 11 No.6") && lead.address.endsWith("12730"));
assert.strictEqual(lead.placeId, "fid:0x2e69f3cc8e8851b1:0x54c3e92b6f23d77a");
assert.ok(lead.updatedAt > 0);
console.log("✓ Detail: name, category, rating, website, WhatsApp, address & place id");

// 3. Regression: detail lookups must stay inside the detail panel.
//    Before v1.1.1 the reviews of the *first feed card* leaked into every other place ("492749").
mount(FEED + detailFor("Deuce Cafe Kemang", "5,0", "220"));
const deuceCard = C.getBusinessCards()[2];
lead = C.extractDetailData(C.extractCardPreview(deuceCard), deuceCard);
assert.strictEqual(lead.title, "Deuce Cafe Kemang");
assert.strictEqual(lead.rating, "5,0");
assert.strictEqual(lead.reviewsCount, "220", "jumlah ulasan tidak boleh diambil dari kartu feed lain");
console.log("✓ Regression: rating/reviews scoped to the detail panel (no feed leakage)");

// 4. Regression: a feed card's "Situs Web" button must not become another place's website
const feedWithWebButton = FEED.replace(
  '<div class="NrDZNb">',
  '<a data-value="Situs Web" aria-label="Kunjungi situs web NOB Coffee" href="https://nobcoffee.example/"></a><div class="NrDZNb">'
);
const detailNoWeb = detailFor("Sable Cafe", "4,9", "536").replace(/<div[^>]*id="fixture-website-row"[\s\S]*?<\/a>\s*<\/div>/, "");
mount(feedWithWebButton + detailNoWeb);
const sableCard = C.getBusinessCards()[1];
lead = C.extractDetailData(C.extractCardPreview(sableCard), sableCard);
assert.strictEqual(lead.title, "Sable Cafe");
assert.strictEqual(lead.websiteStatus, "Tidak Ada Website", "website kartu lain bocor ke prospek ini");
assert.strictEqual(lead.websiteUrl, "-");
console.log("✓ Regression: website button of another feed card is ignored");

// 5. Social-media-only listing
mount(FEED + DETAIL.replace('href="https://arkagroup.id/"', 'href="https://www.instagram.com/nobcoffee/"'));
lead = C.extractDetailData(C.extractCardPreview(C.getBusinessCards()[0]), C.getBusinessCards()[0]);
assert.strictEqual(lead.websiteStatus, "Hanya Medsos");
assert.strictEqual(lead.socialUrl, "https://www.instagram.com/nobcoffee/");
assert.strictEqual(lead.websiteUrl, "-");
console.log("✓ Social-only listing classified as \"Hanya Medsos\"");

// 6. Permanently closed places are skipped
mount(FEED + DETAIL.replace("</h1></div>", '</h1></div><div class="fontBodyMedium">Tutup permanen</div>'));
lead = C.extractDetailData(C.extractCardPreview(C.getBusinessCards()[0]), C.getBusinessCards()[0]);
assert.deepStrictEqual(lead, { isClosed: true, title: "NOB Coffee & Eatery, Barnyard Kemang" });
console.log("✓ Permanently closed place detected");

// 7. Deep Search SERP parser (synthetic SERP: brand site, IG profile, news article, Google link)
const serp = `
  <a href="/url?q=https://www.detik.com/food/kafe-senja-hits&sa=U">Artikel</a>
  <a href="https://www.google.com/maps/place/x">Maps</a>
  <a href="/url?q=https://www.instagram.com/kafesenja.id/&sa=U">Instagram</a>
  <a href="/url?q=https://kafesenja.id/&sa=U">Kafe Senja - Official</a>
  <span>Hubungi kami: halo@kafesenja.id</span>`;
let deep = parseDeepSearchHtml(serp, "Kafe Senja", "Tidak Ada Website", "");
assert.strictEqual(deep.status, "Ada Web (Hasil Deep Search)");
assert.strictEqual(deep.websiteUrl, "https://kafesenja.id/");
assert.strictEqual(deep.socialUrl, "https://www.instagram.com/kafesenja.id/");
assert.strictEqual(deep.email, "halo@kafesenja.id");

deep = parseDeepSearchHtml('<a href="/url?q=https://www.detik.com/x&sa=U">x</a>', "Kafe Senja", "Tidak Ada Website", "");
assert.strictEqual(deep.status, "Tidak Ada Website (Verifikasi Deep)", "artikel berita tidak boleh dianggap website resmi");
console.log("✓ Deep Search SERP parser: brand site / social / news filter / email");

console.log("\n=======================================================");
console.log("🎉 ALL PETAKLIEN DOM FIXTURE TESTS PASSED!");
console.log("=======================================================\n");
