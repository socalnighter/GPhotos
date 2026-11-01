const $ = (id) => document.getElementById(id);
const { exifInfo, dateFromLabel } = window.ExifUtil;
const T = window.TemplateUtil;

const INDEX_FILE = ".photos-backup-index.json";
const LEGACY_INDEX_FILE = ".gphotos-backup-index.json"; // name used by early test builds
const SETTINGS_KEY = "photosBackupSettings";
const conc = () => Math.max(1, Math.min(16, +$("conc").value || 6));

let dirHandle = null;
let cfg = { folderTpl: "", fileTpl: "{name}" }; // patterns frozen for the current run
let index = {};            // photo id -> relative path in the backup folder (lets re-runs skip finished files)
let indexDirty = 0, savingIndex = false;
let queue = [], active = 0;
let running = false, paused = false, scanDone = false, tabId = null;
let t0Run = 0, pausedAt = 0;
const claimed = new Set(); // names being written right now (avoid two workers picking one name)
const stats = { found: 0, saved: 0, skipped: 0, failed: 0, bytes: 0, fetchMs: 0, writeMs: 0, timed: 0 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const send = (msg) => chrome.runtime.sendMessage(msg).catch(() => {});

function log(msg) {
  const el = $("log");
  el.textContent += msg + "\n";
  el.scrollTop = el.scrollHeight;
}

function render(label) {
  let speed = "";
  if (running && !paused && stats.timed > 0) {
    const secs = Math.max(1, (performance.now() - t0Run) / 1000);
    const f = Math.round(stats.fetchMs / stats.timed), w = Math.round(stats.writeMs / stats.timed);
    speed = ` | ${(stats.bytes / 1e6 / secs).toFixed(1)} MB/s, ${(stats.saved / secs).toFixed(1)} files/s` +
      ` | per file: download ${f} ms, write ${w} ms` +
      (w > f * 1.5 ? " (writing to the backup folder is the slow part)"
        : f > w * 1.5 ? " (the network is the slow part)" : "");
  }
  const state = label || (paused ? "Paused" : running ? "Running" : "Idle");
  $("stats").textContent =
    `${state} — found ${stats.found}, saved ${stats.saved}, ` +
    `already in folder ${stats.skipped}, failed ${stats.failed}${speed}`;
}
setInterval(() => { if (running) render(); }, 1000);

// ---------- settings ----------
function readSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch (e) { return {}; }
}
function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      folderTpl: $("folderTpl").value, fileTpl: $("fileTpl").value,
      skipVideos: $("skipVideos").checked, conc: $("conc").value,
      delay: $("delay").value, scrollDelay: $("scrollDelay").value,
    }));
  } catch (e) { /* storage unavailable; settings just won't persist */ }
}

function fillPresets(select, presets, input) {
  presets.forEach((p, i) => select.add(new Option(p.label, String(i))));
  select.add(new Option("Custom pattern…", "custom"));
  select.addEventListener("change", () => {
    if (select.value !== "custom") input.value = presets[+select.value].value;
    onTemplateChange();
  });
}
function syncPresetSelect(select, presets, value) {
  const i = presets.findIndex((p) => p.value === value);
  select.value = i >= 0 ? String(i) : "custom";
}

function templateErrors() {
  const f = $("folderTpl").value, n = $("fileTpl").value, errs = [];
  const bad = [...T.unknownTokens(f), ...T.unknownTokens(n)];
  if (bad.length) errs.push(`Unknown token${bad.length > 1 ? "s" : ""}: ${bad.join(" ")}. See "Build your own pattern" for the list.`);
  if (/\{(name|ext)\}/.test(f)) errs.push("{name} and {ext} can only be used in the file name pattern.");
  return errs;
}

