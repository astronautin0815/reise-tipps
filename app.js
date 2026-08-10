"use strict";

/* ===========================================================
   Reise-Tipps — persönliche Reise-App
   Reine Vanilla-JS PWA, alle Daten lokal im Browser (localStorage)
   =========================================================== */

/* ---------- Konstanten ---------- */
const LS_PIN = "reisetipps_pin";
const LS_DATA = "reisetipps_destinations";
const LS_SETTINGS = "reisetipps_settings";

const CONTINENTS = [
  { key: "europa", label: "Europa", emoji: "🏰" },
  { key: "asien", label: "Asien", emoji: "🏯" },
  { key: "afrika", label: "Afrika", emoji: "🌍" },
  { key: "nordamerika", label: "Nordamerika", emoji: "🗽" },
  { key: "suedamerika", label: "Südamerika", emoji: "🌴" },
  { key: "ozeanien", label: "Ozeanien", emoji: "🏝️" },
];

const CATEGORIES = [
  { key: "restaurants", label: "Restaurants & Bars", emoji: "🍽️" },
  { key: "wellness", label: "Wellness & Spa", emoji: "💆" },
  { key: "sport", label: "Sport & Outdoor", emoji: "🏃" },
  { key: "sightseeing", label: "Sightseeing", emoji: "🗼" },
  { key: "shopping", label: "Shopping", emoji: "🛍️" },
  { key: "lebensmittel", label: "Lebensmittel", emoji: "🛒" },
  { key: "transport", label: "ÖPNV & Transport", emoji: "🚇" },
  { key: "nachtleben", label: "Nachtleben", emoji: "🌃" },
  { key: "kultur", label: "Kultur & Museen", emoji: "🎭" },
  { key: "info", label: "Nützliche Infos", emoji: "ℹ️" },
];

const STATUS = {
  besucht: { label: "Besucht", emoji: "✈️" },
  geplant: { label: "Geplant", emoji: "📋" },
  keinInteresse: { label: "Kein Interesse", emoji: "❌" },
};

/* ---------- State ---------- */
let unlocked = false;
let pinBuffer = "";
let pinError = false;
let currentHash = "";
let mapsLoadPromise = null;
let mapInstance = null;

/* ---------- Storage Helpers ---------- */
function loadPin() {
  return localStorage.getItem(LS_PIN) || "1234";
}
function savePin(pin) {
  localStorage.setItem(LS_PIN, pin);
}
function loadDestinations() {
  try {
    const raw = localStorage.getItem(LS_DATA);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}
function saveDestinations(list) {
  localStorage.setItem(LS_DATA, JSON.stringify(list));
}
function loadSettings() {
  try {
    const raw = localStorage.getItem(LS_SETTINGS);
    return raw ? JSON.parse(raw) : { mapsApiKey: "" };
  } catch (e) {
    return { mapsApiKey: "" };
  }
}
function saveSettings(s) {
  localStorage.setItem(LS_SETTINGS, JSON.stringify(s));
}

function guessContinent(lat, lng) {
  if (typeof lat !== "number" || typeof lng !== "number") return "europa";
  if (lat < -8 && lng > 105) return "ozeanien";
  if (lat < -15 && lng < -130) return "ozeanien";
  if (lat < 13 && lng < -34 && lng > -95) return "suedamerika";
  if (lng < -30 && lat >= 5) return "nordamerika";
  if (lat < 38 && lat > -38 && lng > -20 && lng < 55) return "afrika";
  if (lat > 34 && lng > -25 && lng < 45) return "europa";
  return "asien";
}

function parseGoogleTakeoutPlaces(text) {
  const data = JSON.parse(text);
  const features = Array.isArray(data) ? data : data.features;
  if (!Array.isArray(features)) throw new Error("Ungültiges Format");
  const results = [];
  for (const f of features) {
    if (!f || !f.geometry || f.geometry.type !== "Point" || !Array.isArray(f.geometry.coordinates)) continue;
    const [lng, lat] = f.geometry.coordinates;
    if (typeof lat !== "number" || typeof lng !== "number") continue;
    const props = f.properties || {};
    const loc = props.location || {};
    const name = loc.name || props.name || loc.address || "Unbenannter Ort";
    const address = loc.address || props.address || "";
    results.push({ name, address, lat, lng });
  }
  return results;
}

function uuid() {
  return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 9);
}

// --- Automatische Kategorie-Zuordnung ("Kategorie-Badge") ---

// Google Places Typen (types-Feld) -> unsere Kategorie-Keys. Reihenfolge = Priorität.
const GOOGLE_TYPE_TO_CATEGORY = [
  ["cafe", "restaurants"],
  ["coffee_shop", "restaurants"],
  ["bar", "restaurants"],
  ["restaurant", "restaurants"],
  ["meal_takeaway", "restaurants"],
  ["meal_delivery", "restaurants"],
  ["bakery", "restaurants"],
  ["spa", "wellness"],
  ["beauty_salon", "wellness"],
  ["hair_care", "wellness"],
  ["massage", "wellness"],
  ["gym", "sport"],
  ["fitness_center", "sport"],
  ["stadium", "sport"],
  ["sports_complex", "sport"],
  ["golf_course", "sport"],
  ["ski_resort", "sport"],
  ["swimming_pool", "sport"],
  ["bowling_alley", "sport"],
  ["zoo", "sightseeing"],
  ["aquarium", "sightseeing"],
  ["amusement_park", "sightseeing"],
  ["tourist_attraction", "sightseeing"],
  ["natural_feature", "sightseeing"],
  ["park", "sightseeing"],
  ["landmark", "sightseeing"],
  ["shopping_mall", "shopping"],
  ["department_store", "shopping"],
  ["clothing_store", "shopping"],
  ["jewelry_store", "shopping"],
  ["shoe_store", "shopping"],
  ["book_store", "shopping"],
  ["electronics_store", "shopping"],
  ["furniture_store", "shopping"],
  ["home_goods_store", "shopping"],
  ["gift_shop", "shopping"],
  ["supermarket", "lebensmittel"],
  ["grocery_or_supermarket", "lebensmittel"],
  ["convenience_store", "lebensmittel"],
  ["liquor_store", "lebensmittel"],
  ["market", "lebensmittel"],
  ["airport", "transport"],
  ["train_station", "transport"],
  ["subway_station", "transport"],
  ["light_rail_station", "transport"],
  ["bus_station", "transport"],
  ["transit_station", "transport"],
  ["parking", "transport"],
  ["taxi_stand", "transport"],
  ["car_rental", "transport"],
  ["ferry_terminal", "transport"],
  ["night_club", "nachtleben"],
  ["casino", "nachtleben"],
  ["museum", "kultur"],
  ["art_gallery", "kultur"],
  ["theater", "kultur"],
  ["movie_theater", "kultur"],
  ["library", "kultur"],
  ["church", "kultur"],
  ["hindu_temple", "kultur"],
  ["mosque", "kultur"],
  ["synagogue", "kultur"],
  ["place_of_worship", "kultur"],
  ["hotel", "info"],
  ["lodging", "info"],
  ["embassy", "info"],
  ["city_hall", "info"],
  ["courthouse", "info"],
  ["post_office", "info"],
  ["pharmacy", "info"],
  ["hospital", "info"],
  ["bank", "info"],
  ["atm", "info"],
  ["police", "info"],
  ["local_government_office", "info"],
  ["tourist_information_center", "info"],
];

function mapGoogleTypesToCategory(types) {
  if (!types || !types.length) return "";
  for (const [type, catKey] of GOOGLE_TYPE_TO_CATEGORY) {
    if (types.includes(type)) return catKey;
  }
  return "";
}

// Stichwort-Erkennung im Namen (funktioniert lokal, ohne API-Aufruf)
const CATEGORY_NAME_PATTERNS = [
  ["restaurants", /restaurant|bistro|trattoria|pizzeria|steakhouse|grill|caf[eé]|coffee|\bbar\b|pub\b|brauerei|b[aä]ckerei|bakery|diner|k[uü]che|osteria|ristorante|imbiss|sushi|noodle|burger/i],
  ["wellness", /\bspa\b|wellness|massage|beauty|friseur|hair\s?salon|\bsalon\b|nagelstudio|therme|sauna/i],
  ["sport", /fitness|\bgym\b|yoga|crossfit|stadion|stadium|sportplatz|\bgolf\b|\bski\b|schwimmbad|\bpool\b|bowling/i],
  ["sightseeing", /aussicht|viewpoint|denkmal|monument|wahrzeichen|landmark|sehensw[uü]rdigkeit|\btower\b|\bturm\b|bridge|br[uü]cke|\bzoo\b|aquarium|vergn[uü]gungspark|amusement\s?park|nationalpark|national\s?park/i],
  ["shopping", /\bmall\b|einkaufszentrum|shopping|boutique|\bstore\b|gesch[aä]ft|outlet/i],
  ["lebensmittel", /supermarkt|supermarket|\bedeka\b|\brewe\b|\baldi\b|\blidl\b|kaufland|\bspar\b|grocery|feinkost|metzgerei|\bmarkt\b(?!platz)/i],
  ["transport", /flughafen|airport|bahnhof|\bstation\b|u-bahn|s-bahn|subway|bus\s?stop|haltestelle|parkhaus|\bparking\b|f[aä]hre|\bferry\b/i],
  ["nachtleben", /\bclub\b|nightclub|\bdisco\b|casino|lounge/i],
  ["kultur", /museum|galerie|\bgallery\b|theater|theatre|kirche|\bchurch\b|\bdom\b|kathedrale|cathedral|tempel|temple|moschee|mosque|synagoge|synagogue|bibliothek|\blibrary\b|\bkino\b|cinema/i],
  ["info", /rathaus|city\s?hall|botschaft|embassy|krankenhaus|hospital|apotheke|pharmacy|\bbank\b|\bpost\b|polizei|\bpolice\b|touristeninformation|tourist\s?information/i],
];

function guessCategoryFromName(name) {
  if (!name) return "";
  for (const [catKey, pattern] of CATEGORY_NAME_PATTERNS) {
    if (pattern.test(name)) return catKey;
  }
  return "";
}

