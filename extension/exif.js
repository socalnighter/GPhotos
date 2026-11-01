// Helpers that work out when (and with what camera) a photo was taken.
(function (root) {
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July",
    "August", "September", "October", "November", "December"];

  function parseTiff(v, base) {
    const le = v.getUint16(base) === 0x4949;
    const u16 = (o) => v.getUint16(base + o, le);
    const u32 = (o) => v.getUint32(base + o, le);
    const ascii = (o, n) => {
      let s = "";
      for (let i = 0; i < n - 1; i++) s += String.fromCharCode(v.getUint8(base + o + i));
      return s.replace(/\0+$/, "").trim();
    };
    function readIfd(off, wanted) {
      const out = {};
      const n = u16(off);
      for (let i = 0; i < n; i++) {
        const e = off + 2 + i * 12;
        const tag = u16(e), type = u16(e + 2), count = u32(e + 4);
        if (type === 2 && wanted.includes(tag) && count > 1) {
          out[tag] = ascii(count > 4 ? u32(e + 8) : e + 8, count);
        } else if (tag === 0x8769) {
          out.exif = u32(e + 8);
        }
      }
      return out;
    }
    // IFD0: 0x0132 DateTime, 0x010F Make, 0x0110 Model
    const ifd0 = readIfd(u32(4), [0x0132, 0x010F, 0x0110]);
    let dt;
    if (ifd0.exif) {
      const sub = readIfd(ifd0.exif, [0x9003, 0x9004]); // DateTimeOriginal, DateTimeDigitized
      dt = sub[0x9003] || sub[0x9004];
    }
    return { dt: dt || ifd0[0x0132] || null, make: ifd0[0x010F] || "", model: ifd0[0x0110] || "" };
  }

  function cameraName(make, model) {
    make = (make || "").trim(); model = (model || "").trim();
    if (!model) return make || null;
    if (make && !model.toLowerCase().startsWith(make.toLowerCase())) return make + " " + model;
    return model;
  }

  // Returns { date: {y, m, d} | null, camera: string | null } for a JPEG, or null if unreadable.
  function exifInfo(buf) {
    try {
      const v = new DataView(buf);
      if (v.byteLength < 12 || v.getUint16(0) !== 0xFFD8) return null;
      let off = 2;
      while (off + 4 < v.byteLength) {
        if (v.getUint8(off) !== 0xFF) return null;
        const marker = v.getUint8(off + 1);
        if (marker === 0xDA || marker === 0xD9) return null;
        const len = v.getUint16(off + 2);
        if (marker === 0xE1 && v.getUint32(off + 4) === 0x45786966) { // "Exif"
          const t = parseTiff(v, off + 10);
          let date = null;
          const m = t.dt && /^(\d{4}):(\d{2}):(\d{2})/.exec(t.dt);
          if (m && +m[1] >= 1900 && +m[2] >= 1 && +m[2] <= 12) date = { y: +m[1], m: +m[2], d: +m[3] };
          return { date, camera: cameraName(t.make, t.model) };
        }
        off += 2 + len;
      }
    } catch (e) { /* fall through */ }
    return null;
  }

  function exifDate(buf) {
    const i = exifInfo(buf);
    return i ? i.date : null;
  }

  // Fallback: the date Google Photos shows in the thumbnail's aria-label,
  // e.g. "Photo - Landscape - Oct 5, 2023, 3:42:10 PM". English-style dates work best.
  function dateFromLabel(label) {
    if (!label) return null;
    const parts = label.replace(/[  ]/g, " ").split(/\s[-–—]\s/);
    for (let i = parts.length - 1; i >= 0; i--) {
      if (!/\b(19|20)\d{2}\b/.test(parts[i])) continue;
      const t = Date.parse(parts[i]);
      if (isNaN(t)) continue;
      const d = new Date(t);
      if (d.getFullYear() >= 1990) return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() };
    }
    return null;
  }

  const api = { exifInfo, exifDate, dateFromLabel, MONTHS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ExifUtil = api;
})(typeof window !== "undefined" ? window : globalThis);