function updatePreview() {
  const errs = templateErrors();
  $("tplError").textContent = errs.join(" ");
  const ctx = { date: { y: 2023, m: 7, d: 14 }, camera: "Pixel 7 Pro", isVideo: false };
  const segs = T.folderPath($("folderTpl").value, ctx) || [];
  const file = T.fileName($("fileTpl").value, "IMG_1234.jpg", ctx);
  const root = dirHandle ? dirHandle.name : "PhotosBackup";
  $("preview").textContent = errs.length ? "" : "Example: " + [root, ...segs, file].join("/");
  updateButtons();
}

function onTemplateChange() {
  syncPresetSelect($("folderPreset"), T.FOLDER_PRESETS, $("folderTpl").value);
  syncPresetSelect($("filePreset"), T.FILE_PRESETS, $("fileTpl").value);
  updatePreview();
  saveSettings();
}

function updateButtons() {
  $("start").disabled = running || !dirHandle || templateErrors().length > 0;
  $("pause").disabled = !running;
  $("stop").disabled = !running;
  $("choose").disabled = running;
  document.querySelectorAll(".cfg").forEach((el) => { el.disabled = running; });
  $("pause").textContent = paused ? "Resume" : "Pause";
}

function initUi() {
  fillPresets($("folderPreset"), T.FOLDER_PRESETS, $("folderTpl"));
  fillPresets($("filePreset"), T.FILE_PRESETS, $("fileTpl"));
  const s = readSettings();
  $("folderTpl").value = s.folderTpl !== undefined ? s.folderTpl : T.FOLDER_PRESETS[0].value;
  $("fileTpl").value = s.fileTpl !== undefined ? s.fileTpl : T.FILE_PRESETS[0].value;
  if (s.skipVideos) $("skipVideos").checked = true;
  if (s.conc) $("conc").value = s.conc;
  if (s.delay !== undefined) $("delay").value = s.delay;
  if (s.scrollDelay) $("scrollDelay").value = s.scrollDelay;
  ["folderTpl", "fileTpl"].forEach((id) => $(id).addEventListener("input", onTemplateChange));
  ["skipVideos", "conc", "delay", "scrollDelay"].forEach((id) => $(id).addEventListener("change", saveSettings));

  const rows = Object.entries(T.TOKENS)
    .map(([t, d]) => `<tr><td><code>{${t}}</code></td><td>${d}</td></tr>`).join("");
  $("tokenTable").innerHTML = rows;
  onTemplateChange();
  render();
}

// ---------- index (resume support) ----------
async function loadIndex() {
  index = {};
  for (const name of [INDEX_FILE, LEGACY_INDEX_FILE]) {
    try {
      const f = await (await dirHandle.getFileHandle(name)).getFile();
      Object.assign(index, JSON.parse(await f.text()));
    } catch (e) { /* not there */ }
  }
}
async function saveIndex() {
  if (savingIndex || !dirHandle) return;
  savingIndex = true;
  try {
    const w = await (await dirHandle.getFileHandle(INDEX_FILE, { create: true })).createWritable();
    await w.write(JSON.stringify(index));
    await w.close();
    indexDirty = 0;
  } catch (e) { log("Could not save progress file: " + e.message); }
  savingIndex = false;
}
function record(id, rel) {
  index[id] = rel;
  if (++indexDirty >= 25) saveIndex();
}