// --- Google "Gespeichert"-Listen (CSV) ---
function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c === "\r") {
      // skip
    } else {
      field += c;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function parseGoogleSavedListCsv(text, listName) {
  const rows = parseCsvRows(text);
  const headerIdx = rows.findIndex((r) => r[0] && r[0].trim() === "Titel");
  if (headerIdx === -1) return [];
  const results = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r[0]) continue;
    const title = (r[0] || "").trim();
    const note = (r[1] || "").trim();
    const url = (r[2] || "").trim();
    if (!title || !url.includes("/maps/place/")) continue;
    results.push({ listName, title, note });
  }
  return results;
}

// --- Google Timeline (location-history.json) ---
function parseTimelineVisits(text) {
  const data = JSON.parse(text);
  const items = Array.isArray(data) ? data : data.semanticSegments || data.timelineObjects || [];
  if (!Array.isArray(items)) throw new Error("Ungültiges Format");
  const map = new Map();
  for (const item of items) {
    const visit = item && item.visit;
    if (!visit || !visit.topCandidate) continue;
    const tc = visit.topCandidate;
    const placeId = tc.placeID || tc.placeId;
    const loc = tc.placeLocation;
    if (!placeId || !loc) continue;
    const m = String(loc).match(/(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)/);
    if (!m) continue;
    const lat = parseFloat(m[1]);
    const lng = parseFloat(m[2]);
    if (Number.isNaN(lat) || Number.isNaN(lng)) continue;
    const existing = map.get(placeId);
    if (existing) existing.count++;
    else map.set(placeId, { placeId, lat, lng, count: 1 });
  }
  return Array.from(map.values());
}

// --- Places API Auflösung (client-seitig, nutzt den in den Einstellungen gespeicherten Key) ---
function extractCountryCityFromComponents(components) {
  if (!components || !components.length) return { country: "", city: "" };
  const find = (type) => {
    const c = components.find((c) => (c.types || []).includes(type));
    return c ? c.longText || c.long_name || "" : "";
  };
  const country = find("country");
  const city =
    find("locality") ||
    find("postal_town") ||
    find("sublocality") ||
    find("administrative_area_level_2") ||
    find("administrative_area_level_1") ||
    "";
  return { country, city };
}

// Returns true if a segment looks like a postal code, or a state/province
// abbreviation combined with one (e.g. "10117", "NY 10001", "ON M5V 2A5",
// "QC H2W 2L5", "SW1A 1AA") rather than an actual city/locality name.
function looksLikePostalOrAdminSegment(seg) {
  const compact = seg.replace(/\s+/g, "");
  if (!compact) return true;
  if (/^\d+$/.test(compact)) return true; // pure numeric zip code
  if (compact.length <= 3) return true; // bare state/province abbreviation (e.g. "ON", "QC", "NY")
  if (!/\d/.test(compact)) return false; // no digits at all -> real place name, keep it
  // letters+digits combos typical of "state/province + postal code" (US, Canada, UK, ...)
  if (/^[A-Za-z]{1,3}\d[A-Za-z0-9]{2,7}$/.test(compact)) return true;
  if (/^\d[A-Za-z0-9]{2,7}$/.test(compact)) return true;
  return false;
}

// Best-effort fallback for when addressComponents aren't available: parse the
// trailing segments of a formatted address string, e.g. "Unter den Linden 1, 10117 Berlin, Deutschland"
function parseAddressForCountryCity(address) {
  if (!address) return { country: "", city: "" };
  const parts = address
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length) return { country: "", city: "" };
  const country = parts[parts.length - 1];
  let city = "";
  for (let i = parts.length - 2; i >= 0; i--) {
    let seg = parts[i].replace(/^\d{4,6}\s+/, "");
    if (looksLikePostalOrAdminSegment(seg)) continue;
    city = seg;
    break;
  }
  return { country, city };
}

async function resolvePlaceByText(query, locationBias) {
  try {
    const request = {
      textQuery: query,
      fields: ["displayName", "formattedAddress", "location", "addressComponents", "types"],
      maxResultCount: 1,
    };
    if (locationBias) request.locationBias = locationBias;
    const { places } = await google.maps.places.Place.searchByText(request);
    if (places && places[0] && places[0].location) {
      const p = places[0];
      let { country, city } = extractCountryCityFromComponents(p.addressComponents);
      if (!country && !city) {
        const fallback = parseAddressForCountryCity(p.formattedAddress);
        country = country || fallback.country;
        city = city || fallback.city;
      }
      return {
        name: p.displayName,
        address: p.formattedAddress,
        lat: p.location.lat(),
        lng: p.location.lng(),
        country,
        city,
        types: p.types || [],
        category: mapGoogleTypesToCategory(p.types),
      };
    }
  } catch (err) {
    console.error("Places Textsuche fehlgeschlagen", query, err);
  }
  return null;
}

async function resolvePlaceById(placeId) {
  try {
    const place = new google.maps.places.Place({ id: placeId });
    await place.fetchFields({ fields: ["displayName", "formattedAddress", "location", "addressComponents", "types"] });
    if (!place.location) return null;
    let { country, city } = extractCountryCityFromComponents(place.addressComponents);
    if (!country && !city) {
      const fallback = parseAddressForCountryCity(place.formattedAddress);
      country = country || fallback.country;
      city = city || fallback.city;
    }
    return {
      name: place.displayName,
      address: place.formattedAddress,
      lat: place.location.lat(),
      lng: place.location.lng(),
      country,
      city,
      types: place.types || [],
      category: mapGoogleTypesToCategory(place.types),
    };
  } catch (err) {
    console.error("Place-Details fehlgeschlagen", placeId, err);
    return null;
  }
}

function importProgressOverlay(label) {
  const el = document.createElement("div");
  el.id = "import-progress-overlay";
  el.style.cssText =
    "position:fixed;inset:0;background:rgba(10,22,40,0.96);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;padding:24px;text-align:center;gap:14px;";
  el.innerHTML = `
    <div style="font-size:2rem;">📍</div>
    <div style="font-size:1rem; font-weight:600;">${escapeHtml(label)}</div>
    <div id="import-progress-text" style="font-size:0.85rem; color:var(--text-faint, #a9b6c9);">0 / 0</div>
    <div style="width:220px; height:6px; background:rgba(255,255,255,0.15); border-radius:3px; overflow:hidden;">
      <div id="import-progress-bar" style="height:100%; width:0%; background:#e8c766; transition:width 0.2s;"></div>
    </div>
    <div style="font-size:0.72rem; color:var(--text-faint, #a9b6c9); max-width:280px;">Bitte die App währenddessen geöffnet lassen.</div>
  `;
  document.body.appendChild(el);
  return {
    update: (done, total) => {
      const t = el.querySelector("#import-progress-text");
      const b = el.querySelector("#import-progress-bar");
      if (t) t.textContent = `${done} / ${total}`;
      if (b) b.style.width = total ? `${Math.round((done / total) * 100)}%` : "0%";
    },
    close: () => el.remove(),
  };
}

function emptyCategories() {
  const obj = {};
  CATEGORIES.forEach((c) => (obj[c.key] = []));
  return obj;
}

function findDest(id) {
  return loadDestinations().find((d) => d.id === id);
}

function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function starString(rating) {
  rating = rating || 0;
  let s = "";
  for (let i = 1; i <= 5; i++) s += i <= rating ? "★" : "☆";
  return s;
}

function toast(msg) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}

/* ---------- Router ---------- */
function navigate(hash) {
  window.location.hash = hash;
}

function parseHash() {
  const h = window.location.hash.replace(/^#\/?/, "");
  return h.split("/").filter(Boolean);
}

function router() {
  const parts = parseHash();
  const app = document.getElementById("app");

  if (!unlocked) {
    renderPinScreen(app);
    return;
  }

  const view = parts[0] || "home";

  if (view === "home") renderHome(app);
  else if (view === "continent") renderContinentDetail(app, decodeURIComponent(parts[1] || ""));
  else if (view === "dest-new") renderDestinationForm(app, null, parts[1] ? decodeURIComponent(parts[1]) : null);
  else if (view === "dest-edit") renderDestinationForm(app, decodeURIComponent(parts[1]));
  else if (view === "dest") renderDestinationDetail(app, decodeURIComponent(parts[1]));
  else if (view === "category") renderCategoryList(app, decodeURIComponent(parts[1]), decodeURIComponent(parts[2]));
  else if (view === "entry-new") renderEntryForm(app, decodeURIComponent(parts[1]), decodeURIComponent(parts[2]));
  else if (view === "entry-edit") renderEntryForm(app, decodeURIComponent(parts[1]), decodeURIComponent(parts[2]), decodeURIComponent(parts[3]));
  else if (view === "map") renderMap(app);
  else if (view === "settings") renderSettings(app);
  else renderHome(app);

  window.scrollTo(0, 0);
}

window.addEventListener("hashchange", router);

/* ===========================================================
   PIN SCREEN
   =========================================================== */
function renderPinScreen(app) {
  const dots = Array.from({ length: 4 })
    .map((_, i) => {
      let cls = "pin-dot";
      if (pinError) cls += " error";
      else if (i < pinBuffer.length) cls += " filled";
      return `<div class="${cls}"></div>`;
    })
    .join("");

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"];
  const keypad = keys
    .map((k) => {
      if (k === "") return `<div></div>`;
      if (k === "back") return `<button class="pin-key action" data-key="back">⌫</button>`;
      return `<button class="pin-key" data-key="${k}">${k}</button>`;
    })
    .join("");

  app.innerHTML = `
    <div class="pin-screen">
      ${logoSvgBlock(56)}
      <div>
        <h2 style="font-size:1.3rem;">Reise-Tipps</h2>
        <p style="color:var(--text-faint); font-size:0.85rem; margin-top:6px;">PIN eingeben</p>
      </div>
      <div class="pin-dots">${dots}</div>
      <div class="pin-error-msg">${pinError ? "Falscher PIN, bitte erneut versuchen" : "&nbsp;"}</div>
      <div class="pin-keypad">${keypad}</div>
    </div>
  `;

  app.querySelectorAll(".pin-key").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.key;
      pinError = false;
      if (key === "back") {
        pinBuffer = pinBuffer.slice(0, -1);
      } else if (pinBuffer.length < 4) {
        pinBuffer += key;
      }
      if (pinBuffer.length === 4) {
        if (pinBuffer === loadPin()) {
          unlocked = true;
          pinBuffer = "";
          router();
          return;
        } else {
          pinError = true;
          setTimeout(() => {
            pinBuffer = "";
            pinError = false;
            renderPinScreen(app);
          }, 550);
        }
      }
      renderPinScreen(app);
    });
  });
}

