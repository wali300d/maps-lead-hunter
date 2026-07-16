// ============================================================
//  Maps Lead Hunter v4.0 — Popup Script
//  All event listeners use addEventListener (CSP-safe).
//  No onclick="..." or window.* calls in HTML.
// ============================================================

// ── DOM refs ─────────────────────────────────────────────────
const dot        = document.getElementById("dot");
const statusTxt  = document.getElementById("statusTxt");
const badge      = document.getElementById("badge");
const emptyMsg   = document.getElementById("emptyMsg");
const emptyHint  = document.getElementById("emptyHint");
const tbl        = document.getElementById("tbl");
const thead      = document.getElementById("thead");
const tbody      = document.getElementById("tbody");
const warnBox    = document.getElementById("warnBox");
const socialNote = document.getElementById("socialNote");

const btnStart   = document.getElementById("btnStart");
const btnStop    = document.getElementById("btnStop");
const btnCSV     = document.getElementById("btnCSV");
const btnJSON    = document.getElementById("btnJSON");
const btnClear   = document.getElementById("btnClear");

const filterNo   = document.getElementById("filterNo");
const filterAll  = document.getElementById("filterAll");

const cardFb     = document.getElementById("cardFb");
const cardIg     = document.getElementById("cardIg");
const cardEm     = document.getElementById("cardEm");
const ckFb       = document.getElementById("ckFb");
const ckIg       = document.getElementById("ckIg");
const ckEm       = document.getElementById("ckEm");

// ── State ─────────────────────────────────────────────────────
let localResults  = [];
let currentFilter = "no-website";
let opts = { fb: false, ig: false, em: false };

// ════════════════════════════════════════════════════════════
//  FILTER TOGGLE
// ════════════════════════════════════════════════════════════
filterNo.addEventListener("click", () => applyFilter("no-website"));
filterAll.addEventListener("click", () => applyFilter("all"));

function applyFilter(f) {
  currentFilter = f;
  filterNo.className  = "tbtn" + (f === "no-website" ? " active-nw"  : "");
  filterAll.className = "tbtn" + (f === "all"        ? " active-all" : "");
  emptyHint.innerHTML = f === "no-website"
    ? 'Showing businesses <strong style="color:var(--accent)">without websites</strong>.'
    : 'Showing <strong style="color:var(--blue)">all businesses</strong>.';
}

// ════════════════════════════════════════════════════════════
//  SOCIAL / EMAIL OPTION CARDS
// ════════════════════════════════════════════════════════════
cardFb.addEventListener("click", () => toggleOpt("fb", cardFb, ckFb));
cardIg.addEventListener("click", () => toggleOpt("ig", cardIg, ckIg));
cardEm.addEventListener("click", () => toggleOpt("em", cardEm, ckEm));

function toggleOpt(key, card, ck) {
  opts[key] = !opts[key];
  if (opts[key]) {
    card.classList.add("checked");
    ck.textContent = "✓";
  } else {
    card.classList.remove("checked");
    ck.textContent = "";
  }
  // Show note whenever any option is active
  const anyOn = opts.fb || opts.ig || opts.em;
  socialNote.classList.toggle("show", anyOn);
  // Rebuild table headers to match selected options
  rebuildHeaders();
}

function rebuildHeaders() {
  const cols = ["NAME", "PHONE", "WEBSITE?"];
  if (opts.fb) cols.push("FACEBOOK");
  if (opts.ig) cols.push("INSTAGRAM");
  if (opts.em) cols.push("EMAIL");
  cols.push("MAPS LINK");
  thead.innerHTML = "<tr>" + cols.map(c => `<th>${c}</th>`).join("") + "</tr>";
  // Re-render table with new columns if results exist
  if (localResults.length) renderTable();
}

