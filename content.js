// Runs on photos.google.com. Scrolls the library and reports each photo it finds
// to the backup page (backup.html), which does the downloading and saving.
(() => {
  if (window.__gpbLoaded) return;
  window.__gpbLoaded = true;

  let stopRequested = false;
  let seen = new Set();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const PHOTO_HOST = /^https:\/\/[^/]*(googleusercontent\.com|usercontent\.google\.com)\//;

  function thumbUrl(a) {
    for (const el of [a, ...a.querySelectorAll("*")]) {
      if (el.tagName === "IMG" && PHOTO_HOST.test(el.src)) return el.src;
      const bg = getComputedStyle(el).backgroundImage;
      const m = bg && bg.match(/url\(["']?(https:[^"')]+)["']?\)/);
      if (m && PHOTO_HOST.test(m[1])) return m[1];
    }
    return null;
  }

  function looksLikeVideo(a, label) {
    if (/^\s*Video\b/i.test(label)) return true;
    for (const e of a.querySelectorAll("*")) {
      if (e.children.length === 0 && /^\d{1,2}:\d{2}(:\d{2})?$/.test(e.textContent.trim())) return true;
    }
    return false;
  }

  let lastDiag = { anchors: 0, withThumb: 0 };
  function scan() {
    const out = [];
    const anchors = document.querySelectorAll('a[href*="/photo/"]');
    lastDiag = { anchors: anchors.length, withThumb: 0 };
    anchors.forEach((a) => {
      const m = (a.getAttribute("href") || "").match(/\/photo\/([^/?#]+)/);
      if (!m || seen.has(m[1])) return;
      const t = thumbUrl(a);
      if (!t) return; // thumbnail not rendered yet; pick it up on the next pass
      lastDiag.withThumb++;
      const [path, query] = t.split("?");
      const base = path.replace(/=[^/]*$/, "");
      const label = a.getAttribute("aria-label") || "";
      const isVideo = looksLikeVideo(a, label);
      out.push({
        id: m[1],
        label,
        isVideo,
        url: base + (isVideo ? "=dv" : "=d") + (query ? "?" + query : ""),
      });
    });
    return out;
  }

  function findScroller() {
    const a = document.querySelector('a[href*="/photo/"]');
    let el = a ? a.parentElement : null;
    while (el && el !== document.body) {
      const s = getComputedStyle(el);
      if (/(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 50) return el;
      el = el.parentElement;
    }
    return document.scrollingElement;
  }

  async function send(msg) {
    try { await chrome.runtime.sendMessage(msg); return true; } catch (e) { return false; }
  }

  async function run(opts) {
    seen = new Set();
    stopRequested = false;
    const delay = Math.max(400, (opts && opts.scrollDelay) || 900);
    findScroller().scrollTo(0, 0);
    await sleep(1500);
    let idle = 0, lastHeight = 0;
    while (!stopRequested) {
      const items = scan();
      const sc = findScroller();
      send({ type: "diag", ...lastDiag, url: location.pathname, hidden: document.hidden,
        pos: Math.round(sc.scrollTop), total: Math.round(sc.scrollHeight) });
      if (items.length) {
        items.forEach((i) => seen.add(i.id));
        if (!(await send({ type: "items", items }))) return; // backup page closed
        idle = 0;
      } else {
        idle++;
      }
      // The library keeps growing as you scroll, so growth of the page also counts as progress.
      if (sc.scrollHeight > lastHeight + 5) { lastHeight = sc.scrollHeight; idle = 0; }

      const before = sc.scrollTop;
      sc.scrollBy(0, Math.round(sc.clientHeight * 0.8));
      await sleep(delay);
      const atBottom = Math.abs(sc.scrollTop - before) < 2;
      if (atBottom && idle >= 2) {
        // Nudge up and back down so Google Photos notices it should load the next chunk.
        sc.scrollBy(0, -Math.round(sc.clientHeight * 0.6));
        await sleep(600);
        sc.scrollTo(0, sc.scrollHeight);
        await sleep(delay * 2);
      }
      // Be patient: slow loads (or a throttled background tab) can stall for a while.
      if (idle >= (atBottom ? 25 : 40)) break;
    }
    await send({ type: "scanDone", stopped: stopRequested });
  }

  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg.type === "ping") reply({ ok: true });
    else if (msg.type === "start") { run(msg.opts); reply({ ok: true }); }
    else if (msg.type === "stop") { stopRequested = true; reply({ ok: true }); }
  });
})();