/* ===========================================================
   LOGO
   =========================================================== */
function logoSvgBlock(size) {
  return `
  <svg width="${size}" height="${size}" viewBox="0 0 100 100" fill="none" aria-label="Reise-Tipps Logo">
    <rect x="2" y="2" width="96" height="96" rx="22" fill="#0f1f38" stroke="#d4af37" stroke-opacity="0.5" stroke-width="2"/>
    <g transform="translate(50,50) rotate(-40)">
      <path d="M0 -28 L18 21 L0 10 L-18 21 Z" fill="#e8c766" stroke="#d4af37" stroke-width="1.5" stroke-linejoin="round"/>
      <line x1="0" y1="-28" x2="0" y2="10" stroke="#0f1f38" stroke-width="2"/>
    </g>
  </svg>`;
}

function topBar(title, opts) {
  opts = opts || {};
  const back = opts.back
    ? `<button class="icon-btn" id="btn-back" aria-label="Zurück">←</button>`
    : "";
  const right = opts.right || "";
  return `
    <div class="topbar">
      ${back}
      <div class="title">${title}</div>
      ${right}
    </div>
  `;
}

function bottomNav(active) {
  const items = [
    { key: "home", emoji: "🌍", label: "Zielorte", hash: "#/home" },
    { key: "map", emoji: "📍", label: "Karte", hash: "#/map" },
    { key: "settings", emoji: "⚙️", label: "Einstellungen", hash: "#/settings" },
  ];
  return `
    <div class="bottom-nav">
      ${items
        .map(
          (it) => `
        <button class="nav-item ${active === it.key ? "active" : ""}" data-hash="${it.hash}">
          <span class="emoji">${it.emoji}</span>
          <span>${it.label}</span>
        </button>`
        )
        .join("")}
    </div>
  `;
}

function attachTopBarEvents(app) {
  const backBtn = app.querySelector("#btn-back");
  if (backBtn) backBtn.addEventListener("click", () => history.back());
}

function attachBottomNavEvents(app) {
  app.querySelectorAll(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => navigate(btn.dataset.hash));
  });
}

/* ===========================================================
   HOME — Kontinente-Übersicht + Suche
   =========================================================== */
function renderHome(app) {
  const dests = loadDestinations();
  const search = (renderHome._search || "").trim().toLowerCase();

  let searchResultsHtml = "";
  if (search) {
    const results = dests.filter(
      (d) =>
        d.name.toLowerCase().includes(search) ||
        d.iata.toLowerCase().includes(search) ||
        (d.country || "").toLowerCase().includes(search) ||
        (d.city || "").toLowerCase().includes(search)
    );
    searchResultsHtml = `
      <div class="section-label">Suchergebnisse (${results.length})</div>
      ${
        results.length
          ? results.map((d) => destCardHtml(d)).join("")
          : `<div class="empty-state"><div class="emoji">🔍</div><p>Keine Treffer</p></div>`
      }
    `;
  }

  const continentCards = CONTINENTS.map((c) => {
    const count = dests.filter((d) => d.continent === c.key).length;
    return `
      <div class="continent-card" data-continent="${c.key}">
        <div class="continent-emoji">${c.emoji}</div>
        <div class="continent-name">${c.label}</div>
        <div class="continent-count">${count} Zielort${count === 1 ? "" : "e"}</div>
      </div>
    `;
  }).join("");

  const favorites = dests.filter((d) => d.favorite);

  app.innerHTML = `
    ${topBar(`${logoSvgBlock(30)} <span class="logo-word" style="margin-left:8px;">Reise-Tipps</span>`.replace(/\n/g, ""), {})}
    <div class="screen" style="padding-bottom: 100px;">
      <div class="search-bar">
        <span>🔍</span>
        <input type="text" id="search-input" placeholder="Zielort oder IATA-Code suchen…" value="${escapeHtml(renderHome._search || "")}" />
      </div>

      ${search ? searchResultsHtml : ""}

      ${
        !search && favorites.length
          ? `<div class="section-label">★ Favoriten</div>${favorites.map((d) => destCardHtml(d)).join("")}`
          : ""
      }

      ${!search ? `<div class="section-label">Nach Kontinent</div><div class="continent-grid">${continentCards}</div>` : ""}

      ${
        !search && dests.length === 0
          ? `<div class="empty-state"><div class="emoji">🧳</div><p>Noch keine Zielorte.<br/>Tippe auf + um deinen ersten Zielort hinzuzufügen.</p></div>`
          : ""
      }
    </div>
    <button class="fab" id="fab-add" aria-label="Zielort hinzufügen">+</button>
    ${bottomNav("home")}
  `;

  attachTopBarEvents(app);
  attachBottomNavEvents(app);

  app.querySelectorAll(".continent-card").forEach((el) => {
    el.addEventListener("click", () => navigate("#/continent/" + encodeURIComponent(el.dataset.continent)));
  });
  app.querySelectorAll("[data-dest-id]").forEach((el) => {
    el.addEventListener("click", () => navigate("#/dest/" + encodeURIComponent(el.dataset.destId)));
  });
  app.querySelector("#fab-add").addEventListener("click", () => navigate("#/dest-new"));
  const searchInput = app.querySelector("#search-input");
  searchInput.addEventListener("input", (e) => {
    renderHome._search = e.target.value;
    const cursorPos = e.target.selectionStart;
    renderHome(app);
    const newInput = app.querySelector("#search-input");
    newInput.focus();
    newInput.setSelectionRange(cursorPos, cursorPos);
  });
}

function destCardHtml(d, opts) {
  opts = opts || {};
  const st = STATUS[d.status] || STATUS.geplant;
  const continentLabel = (CONTINENTS.find((c) => c.key === d.continent) || {}).label || "";
  const locationLabel = [d.city, d.country].filter(Boolean).join(", ") || continentLabel;
  const cat = d.category ? CATEGORIES.find((c) => c.key === d.category) : null;
  return `
    <div class="dest-card" data-dest-id="${d.id}">
      <div class="dest-iata">${escapeHtml(d.iata)}</div>
      <div class="dest-info">
        <div class="dest-name">${escapeHtml(d.name)}${d.favorite ? ' <span class="dest-fav">★</span>' : ""}</div>
        <div class="dest-sub">
          <span class="status-pill status-${d.status}">${st.emoji} ${st.label}</span>
          ${cat ? `<span class="category-pill">${cat.emoji} ${cat.label}</span>` : ""}
          ${d.status === "besucht" && d.rating ? `<span class="dest-stars">${starString(d.rating)}</span>` : ""}
          ${!opts.hideLocation && locationLabel ? `<span>${escapeHtml(locationLabel)}</span>` : ""}
        </div>
      </div>
    </div>
  `;
}

const UNKNOWN_COUNTRY = "Unbekanntes Land";
const UNKNOWN_CITY = "Weitere Orte";

function groupByCountryAndCity(dests) {
  const byCountry = new Map();
  for (const d of dests) {
    const country = (d.country || "").trim() || UNKNOWN_COUNTRY;
    if (!byCountry.has(country)) byCountry.set(country, new Map());
    const byCity = byCountry.get(country);
    const city = (d.city || "").trim() || UNKNOWN_CITY;
    if (!byCity.has(city)) byCity.set(city, []);
    byCity.get(city).push(d);
  }
  const sortAlpha = (a, b) => {
    if (a === UNKNOWN_COUNTRY || a === UNKNOWN_CITY) return 1;
    if (b === UNKNOWN_COUNTRY || b === UNKNOWN_CITY) return -1;
    return a.localeCompare(b, "de");
  };
  const countries = Array.from(byCountry.keys()).sort(sortAlpha);
  return countries.map((country) => {
    const byCity = byCountry.get(country);
    const cities = Array.from(byCity.keys()).sort(sortAlpha);
    return {
      country,
      cities: cities.map((city) => ({
        city,
        items: byCity.get(city).sort((a, b) => a.name.localeCompare(b.name, "de")),
      })),
    };
  });
}

function renderGroupedDestinations(grouped) {
  return grouped
    .map(
      (g) => `
      <div class="country-group">
        <div class="country-heading">${g.country === UNKNOWN_COUNTRY ? "\uD83C\uDFF3\uFE0F" : "\uD83D\uDCCD"} ${escapeHtml(g.country)}</div>
        ${g.cities
          .map(
            (c) => `
            ${c.city !== UNKNOWN_CITY ? `<div class="city-heading">${escapeHtml(c.city)}</div>` : ""}
            ${c.items.map((d) => destCardHtml(d, { hideLocation: true })).join("")}
          `
          )
          .join("")}
      </div>
    `
    )
    .join("");
}

/* ===========================================================
   CONTINENT DETAIL
   =========================================================== */
function renderContinentDetail(app, continentKey) {
  const cont = CONTINENTS.find((c) => c.key === continentKey);
  const dests = loadDestinations().filter((d) => d.continent === continentKey);
  const grouped = groupByCountryAndCity(dests);

  app.innerHTML = `
    ${topBar(`${cont ? cont.emoji + " " + cont.label : "Kontinent"}`, { back: true })}
    <div class="screen" style="padding-bottom: 100px;">
      ${
        dests.length
          ? renderGroupedDestinations(grouped)
          : `<div class="empty-state"><div class="emoji">${cont ? cont.emoji : "🌍"}</div><p>Noch keine Zielorte in ${cont ? cont.label : ""}.</p></div>`
      }
    </div>
    <button class="fab" id="fab-add" aria-label="Zielort hinzufügen">+</button>
  `;

  attachTopBarEvents(app);
  app.querySelectorAll("[data-dest-id]").forEach((el) => {
    el.addEventListener("click", () => navigate("#/dest/" + encodeURIComponent(el.dataset.destId)));
  });
  app.querySelector("#fab-add").addEventListener("click", () => navigate("#/dest-new/" + encodeURIComponent(continentKey)));
}

