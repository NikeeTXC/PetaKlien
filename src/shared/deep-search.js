/**
 * PetaKlien - Shared Deep Search Engine
 * Google SERP lookup (via the background service worker), website/social classification,
 * email & CMS detection. Used by the content script and the report page.
 */

(function (root) {
  "use strict";

  // Known Social Media & Aggregator Domains
  const SOCIAL_DOMAINS = [
    "instagram.com",
    "facebook.com",
    "fb.me",
    "fb.com",
    "tiktok.com",
    "linktr.ee",
    "wa.me",
    "api.whatsapp.com",
    "whatsapp.com",
    "twitter.com",
    "x.com",
    "youtube.com",
    "shopee.co.id",
    "shopee.com",
    "tokopedia.com",
    "bukalapak.com",
    "lazada.co.id",
    "gofood.link",
    "grab.onelink.me",
    "bit.ly",
    "carrd.co",
    "beacons.ai",
    "lynkid.me",
    "threads.net",
    "pinterest.com",
    "linkedin.com"
  ];

  const BRAND_STOP_WORDS = [
    // Locations / Administrative divisions
    "jakarta", "jaksel", "jakbar", "jaktim", "jakut", "jakpus", "tangerang", "tangsel", "banten", "bekasi", "bogor", "depok",
    "jabodetabek", "bandung", "surabaya", "semarang", "medan", "makassar", "bali", "jogja", "yogyakarta", "solo", "malang",
    "indonesia", "selatan", "barat", "timur", "utara", "pusat", "daerah", "provinsi", "kota", "kabupaten", "kecamatan", "kelurahan",
    "raya", "jaya", "indah", "permai", "asri", "baru", "lama", "utama", "pagi", "petang", "siang", "sore", "malam",
    
    // Generic Education Terms
    "sdn", "sdit", "smpn", "smp", "sman", "sma", "smkn", "smk", "sekolah", "school", "dasar", "negeri", "swasta", "islam", "terpadu",
    "madrasah", "pesantren", "universitas", "kampus", "academy", "institusi", "yayasan", "bina", "bangsa", "uptd", "teladan",
    
    // Generic F&B Terms
    "kafe", "cafe", "kopi", "coffee", "resto", "restaurant", "warung", "kedai", "food", "eatery", "kitchen", "bakery",
    
    // Generic Healthcare Terms
    "klinik", "clinic", "dokter", "doctor", "dental", "care", "hospital", "apotek", "pharmacy", "medika", "sehat", "puskesmas",
    
    // Generic Auto Terms
    "bengkel", "motor", "mobil", "auto", "garage", "service", "servis", "speed",
    
    // Generic Beauty / Studio Terms
    "salon", "spa", "barbershop", "beauty", "studio", "foto", "photography", "creative", "agency",
    
    // Generic Store / Property / Other
    "toko", "shop", "store", "boutique", "mart", "market", "grosir", "retail", "hotel", "kost", "homestay", "villa", "residence", "apartemen", "property", "properti", "notaris", "lawyer", "kantor", "office"
  ];

  const NEWS_AND_DIRECTORY_DOMAINS = [
    "google.", "youtube.", "maps.google", "waze.com", "gstatic.", "apple.com",
    "rumah123.com", "lamudi.co.id", "rumah.com", "pinhome.id", "99.co", "urbanindo.com", "dotproperty.id",
    "traveloka.com", "tiket.com", "pegipegi.com", "agoda.com", "booking.com", "tripadvisor.", "trip.com", "airbnb.", "oyorooms.com", "reddoorz.com",
    "pergikuliner.com", "zomato.com", "restaurantguru.com", "qraved.com", "nibble.id", "manual.co.id", "horego.com", "foody.id",
    "gofood.", "grab.", "shopee.", "tokopedia.", "bukalapak.", "lazada.", "blibli.", "jakartanotebook.com",
    "detik.com", "kompas.com", "kompasiana.com", "tribunnews.com", "liputan6.com", "kumparan.com", "sindonews.com",
    "suara.com", "idntimes.com", "viva.co.id", "merdeka.com", "okezone.com", "inews.id", "antaranews.com",
    "tempo.co", "bisnis.com", "jawapos.com", "beritasatu.com", "solopos.com", "kaskus.co.id", "hipwee.com",
    "popbela.com", "popmama.com", "orami.co.id", "mojok.co", "faktualnews.co", "radarbogor.id", "radartangerang.co.id",
    "radardepok.com", "radarbanten.co.id", "bantennews.co.id", "tangerangnews.com", "poskota.co.id", "pikiran-rakyat.com",
    "republika.co.id", "mediaindonesia.com", "harianhaluan.com", "katadata.co.id", "tirto.id", "cnbcindonesia.com", "cnnindonesia.com",
    "grid.id", "sonora.id", "fin.co.id", "akurat.co", "jpnn.com", "disway.id", "suaramerdeka.com",
    "wikipedia.org", "wikimapia.org", "idalamat.com", "alamatlengkap.com", "lokasitempat.com", "sekolahloka.com",
    "infosekolah.net", "yellowpages.co.id", "indonetwork.co.id", "foursquare.com", "yelp.com", "cybo.com",
    "nicelocal.id", "worldorgs.com", "findglocal.com", "nearplace.com", "bizin.id", "infopromodiskon.com", "tempat.me",
    "kemdikbud.go.id", "kemdikdasmen.go.id", "dapo.kemdikbud.go.id", "referensi.data.kemdikbud.go.id", "kemenag.go.id", "ban-sm.or.id",
    "kesekolah.com", "siap-sekolah.com", "sekolahterbaikjakarta.com", "sekolahterbaik.com", "direktorisekolah.com", "daftar-sekolah.com",
    "kemkes.go.id", "jakarta.go.id", "bantenprov.go.id", "tangselkota.go.id", "jabarprov.go.id",
    "halodoc.com", "alodokter.com", "klikdokter.com", "gooddoctor.co.id", "sehatq.com", "konsula.com",
    "medium.com", "scribd.com", "slideshare.net", "issuu.com", "quora.com", "reddit.com"
  ];

  const ARTICLE_PATH_PATTERNS = [
    /\/explore\//i, /\/artikel\//i, /\/article\//i, /\/berita\//i, /\/news\//i, /\/review\//i,
    /\/ulasan\//i, /\/tempat\//i, /\/places\//i, /\/directory\//i, /\/direktori\//i, /\/kuliner\//i, /\/wisata\//i,
    /\/restoran\//i, /\/cafe\//i, /\/sekolah\//i, /\/listing\//i, /\/post\//i, /\/read\//i,
    /\/kategori\//i, /\/category\//i, /\/tag\//i, /\/tags\//i, /\/search\//i, /\/profil-sekolah\//i, /\/profil\//i,
    /\/arsip\//i, /\/archive\//i, /\/topic\//i, /\/data\//i, /\/detail-sekolah\//i, /\/find\//i
  ];

  const FREE_BUILDER_DOMAINS = [
    "blogspot.com", "blogspot.co.id", "wordpress.com", "wixsite.com", "wix.com",
    "carrd.co", "site123.me", "weebly.com", "sites.google.com", "canva.site",
    "mystrikingly.com", "strikingly.com", "yolasite.com", "jimdofree.com", "jimdo.com",
    "webflow.io", "glitch.me", "vercel.app", "netlify.app", "github.io"
  ];

  // Technology Detection Signatures (CMS, Builders, Frameworks)
  function detectWebsiteTech(html = "", url = "") {
    if (!html && !url) return "-";
    const h = html.toLowerCase();
    const u = url.toLowerCase();
    const techs = [];

    if (h.includes("wp-content") || h.includes("wp-includes") || h.includes("wordpress") || u.includes("wordpress.com")) {
      techs.push("WordPress");
    }
    if (h.includes("woocommerce") || h.includes("wc-api")) {
      techs.push("WooCommerce");
    }
    if (h.includes("cdn.shopify.com") || h.includes("shopify.") || h.includes("myshopify.com") || u.includes("myshopify.com")) {
      techs.push("Shopify");
    }
    if (h.includes("wix.com") || h.includes("wixsite.com") || u.includes("wixsite.com")) {
      techs.push("Wix");
    }
    if (h.includes("squarespace.com") || h.includes("static1.squarespace.com")) {
      techs.push("Squarespace");
    }
    if (h.includes("webflow.com") || h.includes("assets.website-files.com") || u.includes("webflow.io")) {
      techs.push("Webflow");
    }
    if (h.includes("carrd.co") || u.includes("carrd.co")) {
      techs.push("Carrd");
    }
    if (h.includes("canva.site") || u.includes("canva.site")) {
      techs.push("Canva Site");
    }
    if (h.includes("laravel") || h.includes("csrf-token") || h.includes("livewire")) {
      techs.push("Laravel");
    }
    if (h.includes("__next") || h.includes("/_next/")) {
      techs.push("Next.js / React");
    }

    return techs.length > 0 ? techs.join(", ") : "-";
  }

  // Email Extraction Regex (Ignores media extensions)
  function extractEmail(html = "", text = "") {
    const blob = (html + " " + text);
    const mailtoMatch = blob.match(/mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
    if (mailtoMatch && mailtoMatch[1]) {
      return mailtoMatch[1].toLowerCase().trim();
    }

    const emailMatches = blob.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g);
    if (emailMatches) {
      for (const email of emailMatches) {
        const lower = email.toLowerCase();
        if (
          !lower.endsWith(".png") &&
          !lower.endsWith(".jpg") &&
          !lower.endsWith(".jpeg") &&
          !lower.endsWith(".gif") &&
          !lower.endsWith(".webp") &&
          !lower.includes("example.com") &&
          !lower.includes("domain.com") &&
          !lower.includes("google.com")
        ) {
          return lower.trim();
        }
      }
    }
    return "-";
  }

  function buildDeepSearchQuery(title, address) {
    const cleanTitle = (title || "").replace(/[^\w\s]/gi, " ").trim();
    if (!cleanTitle) return { cleanTitle: "", query: "" };
    let locPart = "";
    if (address && address !== "-") {
      const parts = address.split(",").map(p => p.trim());
      locPart = parts[parts.length - 2] || parts[parts.length - 1] || "";
    }
    return { cleanTitle, query: `${cleanTitle} ${locPart} website resmi`.trim() };
  }

  /**
   * Google's "unusual traffic" / CAPTCHA interstitial (sometimes served with HTTP 200).
   */
  function isBlockedSerp(html) {
    return /unusual traffic|\/sorry\/index|id="captcha-form"|g-recaptcha|lalu lintas yang tidak biasa/i.test(html || "");
  }

  /**
   * Pure parser: SERP HTML -> classification result. Requires DOMParser (browser / jsdom).
   */
  function parseDeepSearchHtml(html, title, existingStatus = "", existingUrl = "") {
    const { cleanTitle } = buildDeepSearchQuery(title, "");
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const linkElements = Array.from(doc.querySelectorAll("a[href^='http'], a[href^='/url?q=http']"));

    // Brand keywords for hostname matching (strictly exclude generic stop words)
    const allTokens = cleanTitle.toLowerCase().split(/\s+/).filter(t => t.length >= 2);
    const brandTokens = allTokens.filter(t => !BRAND_STOP_WORDS.includes(t));
    const combinedBrand = (brandTokens.length > 0 ? brandTokens : allTokens).join('');

    const candidates = [];
    for (const el of linkElements) {
      let href = el.getAttribute("href") || "";
      if (href.startsWith("/url?q=")) {
        const urlMatch = href.match(/\/url\?q=([^&]+)/);
        if (urlMatch) href = decodeURIComponent(urlMatch[1]);
      }

      if (!href.startsWith("http")) continue;

      try {
        const parsed = new URL(href);
        const host = parsed.hostname.toLowerCase();
        const path = parsed.pathname.toLowerCase();

        // Reject Google / internal
        if (host.includes("google.") || host.includes("gstatic.")) continue;
        // Reject News, Portal, Real estate, Directory portals
        if (NEWS_AND_DIRECTORY_DOMAINS.some(d => host.includes(d))) continue;
        // Reject 3rd-party article/review paths
        if (ARTICLE_PATH_PATTERNS.some(p => p.test(path))) continue;

        // Check if valid Social Media profile (not reel/post/tag)
        const isSocial = SOCIAL_DOMAINS.some(s => host.includes(s));
        if (isSocial) {
          if (!path.includes("/p/") && !path.includes("/reel/") && !path.includes("/explore/") && !path.includes("/tag/")) {
            candidates.push({ type: "social", url: href, host });
          }
          continue;
        }

        // Reject generic directory/aggregator hostnames
        const isAggregatorHost = ["sekolahterbaik", "terbaik", "direktori", "directory", "rekomendasi", "daftartempat", "reviewtempat", "infotempat"].some(k => host.includes(k));
        if (isAggregatorHost) continue;

        // Check if custom domain matches the unique brand
        const cleanHost = host.replace(/^(www\.|m\.)/, '').replace(/\.(com|co\.id|id|net|org|sch\.id|ac\.id|biz|site|xyz|info|or\.id|go\.id)$/, '').replace(/[^\w]/g, '');
        
        const hostMatchesBrand = brandTokens.length > 0
          ? (brandTokens.some(t => t.length >= 3 && cleanHost.includes(t)) || (combinedBrand.length >= 4 && cleanHost.includes(combinedBrand)))
          : (combinedBrand.length >= 4 && cleanHost.includes(combinedBrand));

        if (hostMatchesBrand) {
          candidates.push({ type: "website", url: href, host });
        }
      } catch (e) {}
    }

    const topWeb = candidates.find(c => c.type === "website");
    const topSocial = candidates.find(c => c.type === "social");
    const email = extractEmail(html);
    const techStack = topWeb ? detectWebsiteTech(html, topWeb.url) : "-";

    const hadSocial = (existingStatus && existingStatus.includes("Hanya Medsos")) || 
                      (existingUrl && (existingUrl.includes("instagram.com") || existingUrl.includes("facebook.com") || existingUrl.includes("tiktok.com") || existingUrl.includes("linktr.ee")));

    if (hadSocial) {
      if (topWeb) {
        return {
          status: "Web Resmi (Deep) + Medsos",
          websiteUrl: topWeb.url,
          socialUrl: existingUrl || (topSocial ? topSocial.url : "-"),
          email,
          techStack
        };
      } else {
        return {
          status: "Hanya Medsos (Verifikasi Deep)",
          websiteUrl: "-",
          socialUrl: (existingUrl && existingUrl !== "-") ? existingUrl : (topSocial ? topSocial.url : "-"),
          email,
          techStack: "-"
        };
      }
    } else {
      if (topWeb) {
        return {
          status: "Ada Web (Hasil Deep Search)",
          websiteUrl: topWeb.url,
          socialUrl: topSocial ? topSocial.url : "-",
          email,
          techStack
        };
      }
      if (topSocial) {
        return {
          status: "Hanya Medsos (Hasil Deep Search)",
          websiteUrl: "-",
          socialUrl: topSocial.url,
          email,
          techStack: "-"
        };
      }
      return {
        status: "Tidak Ada Website (Verifikasi Deep)",
        websiteUrl: "-",
        socialUrl: "-",
        email,
        techStack: "-"
      };
    }
  }

  /**
   * Background Auto Deep Search:
   * Proxies queries to background service worker (isolated origin, no user cookies, bypasses CORS).
   */
  async function performAutoDeepSearch(title, address, existingStatus = "", existingUrl = "") {
    try {
      const { query } = buildDeepSearchQuery(title, address);
      if (!query) return { failed: true, blocked: false, reason: "Nama tempat kosong" };

      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: "DEEP_SEARCH", query }, (res) => {
          if (chrome.runtime.lastError) {
            console.warn("PetaKlien: Deep Search runtime message error", chrome.runtime.lastError);
            resolve({ ok: false, reason: chrome.runtime.lastError.message });
          } else {
            resolve(res || { ok: false, reason: "No response from background worker" });
          }
        });
      });

      if (!response || !response.ok || !response.html) {
        console.warn("PetaKlien: Deep search query failed:", response?.reason);
        return { failed: true, blocked: Boolean(response && response.blocked), reason: (response && response.reason) || "Tidak ada respons" };
      }
      if (isBlockedSerp(response.html)) {
        return { failed: true, blocked: true, reason: "Google meminta verifikasi CAPTCHA" };
      }

      return parseDeepSearchHtml(response.html, title, existingStatus, existingUrl);
    } catch (e) {
      console.warn("PetaKlien: Auto Deep Search fetch error", e);
      return { failed: true, blocked: false, reason: e.message || "Network error" };
    }
  }

  /**
   * Merges a Deep Search result into a lead (mutates). Returns true when an official website was found.
   * Leads that already have a verified website only gain social/email/tech enrichment.
   */
  function applyDeepSearchResult(lead, deepRes, statusKind) {
    if (!lead || !deepRes) return false;
    // A failed lookup must not change the classification: flag it so it can be retried
    if (deepRes.failed) {
      lead.deepSearchFailed = true;
      return false;
    }
    lead.deepSearchFailed = false;
    const hadWeb = (lead.websiteUrl && lead.websiteUrl !== "-") && statusKind(lead.websiteStatus) === "web";
    if (hadWeb) {
      if (deepRes.socialUrl && deepRes.socialUrl !== "-" && (!lead.socialUrl || lead.socialUrl === "-")) {
        lead.socialUrl = deepRes.socialUrl;
      }
    } else {
      lead.websiteStatus = deepRes.status;
      if (deepRes.websiteUrl && deepRes.websiteUrl !== "-") {
        lead.websiteUrl = deepRes.websiteUrl;
      }
      if (deepRes.socialUrl && deepRes.socialUrl !== "-") {
        lead.socialUrl = deepRes.socialUrl;
      }
    }
    if (deepRes.email && deepRes.email !== "-") {
      lead.email = deepRes.email;
    }
    if (deepRes.techStack && deepRes.techStack !== "-") {
      lead.techStack = deepRes.techStack;
    }
    return statusKind(deepRes.status) === "web";
  }

  /**
   * Stops Deep Search when Google starts refusing: immediately on a CAPTCHA / 429
   * (continuing only deepens the block), or after N consecutive other failures.
   */
  function createDeepSearchGuard({ maxConsecutiveFailures = 3 } = {}) {
    let consecutive = 0;
    let tripped = null;
    return {
      /** Returns the reason string the first time the guard trips, otherwise null. */
      record(deepRes) {
        if (tripped) return null;
        if (!deepRes || !deepRes.failed) {
          consecutive = 0;
          return null;
        }
        consecutive++;
        if (deepRes.blocked || consecutive >= maxConsecutiveFailures) {
          tripped = deepRes.blocked ? "blocked" : "errors";
          return tripped;
        }
        return null;
      },
      get tripped() {
        return tripped;
      }
    };
  }

  const deepSearch = {
    SOCIAL_DOMAINS,
    BRAND_STOP_WORDS,
    NEWS_AND_DIRECTORY_DOMAINS,
    ARTICLE_PATH_PATTERNS,
    FREE_BUILDER_DOMAINS,
    detectWebsiteTech,
    extractEmail,
    buildDeepSearchQuery,
    parseDeepSearchHtml,
    performAutoDeepSearch,
    applyDeepSearchResult,
    isBlockedSerp,
    createDeepSearchGuard
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = deepSearch;
  }
  if (typeof root !== "undefined" && root) {
    root.PetaKlienDeepSearch = deepSearch;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
