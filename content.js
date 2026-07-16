// ============================================================
//  Maps Lead Hunter v4.0 — Content Script
//  • Harvests cards directly (no clicking needed for base data)
//  • Auto-scrolls results panel endlessly
//  • For social/email: clicks each card → reads website URL
//    → asks background.js to fetch that site
//  • Works on /maps/place/ single pages too
// ============================================================

let isScrapingActive = false;
let scrapedResults   = [];
let processedKeys    = new Set();
let scrollTimer      = null;
let scrollContainer  = null;
let stuckCount       = 0;
let lastSeenCount    = 0;

// Active options (set by popup at start)
let activeFilter   = "no-website"; // "all" | "no-website"
let fetchFacebook  = false;
let fetchInstagram = false;
let fetchEmail     = false;

// Queue of cards pending social fetch (so we don't hammer at once)
let socialQueue    = [];
let socialWorking  = false;

// ── Message bridge ───────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  switch (msg.action) {
    case "startScraping":
      activeFilter   = msg.filter   || "no-website";
      fetchFacebook  = !!msg.facebook;
      fetchInstagram = !!msg.instagram;
      fetchEmail     = !!msg.email;
      startScraping();
      sendResponse({ status: "started" });
      break;
    case "stopScraping":
      stopScraping();
      sendResponse({ status: "stopped" });
      break;
    case "getResults":
      sendResponse({ results: scrapedResults, isActive: isScrapingActive, count: scrapedResults.length });
      break;
    case "clearResults":
      scrapedResults = [];
      processedKeys.clear();
      socialQueue = [];
      sendResponse({ status: "cleared" });
      break;
  }
  return true;
});

// ════════════════════════════════════════════════════════════
//  START / STOP
// ════════════════════════════════════════════════════════════
function startScraping() {
  if (isScrapingActive) return;
  isScrapingActive = true;
  stuckCount = 0;
  lastSeenCount = 0;

  if (location.href.includes("/maps/place/")) {
    scrapeSinglePlace();
  } else {
    scrapeListMode();
  }
}

function stopScraping() {
  isScrapingActive = false;
  if (scrollTimer) { clearInterval(scrollTimer); scrollTimer = null; }
  notifyPopup("stopped");
}

function notifyPopup(status) {
  chrome.runtime.sendMessage({
    action: "updateStatus",
    isActive: isScrapingActive,
    count: scrapedResults.length,
    status: status || ""
  }).catch(() => {});
}

// ════════════════════════════════════════════════════════════
//  MODE A — /maps/place/ single page
// ════════════════════════════════════════════════════════════
function scrapeSinglePlace() {
  setTimeout(async () => {
    const d = extractFromDetailPanel();
    if (d) {
      await enrichWithSocials(d);
      saveResult(d);
    }
    notifyPopup();
    watchNavigation();
  }, 2000);
}

let _lastUrl = location.href;
function watchNavigation() {
  if (!isScrapingActive) return;
  if (location.href !== _lastUrl && location.href.includes("/maps/place/")) {
    _lastUrl = location.href;
    setTimeout(async () => {
      const d = extractFromDetailPanel();
      if (d) {
        await enrichWithSocials(d);
        saveResult(d);
        notifyPopup();
      }
    }, 2000);
  }
  setTimeout(watchNavigation, 800);
}

// ════════════════════════════════════════════════════════════
//  MODE B — search results list
// ════════════════════════════════════════════════════════════
function scrapeListMode() {
  scrollContainer = findScrollPanel();
  harvestAllCards();

  scrollTimer = setInterval(() => {
    if (!isScrapingActive) { clearInterval(scrollTimer); return; }
    harvestAllCards();
    scrollDown();

    const total = processedKeys.size;
    if (total === lastSeenCount) {
      stuckCount++;
      if (stuckCount === 6)  doHardScroll();
      if (stuckCount >= 16)  { stopScraping(); notifyPopup("done"); }
    } else {
      stuckCount = 0;
    }
    lastSeenCount = total;
  }, 1800);
}

function findScrollPanel() {
  const tries = [
    () => document.querySelector('[role="feed"]'),
    () => document.querySelector('div[aria-label*="Results for"]'),
    () => document.querySelector('div[aria-label*="results"]'),
    () => document.querySelector('.m6QErb[aria-label]'),
    () => document.querySelector('.m6QErb'),
    () => {
      let best = null, bestH = 0;
      for (const d of document.querySelectorAll('div')) {
        if (d.scrollHeight > d.clientHeight + 200 && d.clientHeight > 200 && d.clientHeight < 800) {
          if (d.scrollHeight > bestH) { bestH = d.scrollHeight; best = d; }
        }
      }
      return best;
    }
  ];
  for (const fn of tries) { const el = fn(); if (el) return el; }
  return document.documentElement;
}

