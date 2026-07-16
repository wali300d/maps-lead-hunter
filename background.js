// ============================================================
//  Maps Lead Hunter v4.0 — Background Service Worker
//  Fetches business websites to extract:
//    • Facebook URL
//    • Instagram URL
//    • Email addresses
//  Called by content.js via chrome.runtime.sendMessage
// ============================================================

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === "fetchSocials") {
    fetchSocials(msg.url, msg.options)
      .then(result => sendResponse({ ok: true, ...result }))
      .catch(err  => sendResponse({ ok: false, error: err.message }));
    return true; // keep channel open for async
  }
});

// ── Main fetcher ─────────────────────────────────────────────
async function fetchSocials(url, options = {}) {
  const result = {
    facebook:  "",
    instagram: "",
    email:     "",
  };

  if (!url) return result;

  try {
    const resp = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(10000), // 10s timeout
    });

    if (!resp.ok) return result;

    const html = await resp.text();
    const lower = html.toLowerCase();

    // ── Facebook ─────────────────────────────────────────────
    if (options.facebook) {
      result.facebook = extractFacebook(html, lower);
    }

    // ── Instagram ────────────────────────────────────────────
    if (options.instagram) {
      result.instagram = extractInstagram(html, lower);
    }

    // ── Email ─────────────────────────────────────────────────
    if (options.email) {
      result.email = extractEmail(html);
    }

  } catch (e) {
    // Network errors, CORS, timeouts — silently return empty
  }

  return result;
}

// ── Facebook extractor ───────────────────────────────────────
function extractFacebook(html, lower) {
  // Match href values pointing to facebook.com
  const patterns = [
    /href=["']?(https?:\/\/(?:www\.)?facebook\.com\/[^"'\s?&#>]+)/gi,
    /href=["']?(https?:\/\/(?:www\.)?fb\.com\/[^"'\s?&#>]+)/gi,
    /(https?:\/\/(?:www\.)?facebook\.com\/(?:pages\/)?[A-Za-z0-9._\-/%]+)/gi,
  ];

  for (const re of patterns) {
    re.lastIndex = 0;
    const m = re.exec(html);
    if (m) {
      const u = cleanSocialUrl(m[1]);
      // Filter out generic facebook.com/sharer, policies, etc.
      if (u && !isFbGeneric(u)) return u;
    }
  }
  return "";
}

function isFbGeneric(url) {
  const skip = ["sharer", "share", "plugins", "policy", "legal", "dialog", "tr?", "events", "login", "marketplace"];
  const lower = url.toLowerCase();
  return skip.some(s => lower.includes(s));
}

// ── Instagram extractor ──────────────────────────────────────
function extractInstagram(html) {
  const patterns = [
    /href=["']?(https?:\/\/(?:www\.)?instagram\.com\/[^"'\s?&#>\/]+\/?)/gi,
    /(https?:\/\/(?:www\.)?instagram\.com\/[A-Za-z0-9._\-]+\/?)/gi,
  ];

  for (const re of patterns) {
    re.lastIndex = 0;
    const m = re.exec(html);
    if (m) {
      const u = cleanSocialUrl(m[1]);
      if (u && !isIgGeneric(u)) return u;
    }
  }
  return "";
}

function isIgGeneric(url) {
  const skip = ["instagram.com/p/", "instagram.com/reel", "instagram.com/explore", "instagram.com/accounts"];
  const lower = url.toLowerCase();
  return skip.some(s => lower.includes(s));
}

// ── Email extractor ──────────────────────────────────────────
function extractEmail(html) {
  // 1. mailto: links are most reliable
  const mailtoRe = /href=["']?mailto:([^"'\s?&#>]+)/gi;
  let m;
  const candidates = [];

  while ((m = mailtoRe.exec(html)) !== null) {
    const addr = decodeURIComponent(m[1]).trim().toLowerCase();
    if (isValidEmail(addr)) candidates.push(addr);
  }

  // 2. Bare email pattern in HTML (less reliable)
  if (!candidates.length) {
    const emailRe = /\b([A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,})\b/g;
    while ((m = emailRe.exec(html)) !== null) {
      const addr = m[1].toLowerCase();
      if (isValidEmail(addr) && !isSpamEmail(addr)) {
        candidates.push(addr);
      }
    }
  }

  // Return first unique valid one
  return candidates[0] || "";
}

function isValidEmail(addr) {
  return /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/.test(addr)
      && addr.length < 80;
}

function isSpamEmail(addr) {
  const skip = ["example.com", "domain.com", "email.com", "yourdomain", "sentry.io",
                "wixpress.com", "squarespace.com", "wordpress.com", "@2x", ".png", ".jpg",
                "noreply", "no-reply", "donotreply", "do-not-reply"];
  return skip.some(s => addr.includes(s));
}

// ── Clean up a social URL ────────────────────────────────────
function cleanSocialUrl(url = "") {
  try {
    const u = new URL(url.split("?")[0].split("#")[0]);
    return u.href.replace(/\/$/, "");
  } catch {
    return url.trim();
  }
}