// ---------- download + save ----------
function filenameFrom(headers) {
  const cd = headers.get("content-disposition") || "";
  let m = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(cd);
  let name = null;
  if (m) { try { name = decodeURIComponent(m[1].trim().replace(/^"|"$/g, "")); } catch (e) { /* ignore */ } }
  if (!name && (m = /filename="?([^";]+)"?/i.exec(cd))) name = m[1];
  return name ? name.replace(/[\\/:*?"<>|]/g, "_").trim() : null;
}
function extFor(ct) {
  const map = { "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp",
    "image/heic": "heic", "image/heif": "heif", "video/mp4": "mp4", "video/quicktime": "mov" };
  return map[ct.split(";")[0]] || (ct.startsWith("video/") ? "mp4" : "jpg");
}

async function pickName(dir, rel, name, size) {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  for (let n = 0; n < 1000; n++) {
    const cand = n === 0 ? name : `${base} (${n})${ext}`;
    const key = rel + cand;
    // Claim the name synchronously, before any await, so two parallel downloads
    // can never both pick the same name.
    if (claimed.has(key)) continue;
    claimed.add(key);
    try {
      const f = await (await dir.getFileHandle(cand)).getFile();
      claimed.delete(key);
      if (size >= 0 && f.size === size) return { name: cand, existed: true };
      // same name but a different file: try the next suffix
    } catch (e) {
      if (e.name === "NotFoundError") return { name: cand, existed: false }; // keep the claim
      claimed.delete(key);
      throw e;
    }
  }
  throw new Error("too many files with the same name");
}

async function download(it) {
  const tStart = performance.now();
  const resp = await fetch(it.url, { credentials: "include" });
  if (!resp.ok) throw new Error("HTTP " + resp.status);
  const ct = (resp.headers.get("content-type") || "").toLowerCase();
  if (ct.startsWith("text/")) throw new Error("got a web page instead of a photo (" + ct + ")");

  const original = filenameFrom(resp.headers) || `photo_${it.id.slice(-10)}.${extFor(ct)}`;
  const isVideo = ct.startsWith("video/");
  let buf = null, info = null;
  if (!isVideo) {
    buf = await resp.arrayBuffer();
    if (ct.startsWith("image/jpeg")) info = exifInfo(buf);
  }
  const date = (info && info.date) || dateFromLabel(it.label);
  const size = buf ? buf.byteLength : (+resp.headers.get("content-length") || -1);
  const tFetch = performance.now() - tStart;

  const ctx = { date, camera: info && info.camera, isVideo };
  const segs = T.folderPath(cfg.folderTpl, ctx) || ["Unknown date"];
  const name = T.fileName(cfg.fileTpl, original, ctx);
  let dir = dirHandle;
  for (const seg of segs) dir = await dir.getDirectoryHandle(seg, { create: true });
  const rel = segs.length ? segs.join("/") + "/" : "";

  const pick = await pickName(dir, rel, name, size);
  if (pick.existed) {
    if (!buf && resp.body) await resp.body.cancel();
    record(it.id, rel + pick.name);
    return "exists";
  }
  const tWriteStart = performance.now();
  try {
    const w = await (await dir.getFileHandle(pick.name, { create: true })).createWritable();
    try {
      if (buf) { await w.write(buf); await w.close(); }
      else { await resp.body.pipeTo(w); }
    } catch (e) { try { await w.abort(); } catch (_) { /* ignore */ } throw e; }
  } finally {
    claimed.delete(rel + pick.name);
  }
  stats.bytes += Math.max(0, size);
  stats.fetchMs += tFetch;
  stats.writeMs += performance.now() - tWriteStart;
  stats.timed++;
  record(it.id, rel + pick.name);
  return "saved";
}

async function handle(it) {
  if (index[it.id]) { stats.skipped++; return; }
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await download(it);
      if (r === "exists") stats.skipped++; else stats.saved++;
      break;
    } catch (e) {
      if (attempt === 3) { stats.failed++; log(`Failed ${it.label || it.id.slice(-8)}: ${e.message}`); }
      else await sleep(1500 * attempt);
    }
  }
  await sleep(Math.max(0, +$("delay").value || 0));
}

// ---------- queue control ----------
function pump() {
  if (running) {
    while (!paused && active < conc() && queue.length) {
      const it = queue.shift();
      active++;
      handle(it).finally(() => {
        active--;
        if (running) pump(); else if (active === 0) finalize("Stopped");
      });
    }
    if (scanDone && !queue.length && active === 0) { running = false; finalize("Finished"); return; }
  }
  render();
}

async function finalize(label) {
  running = false; paused = false;
  send({ type: "keepAwake", on: false });
  await saveIndex();
  updateButtons();
  render(label);
  log(`${label}. Saved ${stats.saved}, already there ${stats.skipped}, failed ${stats.failed}.`);
  if (stats.failed) log("Run it again to retry the failed ones; finished files are skipped.");
}