/* ===========================================================
   DESTINATION FORM (Neu / Bearbeiten)
   =========================================================== */
function renderDestinationForm(app, destId, presetContinent) {
  const existing = destId ? findDest(destId) : null;
  const d = existing || {
    id: uuid(),
    name: "",
    country: "",
    city: "",
    category: "",
    continent: presetContinent || "europa",
    iata: "",
    status: "geplant",
    rating: 0,
    favorite: false,
    notes: "",
    photos: [],
    lat: "",
    lng: "",
    categories: emptyCategories(),
  };

  let formState = JSON.parse(JSON.stringify(d));

  function renderForm() {
    app.innerHTML = `
      ${topBar(existing ? "Zielort bearbeiten" : "Neuer Zielort", { back: true })}
      <div class="screen" style="padding-bottom: 60px;">
        <div class="form-group">
          <label class="form-label">Stadt / Zielort *</label>
          <input class="form-input" id="f-name" placeholder="z. B. Bogotá" value="${escapeHtml(formState.name)}" />
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Land <span class="optional">(optional)</span></label>
            <input class="form-input" id="f-country" placeholder="z. B. Kolumbien" value="${escapeHtml(formState.country)}" />
          </div>
          <div class="form-group">
            <label class="form-label">Ort/Stadt <span class="optional">(optional)</span></label>
            <input class="form-input" id="f-city" placeholder="z. B. Bogotá" value="${escapeHtml(formState.city || "")}" />
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">IATA-Code *</label>
          <input class="form-input iata-input" id="f-iata" maxlength="3" placeholder="BOG" value="${escapeHtml(formState.iata)}" />
        </div>

        <div class="form-group">
          <label class="form-label">Kontinent *</label>
          <div class="chip-row" id="f-continent">
            ${CONTINENTS.map(
              (c) => `<div class="chip ${formState.continent === c.key ? "active" : ""}" data-c="${c.key}">${c.emoji} ${c.label}</div>`
            ).join("")}
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Kategorie <span class="optional">(optional)</span></label>
          <div class="chip-row" id="f-category">
            <div class="chip ${!formState.category ? "active" : ""}" data-cat="">– Keine –</div>
            ${CATEGORIES.map(
              (c) => `<div class="chip ${formState.category === c.key ? "active" : ""}" data-cat="${c.key}">${c.emoji} ${c.label}</div>`
            ).join("")}
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Status</label>
          <div class="status-picker" id="f-status">
            ${Object.keys(STATUS)
              .map(
                (k) => `<div class="status-option ${formState.status === k ? "active" : ""}" data-s="${k}">
                  <span class="emoji">${STATUS[k].emoji}</span>${STATUS[k].label}
                </div>`
              )
              .join("")}
          </div>
        </div>

        <div class="form-group" id="rating-group" style="${formState.status === "besucht" ? "" : "display:none;"}">
          <label class="form-label">Bewertung</label>
          <div class="star-picker" id="f-rating">
            ${[1, 2, 3, 4, 5]
              .map((n) => `<span class="star ${formState.rating >= n ? "active" : ""}" data-n="${n}">★</span>`)
              .join("")}
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Notizen <span class="optional">(optional)</span></label>
          <textarea class="form-textarea" id="f-notes" placeholder="Persönliche Eindrücke, Erinnerungen …">${escapeHtml(formState.notes)}</textarea>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Breitengrad <span class="optional">(für Karte, optional)</span></label>
            <input class="form-input" id="f-lat" placeholder="z. B. 4.7110" value="${escapeHtml(formState.lat)}" />
          </div>
          <div class="form-group">
            <label class="form-label">Längengrad <span class="optional">(optional)</span></label>
            <input class="form-input" id="f-lng" placeholder="z. B. -74.0721" value="${escapeHtml(formState.lng)}" />
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Fotos <span class="optional">(optional)</span></label>
          <div class="photo-strip" id="f-photos">
            ${formState.photos
              .map(
                (p, i) => `<div class="photo-wrap"><img src="${p}" /><button class="photo-remove" data-i="${i}">✕</button></div>`
              )
              .join("")}
            <label class="photo-add" for="photo-input">＋</label>
            <input type="file" id="photo-input" accept="image/*" multiple class="visually-hidden" />
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" style="display:flex; align-items:center; gap:8px; cursor:pointer;">
            <input type="checkbox" id="f-fav" ${formState.favorite ? "checked" : ""} style="width:18px;height:18px;" />
            Als Favorit markieren ★
          </label>
        </div>

        <div class="form-actions">
          ${existing ? `<button class="btn btn-danger" id="btn-delete">Löschen</button>` : ""}
          <button class="btn btn-primary" id="btn-save">Speichern</button>
        </div>
      </div>
    `;

    attachTopBarEvents(app);

    app.querySelector("#f-name").addEventListener("input", (e) => (formState.name = e.target.value));
    app.querySelector("#f-country").addEventListener("input", (e) => (formState.country = e.target.value));
    app.querySelector("#f-city").addEventListener("input", (e) => (formState.city = e.target.value));
    app.querySelector("#f-iata").addEventListener("input", (e) => {
      e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);
      formState.iata = e.target.value;
    });
    app.querySelectorAll("#f-continent .chip").forEach((el) => {
      el.addEventListener("click", () => {
        formState.continent = el.dataset.c;
        renderForm();
      });
    });
    app.querySelectorAll("#f-category .chip").forEach((el) => {
      el.addEventListener("click", () => {
        formState.category = el.dataset.cat;
        renderForm();
      });
    });
    app.querySelectorAll("#f-status .status-option").forEach((el) => {
      el.addEventListener("click", () => {
        formState.status = el.dataset.s;
        renderForm();
      });
    });
    app.querySelectorAll("#f-rating .star").forEach((el) => {
      el.addEventListener("click", () => {
        const n = Number(el.dataset.n);
        formState.rating = formState.rating === n ? n - 1 : n;
        renderForm();
      });
    });
    app.querySelector("#f-notes").addEventListener("input", (e) => (formState.notes = e.target.value));
    app.querySelector("#f-lat").addEventListener("input", (e) => (formState.lat = e.target.value));
    app.querySelector("#f-lng").addEventListener("input", (e) => (formState.lng = e.target.value));
    app.querySelector("#f-fav").addEventListener("change", (e) => (formState.favorite = e.target.checked));

    app.querySelector("#photo-input").addEventListener("change", async (e) => {
      const files = Array.from(e.target.files || []);
      for (const file of files) {
        try {
          const compressed = await compressImage(file);
          formState.photos.push(compressed);
        } catch (err) {
          console.error(err);
        }
      }
      renderForm();
    });
    app.querySelectorAll(".photo-remove").forEach((btn) => {
      btn.addEventListener("click", () => {
        formState.photos.splice(Number(btn.dataset.i), 1);
        renderForm();
      });
    });

    if (existing) {
      app.querySelector("#btn-delete").addEventListener("click", () => {
        confirmModal(
          "Zielort löschen?",
          `„${d.name}" und alle zugehörigen Einträge werden dauerhaft gelöscht.`,
          () => {
            const list = loadDestinations().filter((x) => x.id !== d.id);
            saveDestinations(list);
            toast("Zielort gelöscht");
            navigate("#/home");
          }
        );
      });
    }

    app.querySelector("#btn-save").addEventListener("click", () => {
      if (!formState.name.trim()) {
        toast("Bitte einen Namen eingeben");
        return;
      }
      if (!/^[A-Z]{3}$/.test(formState.iata)) {
        toast("Bitte gültigen 3-Buchstaben IATA-Code eingeben");
        return;
      }
      const list = loadDestinations();
      const idx = list.findIndex((x) => x.id === formState.id);
      if (idx >= 0) list[idx] = formState;
      else list.push(formState);
      saveDestinations(list);
      toast("Gespeichert");
      navigate("#/dest/" + encodeURIComponent(formState.id));
    });
  }

  renderForm();
}

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const maxW = 1024;
        let { width, height } = img;
        if (width > maxW) {
          height = Math.round((height * maxW) / width);
          width = maxW;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.72));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/* ===========================================================
   DESTINATION DETAIL
   =========================================================== */
function renderDestinationDetail(app, destId) {
  const d = findDest(destId);
  if (!d) {
    navigate("#/home");
    return;
  }
  const st = STATUS[d.status] || STATUS.geplant;
  const continentLabel = (CONTINENTS.find((c) => c.key === d.continent) || {}).label || "";

  const categoryCards = CATEGORIES.map((c) => {
    const count = (d.categories[c.key] || []).length;
    return `
      <div class="category-card" data-cat="${c.key}">
        ${count ? `<div class="count">${count}</div>` : ""}
        <div class="emoji">${c.emoji}</div>
        <div class="name">${c.label}</div>
      </div>
    `;
  }).join("");

  app.innerHTML = `
    ${topBar("Zielort", {
      back: true,
      right: `<button class="icon-btn" id="btn-edit" aria-label="Bearbeiten">✎</button>`,
    })}
    <div class="dest-hero">
      <div class="dest-iata-big">${escapeHtml(d.iata)}</div>
      <div class="dest-fullname">${escapeHtml(d.name)}${[d.city, d.country].filter(Boolean).length ? ", " + escapeHtml([d.city, d.country].filter(Boolean).join(", ")) : ""}</div>
      <div class="dest-meta-row">
        <span class="status-pill status-${d.status}">${st.emoji} ${st.label}</span>
        ${d.status === "besucht" && d.rating ? `<span class="dest-stars">${starString(d.rating)}</span>` : ""}
        ${d.favorite ? `<span class="dest-fav">★ Favorit</span>` : ""}
        <span style="color:var(--text-faint); font-size:0.8rem;">${escapeHtml(continentLabel)}</span>
      </div>
    </div>

    ${
      d.photos && d.photos.length
        ? `<div class="photo-strip" style="margin-top:16px;">${d.photos.map((p) => `<img src="${p}" />`).join("")}</div>`
        : ""
    }

    ${
      d.notes
        ? `<div class="notes-box"><span class="notes-label">Notizen</span>${escapeHtml(d.notes)}</div>`
        : ""
    }

    <div class="section-label" style="padding: 0 var(--space-4);">Kategorien</div>
    <div class="category-grid">${categoryCards}</div>
  `;

  attachTopBarEvents(app);
  app.querySelector("#btn-edit").addEventListener("click", () => navigate("#/dest-edit/" + encodeURIComponent(d.id)));
  app.querySelectorAll(".category-card").forEach((el) => {
    el.addEventListener("click", () => navigate("#/category/" + encodeURIComponent(d.id) + "/" + encodeURIComponent(el.dataset.cat)));
  });
}