// ════════════════════════════════════════════════════════════
//  ACTION BUTTONS
// ════════════════════════════════════════════════════════════
btnStart.addEventListener("click", async () => {
  const tab = await getActiveTab();
  if (!tab) return;
  try {
    await ask(tab.id, {
      action:    "startScraping",
      filter:    currentFilter,
      facebook:  opts.fb,
      instagram: opts.ig,
      email:     opts.em,
    });
    btnStart.disabled = true;
    btnStop.disabled  = false;
    setStatus(true, "Scraping… scroll the results panel");
  } catch (err) {
    setStatus(false, "Error — try reloading the Maps tab");
  }
});

btnStop.addEventListener("click", async () => {
  const tab = await getActiveTab();
  if (tab) await ask(tab.id, { action: "stopScraping" }).catch(() => {});
  btnStart.disabled = false;
  btnStop.disabled  = true;
  setStatus(false, `Stopped · ${localResults.length} leads`);
});

btnClear.addEventListener("click", async () => {
  const tab = await getActiveTab();
  if (tab) await ask(tab.id, { action: "clearResults" }).catch(() => {});
  localResults = [];
  renderTable();
  updateBadge(0);
});

btnCSV.addEventListener("click",  exportCSV);
btnJSON.addEventListener("click", exportJSON);

// ════════════════════════════════════════════════════════════
//  LISTEN FOR PUSH UPDATES FROM CONTENT SCRIPT
// ════════════════════════════════════════════════════════════
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action !== "updateStatus") return;

  updateBadge(msg.count || 0);

  if (msg.status === "stopped") {
    setStatus(false, `Stopped · ${msg.count} leads`);
    btnStart.disabled = false;
    btnStop.disabled  = true;
  } else if (msg.status === "done") {
    setStatus(false, `✅ Done · ${msg.count} leads found`);
    btnStart.disabled = false;
    btnStop.disabled  = true;
  } else if (msg.isActive) {
    setStatus(true, `Scraping… ${msg.count} leads`);
  }

  // Pull fresh results
  getActiveTab().then(tab => {
    if (!tab) return;
    ask(tab.id, { action: "getResults" }).then(resp => {
      if (resp?.results) { localResults = resp.results; renderTable(); }
    }).catch(() => {});
  });
});

// ════════════════════════════════════════════════════════════
//  INIT
// ════════════════════════════════════════════════════════════
async function init() {
  const tab = await getActiveTab();
  const onMaps = tab?.url?.includes("google.com/maps") || tab?.url?.includes("maps.google.com");

  if (!onMaps) {
    warnBox.classList.add("show");
    btnStart.disabled = true;
    setStatus(false, "Not on Google Maps");
    return;
  }

  const hint = tab.url.includes("/maps/place/")
    ? "Single place mode — click Start"
    : "Search mode — Start then scroll the panel";

  try {
    const resp = await ask(tab.id, { action: "getResults" });
    localResults = resp?.results || [];
    renderTable();
    const active = !!resp?.isActive;
    setStatus(active, active ? `Scraping… ${localResults.length} found` : hint);
    btnStart.disabled = active;
    btnStop.disabled  = !active;
  } catch {
    setStatus(false, hint);
  }
}

