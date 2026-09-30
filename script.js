// ---------- Helpers ----------
const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, "0");

// localStorage wrapper: safe read/write with a fallback value
const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); }
    catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  },
};

// Make an element with text (textContent keeps user input safe from HTML injection)
function el(tag, text = "", cls = "") {
  const node = document.createElement(tag);
  node.textContent = text;
  if (cls) node.className = cls;
  return node;
}

// ---------- Sound (Web Audio API: no audio file needed) ----------
let audioCtx;
function beep() {
  audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.frequency.value = 880;
  gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.4);
}

// ---------- Themes ----------
const themeButton = $("theme-button");
const themeMenu = $("theme-menu");
const themeItems = Array.from(themeMenu.querySelectorAll("[data-theme]"));
const validThemes = ["light", "dark", "ocean", "sunset", "forest", "neon"];
const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
const themeLabel = { light: "Light", dark: "Dark", ocean: "Ocean", sunset: "Sunset", forest: "Forest", neon: "Neon" };
function setThemeSelection(name) {
  themeItems.forEach((item) => {
    const active = item.dataset.theme === name;
    item.setAttribute("aria-selected", active);
    item.classList.toggle("selected", active);
  });
}
function applyTheme(name) {
  const safeName = validThemes.includes(name) ? name : "light";
  document.documentElement.dataset.theme = safeName;
  themeButton.textContent = themeLabel[safeName];
  themeButton.setAttribute("aria-expanded", "false");
  themeMenu.hidden = true;
  setThemeSelection(safeName);
  store.set("theme", safeName);
}
function toggleThemeMenu(forceOpen) {
  const shouldOpen = typeof forceOpen === "boolean" ? forceOpen : themeMenu.hidden;
  themeMenu.hidden = !shouldOpen;
  themeButton.setAttribute("aria-expanded", String(shouldOpen));
}
themeButton.addEventListener("click", () => toggleThemeMenu());
themeItems.forEach((item) => item.addEventListener("click", () => {
  applyTheme(item.dataset.theme);
}));
document.addEventListener("click", (event) => {
  if (!event.target.closest(".theme-pick")) toggleThemeMenu(false);
});
applyTheme(store.get("theme", prefersDark ? "dark" : "light"));

// ---------- Tabs ----------
const tabs = document.querySelectorAll("[data-tab]");
tabs.forEach((btn) => btn.addEventListener("click", () => {
  tabs.forEach((b) => {
    const active = b === btn;
    b.setAttribute("aria-selected", active);
    $("tab-" + b.dataset.tab).hidden = !active;
  });
}));

// ---------- Clock ----------
let use24 = store.get("use24", false);
function renderClock(now) {
  let h = now.getHours();
  let suffix = "";
  if (!use24) { suffix = h >= 12 ? "PM" : "AM"; h = h % 12 || 12; }
  $("hm").textContent = `${pad(h)}:${pad(now.getMinutes())}`;
  $("sec").textContent = `:${pad(now.getSeconds())}`;
  $("ampm").textContent = suffix;
  $("date").textContent = now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  $("fmt").textContent = use24 ? "Switch to 12-hour" : "Switch to 24-hour";
}
$("fmt").addEventListener("click", () => { use24 = !use24; store.set("use24", use24); tick(); });

// ---------- World clocks ----------
const ZONES = {
  "Africa/Lagos": "Lagos", "Africa/Cairo": "Cairo", "Africa/Johannesburg": "Johannesburg",
  "America/New_York": "New York", "America/Los_Angeles": "Los Angeles", "America/Sao_Paulo": "São Paulo",
  "Europe/London": "London", "Europe/Paris": "Paris", "Europe/Moscow": "Moscow",
  "Asia/Dubai": "Dubai", "Asia/Kolkata": "Mumbai", "Asia/Shanghai": "Shanghai",
  "Asia/Tokyo": "Tokyo", "Australia/Sydney": "Sydney", "Pacific/Auckland": "Auckland",
};
let myZones = store.get("zones", ["America/New_York", "Europe/London", "Asia/Tokyo"]);

Object.entries(ZONES).forEach(([tz, city]) => {
  const opt = el("option", city); opt.value = tz; $("zone-select").append(opt);
});
$("zone-add").addEventListener("click", () => {
  const tz = $("zone-select").value;
  if (!myZones.includes(tz)) { myZones.push(tz); store.set("zones", myZones); renderZones(new Date()); }
});

function renderZones(now) {
  const list = $("zone-list");
  list.replaceChildren();
  myZones.forEach((tz) => {
    const time = new Intl.DateTimeFormat([], { timeZone: tz, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: !use24 }).format(now);
    const day = new Intl.DateTimeFormat([], { timeZone: tz, weekday: "long" }).format(now);
    const li = el("li");
    const left = el("div");
    left.append(el("strong", ZONES[tz] || tz), el("span", day, "sub"));
    const remove = el("button", "Remove", "ghost");
    remove.addEventListener("click", () => { myZones = myZones.filter((z) => z !== tz); store.set("zones", myZones); renderZones(new Date()); });
    li.append(left, el("span", time, "t"), remove);
    list.append(li);
  });
}

// ---------- Alarms ----------
let alarms = store.get("alarms", []); // { id, time: "HH:MM", label, on }
let lastFired = "";
let ringTimer = null;