/* ===========================================================
   CATEGORY LIST (Einträge)
   =========================================================== */
function renderCategoryList(app, destId, catKey) {
  const d = findDest(destId);
  if (!d) {
    navigate("#/home");
    return;
  }
  const cat = CATEGORIES.find((c) => c.key === catKey);
  const entries = (d.categories[catKey] || []).slice().sort((a, b) => (b.highlight ? 1 : 0) - (a.highlight ? 1 : 0));

  app.innerHTML = `
    ${topBar(`${cat.emoji} ${cat.label}`, { back: true })}
    <div class="screen" style="padding-bottom:100px;">
      <div style="color:var(--text-faint); font-size:0.82rem; margin-bottom:16px;">${escapeHtml(d.iata)} · ${escapeHtml(d.name)}</div>
      ${
        entries.length
          ? entries.map((e) => entryCardHtml(e)).join("")
          : `<div class="empty-state"><div class="emoji">${cat.emoji}</div><p>Noch keine Einträge in dieser Kategorie.</p></div>`
      }
    </div>
    <button class="fab" id="fab-add">+</button>
  `;

  attachTopBarEvents(app);
  app.querySelectorAll("[data-entry-id]").forEach((el) => {
    el.addEventListener("click", (ev) => {
      if (ev.target.closest(".entry-actions")) return;
      navigate("#/entry-edit/" + encodeURIComponent(destId) + "/" + encodeURIComponent(catKey) + "/" + encodeURIComponent(el.dataset.entryId));
    });
  });
  app.querySelectorAll("[data-delete-entry]").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const entryId = btn.dataset.deleteEntry;
      confirmModal("Eintrag löschen?", "Dieser Eintrag wird dauerhaft entfernt.", () => {
        const list = loadDestinations();
        const dest = list.find((x) => x.id === destId);
        dest.categories[catKey] = dest.categories[catKey].filter((e) => e.id !== entryId);
        saveDestinations(list);
        renderCategoryList(app, destId, catKey);
        toast("Eintrag gelöscht");
      });
    });
  });
  app.querySelector("#fab-add").addEventListener("click", () => navigate("#/entry-new/" + encodeURIComponent(destId) + "/" + encodeURIComponent(catKey)));
}

function entryCardHtml(e) {
  return `
    <div class="entry-card" data-entry-id="${e.id}">
      <div class="entry-title-row">
        <div class="entry-title">${escapeHtml(e.title)}</div>
        ${e.highlight ? `<span class="entry-highlight">★</span>` : ""}
      </div>
      ${e.description ? `<div class="entry-desc">${escapeHtml(e.description)}</div>` : ""}
      <div class="entry-meta">
        ${e.address ? `<div class="row">📍 ${escapeHtml(e.address)}</div>` : ""}
        ${e.phone ? `<div class="row">📞 ${escapeHtml(e.phone)}</div>` : ""}
        ${e.website ? `<div class="row">🔗 <a href="${escapeHtml(e.website)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${escapeHtml(e.website)}</a></div>` : ""}
        ${e.cardPayment ? `<div class="row">💳 Kartenzahlung: ${escapeHtml(cardPaymentLabel(e.cardPayment))}</div>` : ""}
        ${e.coordinates ? `<div class="row">🧭 ${escapeHtml(e.coordinates)}</div>` : ""}
        ${e.info ? `<div class="row">💬 ${escapeHtml(e.info)}</div>` : ""}
      </div>
      <div class="entry-actions">
        <button class="btn btn-ghost btn-sm" data-delete-entry="${e.id}">Löschen</button>
      </div>
    </div>
  `;
}

function cardPaymentLabel(v) {
  return { ja: "Ja", nein: "Nein", unbekannt: "Unbekannt" }[v] || v;
}

/* ===========================================================
   ENTRY FORM (Neu / Bearbeiten)
   =========================================================== */
function renderEntryForm(app, destId, catKey, entryId) {
  const list = loadDestinations();
  const d = list.find((x) => x.id === destId);
  if (!d) {
    navigate("#/home");
    return;
  }
  const cat = CATEGORIES.find((c) => c.key === catKey);
  const existing = entryId ? (d.categories[catKey] || []).find((e) => e.id === entryId) : null;

  const e = existing
    ? JSON.parse(JSON.stringify(existing))
    : { id: uuid(), title: "", description: "", address: "", cardPayment: "", phone: "", coordinates: "", website: "", info: "", highlight: false };

  app.innerHTML = `
    ${topBar(existing ? "Eintrag bearbeiten" : `Neu · ${cat.label}`, { back: true })}
    <div class="screen" style="padding-bottom:60px;">
      <div class="form-group">
        <label class="form-label">Titel *</label>
        <input class="form-input" id="e-title" placeholder="z. B. Andrés Carne de Res" value="${escapeHtml(e.title)}" />
      </div>
      <div class="form-group">
        <label class="form-label">Beschreibung *</label>
        <textarea class="form-textarea" id="e-desc" placeholder="Kurze Beschreibung, Empfehlung, Eindruck …">${escapeHtml(e.description)}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label">Adresse <span class="optional">(optional)</span></label>
        <input class="form-input" id="e-address" placeholder="Straße, Stadtteil …" value="${escapeHtml(e.address)}" />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Kartenzahlung <span class="optional">(optional)</span></label>
          <select class="form-select" id="e-card">
            <option value="" ${!e.cardPayment ? "selected" : ""}>—</option>
            <option value="ja" ${e.cardPayment === "ja" ? "selected" : ""}>Ja</option>
            <option value="nein" ${e.cardPayment === "nein" ? "selected" : ""}>Nein</option>
            <option value="unbekannt" ${e.cardPayment === "unbekannt" ? "selected" : ""}>Unbekannt</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Telefon <span class="optional">(optional)</span></label>
          <input class="form-input" id="e-phone" placeholder="+57 …" value="${escapeHtml(e.phone)}" />
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Koordinaten <span class="optional">(optional)</span></label>
        <input class="form-input" id="e-coords" placeholder="z. B. 4.6097, -74.0817" value="${escapeHtml(e.coordinates)}" />
      </div>
      <div class="form-group">
        <label class="form-label">Website <span class="optional">(optional)</span></label>
        <input class="form-input" id="e-website" placeholder="https://…" value="${escapeHtml(e.website)}" />
      </div>
      <div class="form-group">
        <label class="form-label">Info <span class="optional">(optional)</span></label>
        <textarea class="form-textarea" id="e-info" placeholder="Öffnungszeiten, Tipps, Sonstiges …">${escapeHtml(e.info)}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label" style="display:flex; align-items:center; gap:8px; cursor:pointer;">
          <input type="checkbox" id="e-highlight" ${e.highlight ? "checked" : ""} style="width:18px;height:18px;" />
          Als Highlight markieren ★
        </label>
      </div>
      <div class="form-actions">
        ${existing ? `<button class="btn btn-danger" id="btn-delete">Löschen</button>` : ""}
        <button class="btn btn-primary" id="btn-save">Speichern</button>
      </div>
    </div>
  `;

  attachTopBarEvents(app);

  app.querySelector("#btn-save").addEventListener("click", () => {
    const title = app.querySelector("#e-title").value.trim();
    const description = app.querySelector("#e-desc").value.trim();
    if (!title || !description) {
      toast("Titel und Beschreibung sind erforderlich");
      return;
    }
    const newEntry = {
      id: e.id,
      title,
      description,
      address: app.querySelector("#e-address").value.trim(),
      cardPayment: app.querySelector("#e-card").value,
      phone: app.querySelector("#e-phone").value.trim(),
      coordinates: app.querySelector("#e-coords").value.trim(),
      website: app.querySelector("#e-website").value.trim(),
      info: app.querySelector("#e-info").value.trim(),
      highlight: app.querySelector("#e-highlight").checked,
    };
    const freshList = loadDestinations();
    const freshDest = freshList.find((x) => x.id === destId);
    if (!freshDest.categories[catKey]) freshDest.categories[catKey] = [];
    const idx = freshDest.categories[catKey].findIndex((x) => x.id === newEntry.id);
    if (idx >= 0) freshDest.categories[catKey][idx] = newEntry;
    else freshDest.categories[catKey].push(newEntry);
    saveDestinations(freshList);
    toast("Gespeichert");
    navigate("#/category/" + encodeURIComponent(destId) + "/" + encodeURIComponent(catKey));
  });

  if (existing) {
    app.querySelector("#btn-delete").addEventListener("click", () => {
      confirmModal("Eintrag löschen?", "Dieser Eintrag wird dauerhaft entfernt.", () => {
        const freshList = loadDestinations();
        const freshDest = freshList.find((x) => x.id === destId);
        freshDest.categories[catKey] = freshDest.categories[catKey].filter((x) => x.id !== entryId);
        saveDestinations(freshList);
        toast("Eintrag gelöscht");
        navigate("#/category/" + encodeURIComponent(destId) + "/" + encodeURIComponent(catKey));
      });
    });
  }
}

/* ===========================================================
   MAP VIEW — Google Maps mit allen Pins
   =========================================================== */
function geocodeCandidates(d) {
  if (d.lat && d.lng && !isNaN(parseFloat(d.lat)) && !isNaN(parseFloat(d.lng))) {
    return { lat: parseFloat(d.lat), lng: parseFloat(d.lng) };
  }
  // fallback: check if any entry has coordinates "lat,lng"
  for (const catKey of Object.keys(d.categories || {})) {
    for (const entry of d.categories[catKey] || []) {
      if (entry.coordinates) {
        const m = entry.coordinates.match(/(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)/);
        if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
      }
    }
  }
  return null;
}

function renderMap(app) {
  const settings = loadSettings();
  const dests = loadDestinations();

  if (!settings.mapsApiKey) {
    app.innerHTML = `
      ${topBar("Karte", {})}
      <div class="screen">
        <div class="map-key-missing">
          <div class="emoji">🗺️</div>
          <h3 style="margin-bottom:8px;">Kein Google Maps API-Key hinterlegt</h3>
          <p style="color:var(--text-faint); font-size:0.88rem; margin-bottom:20px;">
            Hinterlege deinen eigenen Google Maps API-Key in den Einstellungen, um alle deine Zielort-Pins auf einer Karte zu sehen.
          </p>
          <button class="btn btn-primary" id="btn-to-settings">Zu den Einstellungen</button>
        </div>
      </div>
      ${bottomNav("map")}
    `;
    attachBottomNavEvents(app);
    app.querySelector("#btn-to-settings").addEventListener("click", () => navigate("#/settings"));
    return;
  }

  app.innerHTML = `
    ${topBar("Karte · Alle Pins", {})}
    <div class="screen" style="padding: var(--space-3) var(--space-4) 60px;">
      <div id="map-canvas"></div>
      <p style="color:var(--text-faint); font-size:0.72rem; margin-top:6px; text-align:center;">
        ${dests.filter((d) => geocodeCandidates(d)).length} von ${dests.length} Zielorten mit Koordinaten angezeigt.
      </p>
    </div>
    ${bottomNav("map")}
  `;
  attachBottomNavEvents(app);

  loadGoogleMaps(settings.mapsApiKey)
    .then(() => initMap(dests))
    .catch((err) => {
      console.error(err);
      const canvas = document.getElementById("map-canvas");
      if (canvas) {
        canvas.outerHTML = `<div class="map-key-missing"><div class="emoji">⚠️</div><p>Karte konnte nicht geladen werden. Bitte prüfe deinen API-Key und ob die „Maps JavaScript API" in der Google Cloud Console aktiviert ist.</p></div>`;
      }
    });
}