// ════════════════════════════════════════════════════════════
//  RENDER TABLE
// ════════════════════════════════════════════════════════════
function renderTable() {
  tbody.innerHTML = "";

  if (!localResults.length) {
    emptyMsg.style.display = "block";
    tbl.style.display      = "none";
    return;
  }

  emptyMsg.style.display = "none";
  tbl.style.display      = "table";

  localResults.forEach(r => {
    const tr = document.createElement("tr");

    const shortLink = (r.link || "")
      .replace(/^https?:\/\/(www\.)?google\.com/, "")
      .slice(0, 18) + "…";

    const wTag = r.hasWebsite
      ? `<span class="tag-y">✓ Yes</span>`
      : `<span class="tag-n">✗ No</span>`;

    // Base columns
    let cells = `
      <td class="cn" title="${e(r.name)}">${e(r.name)}</td>
      <td class="cp">${e(r.phone)}</td>
      <td class="cw">${wTag}</td>
    `;

    // Optional social columns
    if (opts.fb) {
      cells += `<td class="csoc">${r.facebook
        ? `<a href="${e(r.facebook)}" target="_blank" title="${e(r.facebook)}">FB ↗</a>`
        : `<span class="pending">${r.socialFetched || !r.hasWebsite ? "—" : "…"}</span>`
      }</td>`;
    }
    if (opts.ig) {
      cells += `<td class="csoc">${r.instagram
        ? `<a href="${e(r.instagram)}" target="_blank" title="${e(r.instagram)}">IG ↗</a>`
        : `<span class="pending">${r.socialFetched || !r.hasWebsite ? "—" : "…"}</span>`
      }</td>`;
    }
    if (opts.em) {
      const emailShort = r.email ? r.email.slice(0, 16) + (r.email.length > 16 ? "…" : "") : "";
      cells += `<td class="cem" title="${e(r.email || "")}">${r.email
        ? e(emailShort)
        : `<span class="pending">${r.socialFetched || !r.hasWebsite ? "—" : "…"}</span>`
      }</td>`;
    }

    // Maps link column
    cells += `<td class="cl"><a href="${e(r.link)}" target="_blank" title="${e(r.link)}">${shortLink}</a></td>`;

    tr.innerHTML = cells;
    tbody.appendChild(tr);
  });

  updateBadge(localResults.length);
}

// ════════════════════════════════════════════════════════════
//  EXPORT
// ════════════════════════════════════════════════════════════
function exportCSV() {
  if (!localResults.length) { alert("No results to export yet."); return; }

  const headers = ["Name", "Phone", "Has Website", "Website URL"];
  if (opts.fb) headers.push("Facebook");
  if (opts.ig) headers.push("Instagram");
  if (opts.em) headers.push("Email");
  headers.push("Maps Link", "Rating", "Category");

  const rows = localResults.map(r => {
    const cols = [csv(r.name), csv(r.phone), r.hasWebsite ? "Yes" : "No", csv(r.websiteUrl || "")];
    if (opts.fb) cols.push(csv(r.facebook  || ""));
    if (opts.ig) cols.push(csv(r.instagram || ""));
    if (opts.em) cols.push(csv(r.email     || ""));
    cols.push(csv(r.link), csv(r.rating || ""), csv(r.category || ""));
    return cols;
  });

  dl("leads_maps.csv", [headers, ...rows].map(r => r.join(",")).join("\n"), "text/csv");
}

function exportJSON() {
  if (!localResults.length) { alert("No results to export yet."); return; }

  const clean = localResults.map(r => {
    const obj = {
      name:       r.name,
      phone:      r.phone,
      hasWebsite: r.hasWebsite,
      websiteUrl: r.websiteUrl || "",
    };
    if (opts.fb) obj.facebook  = r.facebook  || "";
    if (opts.ig) obj.instagram = r.instagram || "";
    if (opts.em) obj.email     = r.email     || "";
    obj.mapsLink = r.link;
    obj.rating   = r.rating   || "";
    obj.category = r.category || "";
    return obj;
  });

  dl("leads_maps.json", JSON.stringify(clean, null, 2), "application/json");
}

function dl(name, content, type) {
  const a    = document.createElement("a");
  a.href     = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

// ════════════════════════════════════════════════════════════
//  UTILS
// ════════════════════════════════════════════════════════════
function setStatus(active, text) {
  dot.className      = "dot" + (active ? " on" : "");
  statusTxt.textContent = text;
}

function updateBadge(n) {
  badge.textContent = `${n} lead${n !== 1 ? "s" : ""}`;
}

function csv(v = "") {
  return `"${String(v).replace(/"/g, '""')}"`;
}

function e(s = "") {
  return String(s)
    .replace(/&/g,  "&amp;")
    .replace(/</g,  "&lt;")
    .replace(/>/g,  "&gt;")
    .replace(/"/g,  "&quot;");
}

function getActiveTab() {
  return new Promise(resolve =>
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => resolve(tabs[0]))
  );
}

function ask(tabId, msg) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, msg, response => {
      if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
      else resolve(response);
    });
  });
}

// ── Boot ─────────────────────────────────────────────────────
init();