function renderAlarms() {
  const list = $("alarm-list");
  list.replaceChildren();
  if (!alarms.length) list.append(el("li", "No alarms yet. Pick a time and add one."));
  alarms.forEach((a) => {
    const li = el("li");
    const left = el("div");
    left.append(el("span", a.time, "t"), el("span", a.label || "Alarm", "sub"));
    const toggle = el("button", a.on ? "On" : "Off", a.on ? "" : "ghost");
    toggle.addEventListener("click", () => { a.on = !a.on; saveAlarms(); });
    const del = el("button", "Delete", "ghost");
    del.addEventListener("click", () => { alarms = alarms.filter((x) => x.id !== a.id); saveAlarms(); });
    li.append(left, toggle, del);
    list.append(li);
  });
}
function saveAlarms() { store.set("alarms", alarms); renderAlarms(); }

$("alarm-add").addEventListener("click", () => {
  const time = $("alarm-time").value;
  if (!time) { $("alarm-time").focus(); return; }
  beep(); // first click "unlocks" audio in browsers
  alarms.push({ id: Date.now(), time, label: $("alarm-label").value.trim(), on: true });
  alarms.sort((a, b) => a.time.localeCompare(b.time));
  $("alarm-label").value = "";
  saveAlarms();
});
$("alarm-test").addEventListener("click", beep);

function checkAlarms(now) {
  const key = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  if (lastFired && lastFired !== key) lastFired = "";
  if (lastFired) return; // fire once per minute
  const hit = alarms.find((a) => a.on && a.time === key);
  if (hit) { lastFired = key; ring(hit); }
}
function ring(alarm) {
  $("ringing-text").textContent = `${alarm.time} ${alarm.label}`.trim();
  $("ringing").hidden = false;
  beep();
  clearInterval(ringTimer);
  ringTimer = setInterval(beep, 800);
}
$("ringing-stop").addEventListener("click", () => {
  clearInterval(ringTimer);
  $("ringing").hidden = true;
  lastFired = "";
});

// ---------- Stopwatch ----------
let swRunning = false, swStart = 0, swElapsed = 0, swTimer = null, lapCount = 0, lastLap = 0;
const fmtSw = (ms) => `${pad(Math.floor(ms / 60000))}:${pad(Math.floor(ms / 1000) % 60)}.${pad(Math.floor(ms / 10) % 100)}`;
const swNow = () => swElapsed + (swRunning ? Date.now() - swStart : 0);

$("sw-start").addEventListener("click", () => {
  if (swRunning) {
    swElapsed += Date.now() - swStart; swRunning = false; clearInterval(swTimer);
  } else {
    swStart = Date.now(); swRunning = true;
    swTimer = setInterval(() => ($("sw-display").textContent = fmtSw(swNow())), 30);
  }
  $("sw-start").textContent = swRunning ? "Pause" : "Resume";
});
$("sw-lap").addEventListener("click", () => {
  if (!swRunning) return;
  const t = swNow();
  lapCount++;
  const li = el("li");
  li.append(el("span", `Lap ${lapCount}`), el("span", `+${fmtSw(t - lastLap)}`), el("span", fmtSw(t), "t"));
  $("laps").prepend(li);
  lastLap = t;
});
$("sw-reset").addEventListener("click", () => {
  clearInterval(swTimer); swRunning = false; swElapsed = 0; lapCount = 0; lastLap = 0;
  $("sw-display").textContent = fmtSw(0);
  $("sw-start").textContent = "Start";
  $("laps").replaceChildren();
});

// ---------- Countdown ----------
let cdRunning = false, cdEnd = 0, cdLeft = 0, cdTimer = null;
const fmtCd = (ms) => { const s = Math.ceil(ms / 1000); return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`; };
const sanitizeCdValues = () => {
  const min = Math.min(Math.max(Math.trunc(Number($("cd-min").value) || 0), 0), 999);
  const sec = Math.min(Math.max(Math.trunc(Number($("cd-sec").value) || 0), 0), 59);
  $("cd-min").value = min;
  $("cd-sec").value = sec;
  return min * 60 + sec;
};
const cdInput = () => sanitizeCdValues() * 1000;
function showCd() { $("cd-display").textContent = fmtCd(cdRunning || cdLeft ? cdLeft : cdInput()); }

$("cd-start").addEventListener("click", () => {
  if (cdRunning) { // pause
    clearInterval(cdTimer); cdRunning = false; $("cd-start").textContent = "Resume"; return;
  }
  if (!cdLeft) cdLeft = cdInput();
  if (cdLeft <= 0) return;
  beep(); // unlock audio
  cdEnd = Date.now() + cdLeft; cdRunning = true;
  $("cd-start").textContent = "Pause";
  cdTimer = setInterval(() => {
    cdLeft = Math.max(0, cdEnd - Date.now());
    showCd();
    if (cdLeft === 0) {
      clearInterval(cdTimer); cdRunning = false; $("cd-start").textContent = "Start";
      beep(); setTimeout(beep, 500); setTimeout(beep, 1000);
    }
  }, 200);
});
$("cd-reset").addEventListener("click", () => {
  clearInterval(cdTimer); cdRunning = false; cdLeft = 0; $("cd-start").textContent = "Start"; showCd();
});
["cd-min", "cd-sec"].forEach((id) => $(id).addEventListener("input", () => { if (!cdRunning) { cdLeft = 0; showCd(); } }));

// ---------- Main loop ----------
function tick() {
  const now = new Date();
  renderClock(now);
  renderZones(now);
  checkAlarms(now);
}
renderAlarms();
showCd();
tick();
setInterval(tick, 1000);