function loadGoogleMaps(apiKey) {
  if (window.google && window.google.maps && window.google.maps.places) return Promise.resolve();
  if (mapsLoadPromise) return mapsLoadPromise;
  mapsLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&v=weekly`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      mapsLoadPromise = null;
      reject(new Error("Google Maps script failed to load"));
    };
    document.head.appendChild(script);
  });
  return mapsLoadPromise;
}

let clustererLoadPromise = null;
function loadMarkerClusterer() {
  if (window.markerClusterer && window.markerClusterer.MarkerClusterer) return Promise.resolve();
  if (clustererLoadPromise) return clustererLoadPromise;
  clustererLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://unpkg.com/@googlemaps/markerclusterer/dist/index.min.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      clustererLoadPromise = null;
      reject(new Error("MarkerClusterer failed to load"));
    };
    document.head.appendChild(script);
  });
  return clustererLoadPromise;
}

function cssEscape(str) {
  return String(str).replace(/["\\]/g, "\\$&");
}

function initMap(dests) {
  const canvas = document.getElementById("map-canvas");
  if (!canvas || !window.google) return;

  const pins = dests
    .map((d) => ({ d, pos: geocodeCandidates(d) }))
    .filter((x) => x.pos);

  const center = pins.length ? pins[0].pos : { lat: 20, lng: 0 };

  mapInstance = new google.maps.Map(canvas, {
    center,
    zoom: pins.length ? 3 : 2,
    mapId: "REISE_TIPPS_MAP",
    styles: darkMapStyle(),
    streetViewControl: false,
    mapTypeControl: false,
    clickableIcons: false,
  });

  const bounds = new google.maps.LatLngBounds();
  const markers = [];
  let openInfo = null;

  pins.forEach(({ d, pos }) => {
    const st = STATUS[d.status] || STATUS.geplant;
    const hasCode = d.iata && d.iata !== "---";
    const marker = new google.maps.Marker({
      position: pos,
      title: `${hasCode ? d.iata + " · " : ""}${d.name}`,
      label: hasCode
        ? { text: d.iata, color: "#0a1628", fontWeight: "700", fontSize: "9px" }
        : null,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        fillColor: "#d4af37",
        fillOpacity: 1,
        strokeColor: "#0a1628",
        strokeWeight: 1.5,
        scale: hasCode ? 10 : 6,
      },
    });
    const info = new google.maps.InfoWindow({
      content: `<div class="map-infowindow" style="color:#0a1628; font-family: sans-serif; min-width:160px;">
        <strong>${hasCode ? escapeHtml(d.iata) + " · " : ""}${escapeHtml(d.name)}</strong><br/>
        <span style="font-size:0.85em;">${st.emoji} ${st.label}${d.status === "besucht" && d.rating ? " · " + starString(d.rating) : ""}</span>
        <div style="margin-top:8px;">
          <button type="button" data-dest-id="${escapeHtml(d.id)}" class="map-edit-btn" style="background:#0a1628; color:#d4af37; border:none; border-radius:8px; padding:6px 12px; font-size:0.82rem; font-weight:600; cursor:pointer; width:100%;">✏️ Bearbeiten</button>
        </div>
      </div>`,
    });
    google.maps.event.addListener(info, "domready", () => {
      const btn = document.querySelector(`.map-edit-btn[data-dest-id="${cssEscape(d.id)}"]`);
      if (btn) {
        btn.addEventListener("click", () => {
          navigate("#/dest-edit/" + encodeURIComponent(d.id));
        });
      }
    });
    marker.addListener("click", () => {
      if (openInfo) openInfo.close();
      info.open(mapInstance, marker);
      openInfo = info;
    });
    markers.push(marker);
    bounds.extend(pos);
  });

  if (pins.length > 1) mapInstance.fitBounds(bounds);

  // Cluster markers so hundreds of pins don't overlap into an unreadable blob
  // and so zooming stays fast (only visible clusters/markers are redrawn).
  loadMarkerClusterer()
    .then(() => {
      new window.markerClusterer.MarkerClusterer({
        map: mapInstance,
        markers,
        renderer: {
          render: ({ count, position }) =>
            new google.maps.Marker({
              position,
              label: { text: String(count), color: "#0a1628", fontWeight: "700", fontSize: "12px" },
              icon: {
                path: google.maps.SymbolPath.CIRCLE,
                fillColor: "#d4af37",
                fillOpacity: 0.95,
                strokeColor: "#0a1628",
                strokeWeight: 2,
                scale: Math.min(14 + Math.log(count) * 4, 28),
              },
              zIndex: 1000 + count,
            }),
        },
      });
    })
    .catch((err) => {
      // Clustering is an enhancement only — fall back to plain markers already on the map.
      console.error(err);
      markers.forEach((m) => m.setMap(mapInstance));
    });
}

function darkMapStyle() {
  return [
    { elementType: "geometry", stylers: [{ color: "#0f1f38" }] },
    { elementType: "labels.text.stroke", stylers: [{ color: "#0a1628" }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#a9b8cc" }] },
    { featureType: "water", elementType: "geometry", stylers: [{ color: "#08131f" }] },
    { featureType: "road", elementType: "geometry", stylers: [{ color: "#16283f" }] },
    { featureType: "administrative.country", elementType: "geometry.stroke", stylers: [{ color: "#d4af37" }, { weight: 0.5 }] },
    { featureType: "poi", stylers: [{ visibility: "off" }] },
  ];
}

/* ===========================================================
   SETTINGS
   =========================================================== */
function renderSettings(app) {
  const settings = loadSettings();
  const dests = loadDestinations();

  app.innerHTML = `
    ${topBar("Einstellungen", {})}
    <div class="screen" style="padding-bottom: 90px;">

      <div class="settings-section">
        <h3>🔑 Google Maps API-Key</h3>
        <p style="color:var(--text-faint); font-size:0.8rem; margin-bottom:12px;">
          Wird ausschließlich lokal auf deinem Gerät gespeichert, niemals übertragen. Aktiviere in der
          <a href="https://console.cloud.google.com/google/maps-apis" target="_blank" rel="noopener">Google Cloud Console</a>
          die „Maps JavaScript API" und beschränke den Key auf deine Domain.
        </p>
        <input class="form-input" id="s-mapkey" placeholder="AIza…" value="${escapeHtml(settings.mapsApiKey || "")}" style="margin-bottom:10px;" />
        <button class="btn btn-primary btn-block" id="btn-save-key">Speichern</button>
      </div>

      <div class="settings-section">
        <h3>🔒 PIN ändern</h3>
        <div class="form-group">
          <input class="form-input" id="s-pin-old" type="password" inputmode="numeric" maxlength="4" placeholder="Aktueller PIN" />
        </div>
        <div class="form-group">
          <input class="form-input" id="s-pin-new" type="password" inputmode="numeric" maxlength="4" placeholder="Neuer PIN (4-stellig)" />
        </div>
        <button class="btn btn-secondary btn-block" id="btn-change-pin">PIN ändern</button>
      </div>

      <div class="settings-section">
        <h3>📍 Aus Google Maps importieren</h3>
        <p style="color:var(--text-faint); font-size:0.8rem; margin-bottom:12px;">
          Lade deine gespeicherten Orte über <a href="https://takeout.google.com/settings/takeout/custom/maps" target="_blank" rel="noopener">Google Takeout</a> herunter (nur „Meine Orte" bzw. „Gespeichert" auswählen), entpacke die ZIP-Datei und wähle hier eine der JSON-Dateien aus dem Ordner „Saved Places" bzw. „Gespeicherte Orte" aus. Kontinent wird automatisch geschätzt, IATA-Code und Details kannst du danach ergänzen.
        </p>
        <label class="btn btn-secondary btn-block" style="text-align:center; cursor:pointer;">
          Datei auswählen
          <input type="file" id="gmaps-import-input" accept="application/json,.json,.geojson" class="visually-hidden" />
        </label>
      </div>

      <div class="settings-section">
        <h3>📋 Google-Listen importieren (CSV)</h3>
        <p style="color:var(--text-faint); font-size:0.8rem; margin-bottom:12px;">
          Exportiere deine „Gespeichert"-Listen über <a href="https://takeout.google.com/settings/takeout/custom/maps" target="_blank" rel="noopener">Google Takeout</a> (Kategorie „Gespeichert" statt „Maps" auswählen), entpacke die ZIP-Datei und wähle hier alle CSV-Dateien aus dem Ordner „Gespeichert" gleichzeitig aus. Jeder Ort wird über die Google Places API einzeln anhand seines Namens gesucht – das dauert bei vielen Orten mehrere Minuten und kann geringe Kosten über den Google-Cloud-Freibetrag hinaus verursachen. Dafür muss in deinem Google-Cloud-Projekt zusätzlich die „Places API (New)" aktiviert sein.
        </p>
        <label class="btn btn-secondary btn-block" style="text-align:center; cursor:pointer;">
          CSV-Dateien auswählen
          <input type="file" id="gmaps-list-import-input" accept=".csv,text/csv" multiple class="visually-hidden" />
        </label>
      </div>

      <div class="settings-section">
        <h3>🕒 Google Timeline importieren</h3>
        <p style="color:var(--text-faint); font-size:0.8rem; margin-bottom:12px;">
          Exportiere deinen Zeitachsenverlauf direkt auf dem Handy: Google Maps App → Profilbild → Einstellungen → „Personenbezogene Inhalte" → „Standortverlauf exportieren" → Datei „location-history.json" wählen. Besuchte Orte werden erkannt, doppelte Besuche zusammengefasst und über die Places API benannt.
        </p>
        <label class="btn btn-secondary btn-block" style="text-align:center; cursor:pointer;">
          Datei auswählen
          <input type="file" id="gmaps-timeline-import-input" accept="application/json,.json" class="visually-hidden" />
        </label>
      </div>

      <div class="settings-section">
        <h3>🗂️ Land &amp; Stadt ergänzen</h3>
        <p style="color:var(--text-faint); font-size:0.8rem; margin-bottom:12px;">
          Füllt Land und Stadt für bereits importierte Zielorte automatisch aus der gespeicherten Adresse auf und korrigiert dabei auch fälschlich als Stadt erkannte Postleitzahlen (z.\u00a0B. "ON M5V 2A5" statt "Toronto") – keine Internetverbindung nötig.
        </p>
        <button class="btn btn-secondary btn-block" id="btn-backfill-country">Land &amp; Stadt automatisch ergänzen</button>
      </div>

      <div class="settings-section">
        <h3>🏷️ Kategorien zuordnen</h3>
        <p style="color:var(--text-faint); font-size:0.8rem; margin-bottom:12px;">
          Ordnet jedem Zielort automatisch eine Kategorie zu (🍽️ Restaurants, 🏛️ Sightseeing, 🛍️ Shopping, …) – zuerst per Namenserkennung, danach optional per Google-Places-Abfrage für den Rest. ${dests.filter((d) => !((d.category || "").trim())).length} von ${dests.length} Zielorten haben noch keine Kategorie.
        </p>
        <button class="btn btn-secondary btn-block" id="btn-assign-categories">Kategorien automatisch zuordnen</button>
      </div>

      <div class="settings-section">
        <h3>💾 Daten-Backup</h3>
        <p style="color:var(--text-faint); font-size:0.8rem; margin-bottom:12px;">
          ${dests.length} Zielort${dests.length === 1 ? "" : "e"} gespeichert. Erstelle regelmäßig ein Backup, da die Daten nur lokal im Browser liegen.
        </p>
        <div style="display:flex; gap:10px;">
          <button class="btn btn-secondary" style="flex:1;" id="btn-export">Exportieren</button>
          <label class="btn btn-secondary" style="flex:1; text-align:center; cursor:pointer;">
            Importieren
            <input type="file" id="import-input" accept="application/json" class="visually-hidden" />
          </label>
        </div>
      </div>

      <div class="settings-section">
        <h3>⚠️ Gefahrenzone</h3>
        <button class="btn btn-danger btn-block" id="btn-clear-all">Alle Daten löschen</button>
      </div>

      <p style="text-align:center; color:var(--text-faint); font-size:0.75rem; margin-top:20px;">Reise-Tipps · alle Daten lokal auf deinem Gerät</p>
    </div>
    ${bottomNav("settings")}
  `;

  attachBottomNavEvents(app);

  app.querySelector("#btn-save-key").addEventListener("click", () => {
    const key = app.querySelector("#s-mapkey").value.trim();
    saveSettings({ ...settings, mapsApiKey: key });
    toast("API-Key gespeichert");
  });

  app.querySelector("#btn-backfill-country").addEventListener("click", () => {
    const needsWork = dests.filter(
      (d) => !((d.country || "").trim()) || !((d.city || "").trim()) || looksLikePostalOrAdminSegment(d.city || "")
    );
    if (!needsWork.length) {
      toast("Alle Zielorte haben bereits Land & Stadt");
      return;
    }
    confirmModal(
      "Land & Stadt ergänzen?",
      `Für ${needsWork.length} Zielort${needsWork.length === 1 ? "" : "e"} wird Land und Stadt aus der gespeicherten Adresse ermittelt bzw. korrigiert (z.\u00a0B. falsch erkannte Postleitzahlen statt Stadtnamen). Das passiert sofort und lokal, ohne Internetverbindung.`,
      () => {
        let updated = 0;
        const all = loadDestinations().map((d) => {
          const cityLooksWrong = looksLikePostalOrAdminSegment(d.city || "");
          if ((d.country || "").trim() && (d.city || "").trim() && !cityLooksWrong) return d;
          const addressText = (d.notes || "").split(" \u00b7 ").pop() || "";
          const { country, city } = parseAddressForCountryCity(addressText);
          if (!country && !city) return d;
          const newCountry = country || d.country || "";
          const newCity = cityLooksWrong ? city || "" : city || d.city || "";
          if (newCountry === (d.country || "") && newCity === (d.city || "")) return d;
          updated++;
          return { ...d, country: newCountry, city: newCity };
        });
        saveDestinations(all);
        toast(`${updated} Zielort${updated === 1 ? "" : "e"} aktualisiert`);
        renderSettings(app);
      }
    );
  });

  app.querySelector("#btn-assign-categories").addEventListener("click", () => {
    const missing = dests.filter((d) => !((d.category || "").trim()));
    if (!missing.length) {
      toast("Alle Zielorte haben bereits eine Kategorie");
      return;
    }
    confirmModal(
      "Kategorien zuordnen?",
      `Für ${missing.length} Zielort${missing.length === 1 ? "" : "e"} wird zuerst per Namenserkennung (sofort, lokal) eine Kategorie geraten. Für Orte, bei denen das nicht klappt, kannst du danach optional eine genauere Abfrage bei Google Places starten (kann ein paar Minuten dauern).`,
      async () => {
        let all = loadDestinations();
        let heuristicCount = 0;
        all = all.map((d) => {
          if ((d.category || "").trim()) return d;
          const guess = guessCategoryFromName(d.name);
          if (!guess) return d;
          heuristicCount++;
          return { ...d, category: guess };
        });
        saveDestinations(all);
        toast(`${heuristicCount} Zielort${heuristicCount === 1 ? "" : "e"} per Namenserkennung zugeordnet`);
        renderSettings(app);

        const currentSettings = loadSettings();
        const stillMissing = all.filter((d) => !((d.category || "").trim()) && (d.lat || d.lng));
        if (!stillMissing.length || !currentSettings.mapsApiKey) {
          return;
        }
        confirmModal(
          "Bei Google nachfragen?",
          `${stillMissing.length} Zielort${stillMissing.length === 1 ? "" : "e"} konnten nicht automatisch erkannt werden. Jetzt einzeln bei der Google Places API nachfragen? Das kann mehrere Minuten dauern und ggf. geringe Kosten verursachen.`,
          async () => {
            const overlay = importProgressOverlay("Kategorien werden bei Google ermittelt …");
            try {
              await loadGoogleMaps(currentSettings.mapsApiKey);
            } catch (err) {
              overlay.close();
              toast("Google Maps konnte nicht geladen werden – bitte API-Key prüfen");
              return;
            }
            let apiCount = 0;
            let done = 0;
            const latest = loadDestinations();
            for (const d of stillMissing) {
              overlay.update(done, stillMissing.length);
              const query = [d.name, d.city, d.country].filter(Boolean).join(", ");
              const resolved = await resolvePlaceByText(query);
              if (resolved && resolved.category) {
                const idx = latest.findIndex((x) => x.id === d.id);
                if (idx >= 0) {
                  latest[idx] = { ...latest[idx], category: resolved.category };
                  apiCount++;
                }
              }
              done++;
            }
            saveDestinations(latest);
            overlay.close();
            toast(`${apiCount} weitere Zielort${apiCount === 1 ? "" : "e"} über Google zugeordnet`);
            renderSettings(app);
          }
        );
      }
    );
  });

  app.querySelector("#btn-change-pin").addEventListener("click", () => {
    const oldPin = app.querySelector("#s-pin-old").value;
    const newPin = app.querySelector("#s-pin-new").value;
    if (oldPin !== loadPin()) {
      toast("Aktueller PIN ist falsch");
      return;
    }
    if (!/^\d{4}$/.test(newPin)) {
      toast("Neuer PIN muss 4-stellig sein");
      return;
    }
    savePin(newPin);
    toast("PIN geändert");
    app.querySelector("#s-pin-old").value = "";
    app.querySelector("#s-pin-new").value = "";
  });

  app.querySelector("#btn-export").addEventListener("click", () => {
    const data = { destinations: loadDestinations(), exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reise-tipps-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast("Backup heruntergeladen");
  });

  app.querySelector("#import-input").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        const incoming = Array.isArray(parsed) ? parsed : parsed.destinations;
        if (!Array.isArray(incoming)) throw new Error("Ungültiges Format");
        confirmModal(
          "Backup importieren?",
          `${incoming.length} Zielorte werden zu deinen bestehenden Daten hinzugefügt.`,
          () => {
            const current = loadDestinations();
            const existingIds = new Set(current.map((d) => d.id));
            const merged = current.concat(incoming.filter((d) => !existingIds.has(d.id)));
            saveDestinations(merged);
            toast("Import erfolgreich");
            renderSettings(app);
          }
        );
      } catch (err) {
        toast("Datei konnte nicht gelesen werden");
      }
    };
    reader.readAsText(file);
  });

  app.querySelector("#gmaps-import-input").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let places;
      try {
        places = parseGoogleTakeoutPlaces(reader.result);
      } catch (err) {
        toast("Datei konnte nicht gelesen werden – bitte eine JSON-Datei aus dem Google-Takeout-Export wählen");
        return;
      }
      if (!places.length) {
        toast("Keine Orte in dieser Datei gefunden");
        return;
      }
      const current = loadDestinations();
      const existingKeys = new Set(
        current.filter((d) => typeof d.lat === "number" && typeof d.lng === "number").map((d) => `${d.lat.toFixed(4)},${d.lng.toFixed(4)}`)
      );
      const fresh = places.filter((p) => !existingKeys.has(`${p.lat.toFixed(4)},${p.lng.toFixed(4)}`));
      if (!fresh.length) {
        toast("Alle Orte aus dieser Datei sind bereits vorhanden");
        return;
      }
      confirmModal(
        "Orte importieren?",
        `${fresh.length} neue Orte aus Google Maps gefunden${places.length - fresh.length > 0 ? ` (${places.length - fresh.length} bereits vorhanden)` : ""}. Sie werden automatisch nach Kontinent sortiert und als „Besucht“ angelegt – IATA-Code, Status und Details kannst du danach in jedem Zielort ergänzen.`,
        () => {
          const newDests = fresh.map((p) => {
            const { country, city } = parseAddressForCountryCity(p.address);
            return {
              id: uuid(),
              name: p.name,
              country,
              city,
              category: guessCategoryFromName(p.name),
              continent: guessContinent(p.lat, p.lng),
              iata: "---",
              status: "besucht",
              rating: 0,
              favorite: false,
              notes: p.address || "",
              photos: [],
              lat: p.lat,
              lng: p.lng,
              categories: {},
            };
          });
          saveDestinations(current.concat(newDests));
          toast(`${newDests.length} Orte importiert`);
          renderSettings(app);
        }
      );
    };
    reader.readAsText(file);
  });

  app.querySelector("#gmaps-list-import-input").addEventListener("change", (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const currentSettings = loadSettings();
    if (!currentSettings.mapsApiKey) {
      toast("Bitte zuerst einen Google Maps API-Key oben speichern");
      e.target.value = "";
      return;
    }
    Promise.all(
      files.map(
        (f) =>
          new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve({ name: f.name, text: String(reader.result) });
            reader.onerror = () => resolve(null);
            reader.readAsText(f);
          })
      )
    ).then((fileResults) => {
      e.target.value = "";
      let rows = [];
      for (const fr of fileResults) {
        if (!fr) continue;
        const listName = fr.name.replace(/\.csv$/i, "").replace(/\(\d+\)$/, "").trim();
        try {
          rows = rows.concat(parseGoogleSavedListCsv(fr.text, listName));
        } catch (err) {
          console.error("CSV-Parsing fehlgeschlagen", fr.name, err);
        }
      }
      if (!rows.length) {
        toast("Keine Orte in den ausgewählten Dateien gefunden");
        return;
      }
      const current = loadDestinations();
      const existingNames = new Set(current.map((d) => (d.name || "").trim().toLowerCase()));
      const fresh = rows.filter((r) => !existingNames.has(r.title.trim().toLowerCase()));
      if (!fresh.length) {
        toast("Alle Orte aus diesen Listen sind bereits vorhanden");
        return;
      }
      confirmModal(
        "Orte auflösen und importieren?",
        `${fresh.length} von ${rows.length} Orten aus ${files.length} Liste(n) sind neu. Die Koordinaten werden jetzt einzeln über die Google Places API ermittelt – das kann mehrere Minuten dauern und ggf. geringe Kosten verursachen.`,
        async () => {
          const overlay = importProgressOverlay("Orte werden aufgelöst …");
          try {
            await loadGoogleMaps(currentSettings.mapsApiKey);
          } catch (err) {
            overlay.close();
            toast("Google Maps konnte nicht geladen werden – bitte API-Key prüfen");
            return;
          }
          const newDests = [];
          let done = 0;
          for (const r of fresh) {
            overlay.update(done, fresh.length);
            const resolved = await resolvePlaceByText(`${r.title}, ${r.listName}`);
            if (resolved) {
              newDests.push({
                id: uuid(),
                name: resolved.name || r.title,
                country: resolved.country || "",
                city: resolved.city || "",
                category: resolved.category || guessCategoryFromName(r.listName) || guessCategoryFromName(resolved.name || r.title) || "",
                continent: guessContinent(resolved.lat, resolved.lng),
                iata: "---",
                status: "geplant",
                rating: 0,
                favorite: false,
                notes: [`Liste: ${r.listName}`, r.note, resolved.address].filter(Boolean).join(" · "),
                photos: [],
                lat: resolved.lat,
                lng: resolved.lng,
                categories: {},
              });
            }
            done++;
            await new Promise((res) => setTimeout(res, 120));
          }
          overlay.update(fresh.length, fresh.length);
          overlay.close();
          if (!newDests.length) {
            toast("Es konnten keine Orte aufgelöst werden");
            return;
          }
          const latest = loadDestinations();
          saveDestinations(latest.concat(newDests));
          toast(`${newDests.length} von ${fresh.length} Orten importiert`);
          renderSettings(app);
        }
      );
    });
  });

  app.querySelector("#gmaps-timeline-import-input").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const currentSettings = loadSettings();
    if (!currentSettings.mapsApiKey) {
      toast("Bitte zuerst einen Google Maps API-Key oben speichern");
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      e.target.value = "";
      let visits;
      try {
        visits = parseTimelineVisits(String(reader.result));
      } catch (err) {
        toast("Datei konnte nicht gelesen werden – bitte die location-history.json wählen");
        return;
      }
      if (!visits.length) {
        toast("Keine besuchten Orte in dieser Datei gefunden");
        return;
      }
      const current = loadDestinations();
      const existingKeys = new Set(
        current.filter((d) => typeof d.lat === "number" && typeof d.lng === "number").map((d) => `${d.lat.toFixed(4)},${d.lng.toFixed(4)}`)
      );
      const fresh = visits.filter((v) => !existingKeys.has(`${v.lat.toFixed(4)},${v.lng.toFixed(4)}`));
      if (!fresh.length) {
        toast("Alle Orte aus der Zeitachse sind bereits vorhanden");
        return;
      }
      confirmModal(
        "Zeitachse importieren?",
        `${fresh.length} von ${visits.length} eindeutig besuchten Orten sind neu. Die Namen werden jetzt einzeln über die Google Places API ermittelt – das kann mehrere Minuten dauern.`,
        async () => {
          const overlay = importProgressOverlay("Besuchte Orte werden benannt …");
          try {
            await loadGoogleMaps(currentSettings.mapsApiKey);
          } catch (err) {
            overlay.close();
            toast("Google Maps konnte nicht geladen werden – bitte API-Key prüfen");
            return;
          }
          const newDests = [];
          let done = 0;
          for (const v of fresh) {
            overlay.update(done, fresh.length);
            const resolved = await resolvePlaceById(v.placeId);
            newDests.push({
              id: uuid(),
              name: (resolved && resolved.name) || "Besuchter Ort",
              country: (resolved && resolved.country) || "",
              city: (resolved && resolved.city) || "",
              category: (resolved && (resolved.category || guessCategoryFromName(resolved.name))) || "",
              continent: guessContinent(v.lat, v.lng),
              iata: "---",
              status: "besucht",
              rating: 0,
              favorite: false,
              notes: [`Aus Google Timeline · ${v.count}× besucht`, resolved && resolved.address].filter(Boolean).join(" · "),
              photos: [],
              lat: v.lat,
              lng: v.lng,
              categories: {},
            });
            done++;
            await new Promise((res) => setTimeout(res, 120));
          }
          overlay.update(fresh.length, fresh.length);
          overlay.close();
          const latest = loadDestinations();
          saveDestinations(latest.concat(newDests));
          toast(`${newDests.length} Orte aus der Zeitachse importiert`);
          renderSettings(app);
        }
      );
    };
    reader.readAsText(file);
  });

  app.querySelector("#btn-clear-all").addEventListener("click", () => {
    confirmModal("Wirklich ALLE Daten löschen?", "Alle Zielorte, Einträge und Fotos werden unwiderruflich gelöscht. Erstelle vorher ein Backup!", () => {
      localStorage.removeItem(LS_DATA);
      toast("Alle Daten gelöscht");
      navigate("#/home");
    });
  });
}

/* ===========================================================
   MODAL
   =========================================================== */
function confirmModal(title, text, onConfirm) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal-box">
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(text)}</p>
      <div class="modal-actions">
        <button class="btn btn-secondary" id="modal-cancel">Abbrechen</button>
        <button class="btn btn-danger" id="modal-confirm">Bestätigen</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector("#modal-cancel").addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });
  overlay.querySelector("#modal-confirm").addEventListener("click", () => {
    overlay.remove();
    onConfirm();
  });
}

/* ===========================================================
   INIT
   =========================================================== */
function init() {
  if (!localStorage.getItem(LS_PIN)) savePin("1234");
  router();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }
}

init();