chrome.runtime.onMessage.addListener((msg) => {
  if (!running) return;
  if (msg.type === "items") {
    for (const it of msg.items) {
      if (it.isVideo && $("skipVideos").checked) continue;
      stats.found++;
      queue.push(it);
    }
    pump();
  } else if (msg.type === "diag") {
    const pct = msg.total ? Math.round((100 * (msg.pos || 0)) / msg.total) : 0;
    $("diag").textContent = `Page check: ${msg.anchors} photo links visible, ${msg.withThumb} readable. ` +
      `Scrolled ${pct}% of what Google has loaded so far.` +
      (msg.hidden && !paused ? " WARNING: the Photos tab is hidden, so Chrome is pausing it. Click it so it stays in front." : "");
  } else if (msg.type === "scanDone") {
    scanDone = true;
    log(msg.stopped ? "Scan stopped." : "Reached the end of your library; finishing downloads…");
    if (stats.found === 0) log("Nothing was found. Check the 'Page check' line: 0 links means you are not on the main Photos library view; links but 0 thumbnails means Google changed its page layout.");
    pump();
  }
});

// ---------- buttons ----------
$("choose").onclick = async () => {
  try {
    dirHandle = await showDirectoryPicker({ mode: "readwrite" });
    $("folder").textContent = dirHandle.name;
    updatePreview();
  } catch (e) { /* cancelled */ }
};

$("start").onclick = async () => {
  const tabs = await chrome.tabs.query({ url: "https://photos.google.com/*" });
  if (!tabs.length) { log("Open photos.google.com in another window first."); return; }
  tabId = (tabs.find((t) => t.active) || tabs[0]).id;
  if ((await dirHandle.requestPermission({ mode: "readwrite" })) !== "granted") {
    log("Permission to write to the backup folder was not granted."); return;
  }
  cfg = { folderTpl: $("folderTpl").value.trim(), fileTpl: $("fileTpl").value.trim() || "{name}" };
  saveSettings();
  await loadIndex();
  log(`Starting. ${Object.keys(index).length} photos are already recorded in this folder and will be skipped.`);
  Object.assign(stats, { found: 0, saved: 0, skipped: 0, failed: 0, bytes: 0, fetchMs: 0, writeMs: 0, timed: 0 });
  t0Run = performance.now();
  queue = []; active = 0; scanDone = false; running = true; paused = false;
  send({ type: "keepAwake", on: true });
  updateButtons();
  try { await chrome.tabs.sendMessage(tabId, { type: "ping" }); }
  catch (e) { await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] }); }
  const ack = await chrome.tabs.sendMessage(tabId, { type: "start", opts: { scrollDelay: +$("scrollDelay").value } });
  log(ack && ack.ok ? "Connected to the Photos tab. Scrolling through your library…" : "No answer from the Photos tab. Reload it and try again.");
  render();
};

$("pause").onclick = async () => {
  if (!running) return;
  if (!paused) {
    paused = true; pausedAt = performance.now();
    try { await chrome.tabs.sendMessage(tabId, { type: "pause" }); } catch (e) { /* tab gone */ }
    send({ type: "keepAwake", on: false });
    log("Paused. Files already in progress will finish first.");
  } else {
    paused = false; t0Run += performance.now() - pausedAt;
    try { await chrome.tabs.sendMessage(tabId, { type: "resume" }); } catch (e) { /* tab gone */ }
    send({ type: "keepAwake", on: true });
    log("Resumed.");
    pump();
  }
  updateButtons();
  render();
};

$("stop").onclick = async () => {
  running = false; paused = false; queue = [];
  try { await chrome.tabs.sendMessage(tabId, { type: "stop" }); } catch (e) { /* tab gone */ }
  log("Stopping after current files finish…");
  if (active === 0) finalize("Stopped");
};

window.addEventListener("beforeunload", (e) => { if (running) { e.preventDefault(); e.returnValue = ""; } });
initUi();