function scrollDown()    { if (scrollContainer) scrollContainer.scrollTop += 500; }
function doHardScroll()  {
  if (scrollContainer) {
    scrollContainer.scrollTop += 3000;
    scrollContainer.dispatchEvent(new WheelEvent('wheel', { deltaY: 2000, bubbles: true }));
  }
}

// ════════════════════════════════════════════════════════════
//  HARVEST LIST CARDS
// ════════════════════════════════════════════════════════════
function harvestAllCards() {
  const links = document.querySelectorAll('a[href*="/maps/place/"]');
  for (const link of links) {
    const key = normalizePlaceUrl(link.href);
    if (!key || processedKeys.has(key)) continue;
    const card = getCardContainer(link);
    processedKeys.add(key);
    if (!card) continue;
    const data = extractFromCard(card, link.href);
    if (!data) continue;

    // Save immediately with base data
    if (shouldSave(data)) {
      addOrUpdate(data);
      // Queue for social enrichment if needed
      if (needsSocialFetch() && data.websiteUrl) {
        socialQueue.push(data);
        runSocialQueue();
      }
    }
  }
}

function getCardContainer(link) {
  let el = link;
  for (let i = 0; i < 10; i++) {
    el = el.parentElement;
    if (!el) break;
    if (
      el.tagName === "LI" ||
      el.getAttribute("role") === "article" ||
      el.hasAttribute("data-result-index") ||
      (el.hasAttribute("jsaction") && el.querySelectorAll('a[href*="/maps/place/"]').length === 1)
    ) return el;
  }
  return link.parentElement?.parentElement || link.parentElement;
}

// ════════════════════════════════════════════════════════════
//  EXTRACT BASE DATA FROM A LIST CARD
// ════════════════════════════════════════════════════════════
function extractFromCard(card, href) {
  const link = card.querySelector('a[href*="/maps/place/"]') || { href, getAttribute: () => null };

  // Name
  let name = link.getAttribute?.("aria-label")?.trim() || card.getAttribute("aria-label")?.trim() || "";
  if (!name) {
    for (const sel of ['.qBF1Pd','.NrDZNb','.OSrXXb','div[role="heading"]','h3','h2','h4']) {
      const t = card.querySelector(sel)?.textContent?.trim();
      if (t && t.length > 1 && t.length < 120) { name = t; break; }
    }
  }
  if (!name || name.length < 2) return null;

  const mapsLink = `https://www.google.com${safePathname(href)}`;
  const phone    = findPhoneInElement(card);
  const { hasWebsite, websiteUrl } = findWebsiteInElement(card);

  const ratingEl = card.querySelector('[aria-label*="star" i]');
  const rating   = ratingEl?.getAttribute("aria-label")?.match(/[\d.]+/)?.[0] || "";

  let category = "";
  for (const span of card.querySelectorAll('span')) {
    const t = span.textContent.trim();
    if (t.length > 2 && t.length < 45 && !/^\d[\d.,\s]*$/.test(t)
        && !t.includes("·") && span.children.length === 0
        && !/\d{3,}/.test(t) && !/open|closed|AM|PM/i.test(t)) {
      category = t; break;
    }
  }

  return {
    name, phone: phone || "N/A",
    link: mapsLink, hasWebsite, websiteUrl: websiteUrl || "",
    rating, category,
    facebook: "", instagram: "", email: "",
    socialFetched: false
  };
}

// ════════════════════════════════════════════════════════════
//  EXTRACT FROM SINGLE PLACE DETAIL PANEL
// ════════════════════════════════════════════════════════════
function extractFromDetailPanel() {
  const name = document.querySelector('h1')?.textContent?.trim()
    || document.title.replace(/[-–].*Google Maps.*/i, "").trim();
  if (!name || name.toLowerCase().includes("google maps")) return null;

  const link                   = document.querySelector('link[rel="canonical"]')?.href || location.href;
  const phone                  = findPhoneInElement(document);
  const { hasWebsite, websiteUrl } = findWebsiteInElement(document);

  return {
    name, phone: phone || "N/A",
    link, hasWebsite, websiteUrl: websiteUrl || "",
    rating: "", category: "",
    facebook: "", instagram: "", email: "",
    socialFetched: false
  };
}

