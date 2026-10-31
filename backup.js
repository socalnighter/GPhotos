const $ = (id) => document.getElementById(id);
const { exifDate, dateFromLabel, MONTHS } = window.ExifUtil;
const INDEX_FILE = ".gphotos-backup-index.json";
const conc = () => Math.max(1, Math.min(16, +$("conc").value || 6));
let t0Run = 0;

let dirHandle = null;
let index = {};            // photo id -> relative path on the stick (lets re-runs skip finished files)
let indexDirty = 0, savingIndex = false;
let queue = [], active = 0;
let running = false, scanDone = false, tabId = null;
const claimed = new Set(); // names being written right now (avoid two workers picking one name)
const stats = { found: 0, saved: 0, skipped: 0, failed: 0, bytes: 0, fetchMs: 0, writeMs: 0, timed: 0 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pad = (n) => String(n).padStart(2, "0");

function log(msg) {
  const el = $("log");
  el.textContent += msg + "\n";
  el.scrollTop = el.scrollHeight;
}
function render(label) {
  let speed = "";
  if (running && stats.timed > 0) {
    const secs = Math.max(1, (performance.now() - t0Run) / 1000);
    const f = Math.round(stats.fetchMs / stats.timed), w = Math.round(stats.writeMs / stats.timed);
    speed = ` | ${(stats.bytes / 1e6 / secs).toFixed(1)} MB/s, ${(stats.saved / secs).toFixed(1)} files/s` +
      ` | per file: download ${f} ms, write ${w} ms` +
      (w > f * 1.5 ? " (the memory stick is the slow part)" : f > w * 1.5 ? " (the network is the slow part)" : "");
  }
  $("stats").textContent =
    `${label || (running ? "Running" : "Idle")} — found ${stats.found}, saved ${stats.saved}, ` +
    `already on stick ${stats.skipped}, failed ${stats.failed}${speed}`;
}

// ---------- index (resume support) ----------
async function loadIndex() {
  try {
    const f = await (await dirHandle.getFileHandle(INDEX_FILE)).getFile();
    index = JSON.parse(await f.text());
  } catch (e) { index = {}; }
}
async function saveIndex() {
  if (savingIndex) return;
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
    if (claimed.has(key)) continue;
    try {
      const f = await (await dir.getFileHandle(cand)).getFile();
      if (size >= 0 && f.size === size) return { name: cand, existed: true };
    } catch (e) {
      if (e.name === "NotFoundError") { claimed.add(key); return { name: cand, existed: false }; }
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

  const name = filenameFrom(resp.headers) || `photo_${it.id.slice(-10)}.${extFor(ct)}`;
  const isVideo = ct.startsWith("video/");
  let buf = null, date = null;
  if (!isVideo) {
    buf = await resp.arrayBuffer();
    if (ct.startsWith("image/jpeg")) date = exifDate(buf);
  }
  date = date || dateFromLabel(it.label);
  const size = buf ? buf.byteLength : (+resp.headers.get("content-length") || -1);
  const tFetch = performance.now() - tStart;

  let dir = dirHandle, rel;
  if (date) {
    const y = String(date.y);
    const m = `${pad(date.m)} - ${MONTHS[date.m - 1]}`;
    dir = await (await dirHandle.getDirectoryHandle(y, { create: true })).getDirectoryHandle(m, { create: true });
    rel = `${y}/${m}/`;
  } else {
    dir = await dirHandle.getDirectoryHandle("Unknown date", { create: true });
    rel = "Unknown date/";
  }

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
    while (active < conc() && queue.length) {
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
setInterval(() => { if (running) render(); }, 1000);
}

async function finalize(label) {
  chrome.runtime.sendMessage({ type: "keepAwake", on: false }).catch(() => {});
  await saveIndex();
  $("start").disabled = false; $("stop").disabled = true; $("choose").disabled = false;
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
      (msg.hidden ? " WARNING: the Photos tab is hidden, so Chrome is pausing it. Click it so it stays in front." : "");
  } else if (msg.type === "scanDone") {
    scanDone = true;
    log(msg.stopped ? "Scan stopped." : "Reached the end of your library; finishing downloads…");
    if (stats.found === 0) log("Nothing was found. Check the 'Page check' line: 0 links means you are not on the main Photos library view; links but 0 thumbnails means Google changed its page layout.");
    pump();
  }
});

$("choose").onclick = async () => {
  try {
    dirHandle = await showDirectoryPicker({ mode: "readwrite" });
    $("folder").textContent = dirHandle.name;
    $("start").disabled = false;
  } catch (e) { /* cancelled */ }
};

$("start").onclick = async () => {
  const tabs = await chrome.tabs.query({ url: "https://photos.google.com/*" });
  if (!tabs.length) { log("Open photos.google.com in another tab first."); return; }
  tabId = (tabs.find((t) => t.active) || tabs[0]).id;
  if ((await dirHandle.requestPermission({ mode: "readwrite" })) !== "granted") {
    log("Permission to write to the folder was not granted."); return;
  }
  await loadIndex();
  log(`Resuming: ${Object.keys(index).length} photos already recorded on the stick.`);
  Object.assign(stats, { found: 0, saved: 0, skipped: 0, failed: 0, bytes: 0, fetchMs: 0, writeMs: 0, timed: 0 });
  t0Run = performance.now();
  queue = []; active = 0; scanDone = false; running = true;
  chrome.runtime.sendMessage({ type: "keepAwake", on: true }).catch(() => {});
  $("start").disabled = true; $("stop").disabled = false; $("choose").disabled = true;
  try { await chrome.tabs.sendMessage(tabId, { type: "ping" }); }
  catch (e) { await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] }); }
  const ack = await chrome.tabs.sendMessage(tabId, { type: "start", opts: { scrollDelay: +$("scrollDelay").value } });
  log(ack && ack.ok ? "Connected to the Photos tab. Scrolling through your library…" : "No answer from the Photos tab. Reload it and try again.");
  render();
};

$("stop").onclick = async () => {
  running = false; queue = [];
  try { await chrome.tabs.sendMessage(tabId, { type: "stop" }); } catch (e) { /* tab gone */ }
  log("Stopping after current files finish…");
  if (active === 0) finalize("Stopped");
};

window.addEventListener("beforeunload", (e) => { if (running) { e.preventDefault(); e.returnValue = ""; } });
render();
