// Turns a pattern such as "{YYYY}/{MM} - {MMMM}" into folder and file names.
(function (root) {
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July",
    "August", "September", "October", "November", "December"];

  const TOKENS = {
    YYYY: "4-digit year, e.g. 2023",
    YY: "2-digit year, e.g. 23",
    MM: "month number, e.g. 07",
    MMM: "short month name, e.g. Jul",
    MMMM: "full month name, e.g. July",
    DD: "day of the month, e.g. 14",
    Q: "quarter of the year, 1 to 4",
    decade: "decade, e.g. 2020s",
    type: "Photos or Videos",
    camera: "camera or phone model from the photo's EXIF data",
    name: "original file name (file pattern only)",
    ext: "file extension (file pattern only)",
  };
  const DATE_TOKEN = /\{(YYYY|YY|MM|MMM|MMMM|DD|Q|decade)\}/;

  const FOLDER_PRESETS = [
    { label: "Year / Month name  (2023/07 - July)", value: "{YYYY}/{MM} - {MMMM}" },
    { label: "Year / Month number  (2023/07)", value: "{YYYY}/{MM}" },
    { label: "Year only  (2023)", value: "{YYYY}" },
    { label: "Year-Month in one folder  (2023-07)", value: "{YYYY}-{MM}" },
    { label: "Year / Quarter  (2023/Q3)", value: "{YYYY}/Q{Q}" },
    { label: "Year / Month / Day  (2023/07/14)", value: "{YYYY}/{MM}/{DD}" },
    { label: "Decade / Year  (2020s/2023)", value: "{decade}/{YYYY}" },
    { label: "Photos or Videos first  (Photos/2023/07 - July)", value: "{type}/{YYYY}/{MM} - {MMMM}" },
    { label: "Camera / Year  (Pixel 7 Pro/2023)", value: "{camera}/{YYYY}" },
    { label: "Year / Camera  (2023/Pixel 7 Pro)", value: "{YYYY}/{camera}" },
    { label: "One flat folder (no sorting)", value: "" },
  ];
  const FILE_PRESETS = [
    { label: "Keep the original name  (IMG_1234.jpg)", value: "{name}" },
    { label: "Date first  (2023-07-14_IMG_1234.jpg)", value: "{YYYY}-{MM}-{DD}_{name}" },
    { label: "Date and camera  (2023-07-14_Pixel 7 Pro_IMG_1234.jpg)", value: "{YYYY}-{MM}-{DD}_{camera}_{name}" },
  ];

  const pad = (n) => String(n).padStart(2, "0");

  function sanitize(s) {
    s = String(s).replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/\s+/g, " ").trim().replace(/[. ]+$/, "");
    if (s === "." || s === "..") return "";
    return s.slice(0, 100);
  }

  function value(token, ctx) {
    const d = ctx.date;
    switch (token) {
      case "YYYY": return String(d.y);
      case "YY": return pad(d.y % 100);
      case "MM": return pad(d.m);
      case "MMM": return MONTHS[d.m - 1].slice(0, 3);
      case "MMMM": return MONTHS[d.m - 1];
      case "DD": return pad(d.d || 1);
      case "Q": return String(Math.ceil(d.m / 3));
      case "decade": return Math.floor(d.y / 10) * 10 + "s";
      case "type": return ctx.isVideo ? "Videos" : "Photos";
      case "camera": return ctx.camera || "Unknown camera";
      case "name": return ctx.name || "";
      case "ext": return ctx.ext || "";
      default: return null;
    }
  }

  function expand(tpl, ctx) {
    return tpl.replace(/\{(\w+)\}/g, (m, t) => {
      if (DATE_TOKEN.test(m) && !ctx.date) return "";
      const v = value(t, ctx);
      return v === null ? m : v;
    });
  }

  // Names of any {tokens} that aren't recognised.
  function unknownTokens(tpl) {
    const bad = [];
    (tpl.match(/\{(\w*)\}/g) || []).forEach((m) => {
      const t = m.slice(1, -1);
      if (!(t in TOKENS) && !bad.includes(m)) bad.push(m);
    });
    return bad;
  }

  // Folder segments for a file, or null when the pattern needs a date the file doesn't have.
  function folderPath(tpl, ctx) {
    if (DATE_TOKEN.test(tpl) && !ctx.date) return null;
    return expand(tpl, ctx).split(/[\\/]/).map(sanitize).filter(Boolean);
  }

  // Final file name; always keeps the real extension.
  function fileName(tpl, original, ctx) {
    const dot = original.lastIndexOf(".");
    const base = dot > 0 ? original.slice(0, dot) : original;
    const ext = dot > 0 ? original.slice(dot + 1) : "";
    if (DATE_TOKEN.test(tpl) && !ctx.date) return original;
    let out = sanitize(expand(tpl, { ...ctx, name: base, ext }));
    if (!out) return original;
    if (ext && !out.toLowerCase().endsWith("." + ext.toLowerCase())) out += "." + ext;
    return out;
  }

  const api = { TOKENS, FOLDER_PRESETS, FILE_PRESETS, MONTHS, sanitize, expand, unknownTokens, folderPath, fileName };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.TemplateUtil = api;
})(typeof window !== "undefined" ? window : globalThis);