// ════════════════════════════════════════════════════════════
//  SHARED FIELD EXTRACTORS
// ════════════════════════════════════════════════════════════
function findPhoneInElement(root) {
  const tel = root.querySelector?.('[data-item-id^="phone:tel:"]');
  if (tel) return tel.getAttribute("data-item-id").replace("phone:tel:", "").trim();

  for (const el of (root.querySelectorAll?.('[aria-label]') || [])) {
    const m = (el.getAttribute("aria-label") || "").match(/\+?[\d][\d\s\-\(\).]{6,}\d/);
    if (m) return m[0].trim();
  }

  const walker = document.createTreeWalker(root.querySelector?.('[role="main"]') || root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const raw = (walker.currentNode.nodeValue || "").trim();
    if (raw.length > 35) continue;
    const m = raw.match(/^\+?[\d(][\d\s\-\(\).]{6,}\d$/);
    if (m) return m[0].trim();
  }
  return "";
}

function findWebsiteInElement(root) {
  const auth = root.querySelector?.('[data-item-id="authority"]');
  if (auth) return { hasWebsite: true, websiteUrl: auth.href || "" };

  const wl = root.querySelector?.('[aria-label*="website" i], [data-tooltip*="website" i]');
  if (wl) return { hasWebsite: true, websiteUrl: wl.href || wl.getAttribute("href") || "" };

  const scope = root.querySelector?.('[role="main"]') || root;
  for (const a of (scope.querySelectorAll?.('a[href^="http"]') || [])) {
    const h = a.href || "";
    if (!h.includes("google.") && !h.includes("goo.gl") && !h.includes("maps.app")
        && !h.includes("support.") && !h.includes("policies.") && !h.includes("accounts.")) {
      return { hasWebsite: true, websiteUrl: h };
    }
  }
  return { hasWebsite: false, websiteUrl: "" };
}

// ════════════════════════════════════════════════════════════
//  SOCIAL ENRICHMENT QUEUE
//  Fetches website pages via background.js to extract socials
// ════════════════════════════════════════════════════════════
function needsSocialFetch() {
  return fetchFacebook || fetchInstagram || fetchEmail;
}

async function runSocialQueue() {
  if (socialWorking || !socialQueue.length) return;
  socialWorking = true;

  while (socialQueue.length && isScrapingActive) {
    const item = socialQueue.shift();

    // Skip if already enriched or no website
    if (item.socialFetched || !item.websiteUrl) continue;

    try {
      const resp = await chrome.runtime.sendMessage({
        action: "fetchSocials",
        url: item.websiteUrl,
        options: { facebook: fetchFacebook, instagram: fetchInstagram, email: fetchEmail }
      });

      if (resp?.ok) {
        item.facebook  = resp.facebook  || "";
        item.instagram = resp.instagram || "";
        item.email     = resp.email     || "";
      }
    } catch (e) {
      // background not ready — ignore
    }

    item.socialFetched = true;
    notifyPopup(); // refresh popup table with new social data

    // Polite delay between website fetches
    await sleep(800);
  }

  socialWorking = false;
}

async function enrichWithSocials(data) {
  if (!needsSocialFetch() || !data.websiteUrl || data.socialFetched) return;
  try {
    const resp = await chrome.runtime.sendMessage({
      action: "fetchSocials",
      url: data.websiteUrl,
      options: { facebook: fetchFacebook, instagram: fetchInstagram, email: fetchEmail }
    });
    if (resp?.ok) {
      data.facebook  = resp.facebook  || "";
      data.instagram = resp.instagram || "";
      data.email     = resp.email     || "";
    }
  } catch {}
  data.socialFetched = true;
}

// ════════════════════════════════════════════════════════════
//  SAVE / UPDATE
// ════════════════════════════════════════════════════════════
function shouldSave(data) {
  if (activeFilter === "no-website" && data.hasWebsite) return false;
  return true;
}

function addOrUpdate(data) {
  const existing = scrapedResults.find(r => r.link === data.link);
  if (existing) {
    // Update social fields if newly enriched
    Object.assign(existing, data);
  } else {
    scrapedResults.push(data);
    notifyPopup();
  }
}

function saveResult(data) {
  if (!shouldSave(data)) return;
  addOrUpdate(data);
}

// ════════════════════════════════════════════════════════════
//  UTILS
// ════════════════════════════════════════════════════════════
function normalizePlaceUrl(href) {
  try {
    const path = new URL(href).pathname;
    const m = path.match(/(\/maps\/place\/[^/?#]+(?:\/[^/?#]+)?)/);
    return m ? m[1] : path;
  } catch { return href.split("?")[0]; }
}

function safePathname(href) {
  try { return new URL(href).pathname; }
  catch { return href; }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
