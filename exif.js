// Helpers to work out a photo's creation year/month.
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
      return s;
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
    const ifd0 = readIfd(u32(4), [0x0132]);
    let s;
    if (ifd0.exif) {
      const sub = readIfd(ifd0.exif, [0x9003, 0x9004]); // DateTimeOriginal, DateTimeDigitized
      s = sub[0x9003] || sub[0x9004];
    }
    return s || ifd0[0x0132] || null;
  }

  // Returns {y, m, d} from a JPEG's EXIF data, or null.
  function exifDate(buf) {
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
          const s = parseTiff(v, off + 10);
          const m = s && /^(\d{4}):(\d{2}):(\d{2})/.exec(s);
          if (!m) return null;
          const y = +m[1], mo = +m[2];
          if (y < 1900 || mo < 1 || mo > 12) return null;
          return { y, m: mo, d: +m[3] };
        }
        off += 2 + len;
      }
    } catch (e) { /* fall through */ }
    return null;
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

  const api = { exifDate, dateFromLabel, MONTHS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ExifUtil = api;
})(typeof window !== "undefined" ? window : globalThis);
