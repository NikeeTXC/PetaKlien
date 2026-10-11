#!/usr/bin/env node
/**
 * PetaKlien release builder.
 *
 *   node scripts/build-release.js            verify, then write dist/PetaKlien-v<version>.zip
 *   node scripts/build-release.js --check    verify only
 *
 * Verify:
 *   - every file referenced by manifest.json exists (icons, popup, service worker,
 *     content scripts & CSS, web-accessible resources)
 *   - every <script src>, <link href> and <img src> in the extension pages exists
 *   - manifest, package.json and SCHEMA_VERSION carry the same version
 * The zip holds only what the extension needs (no tests, node_modules, docs).
 * No dependencies: the zip is written with Node's zlib.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ROOT = path.resolve(__dirname, "..");
const CHECK_ONLY = process.argv.includes("--check");

// What ships: everything under these paths, plus the manifest and licence
const INCLUDE = ["manifest.json", "LICENSE", "icons", "fonts", "libs", "src"];
const EXCLUDE = [/\.map$/i, /(^|\/)\.DS_Store$/, /(^|\/)Thumbs\.db$/i, /\.test\.js$/i];

const errors = [];
const rel = (p) => path.relative(ROOT, p).split(path.sep).join("/");
const exists = (p) => fs.existsSync(path.join(ROOT, p));

function requireFile(file, from) {
  if (!file || /^(https?:|data:|chrome:|#)/.test(file)) return;
  if (!exists(file)) errors.push(`Tidak ditemukan: ${file}  (dirujuk oleh ${from})`);
}

/** Expands a simple glob such as "icons/*" or "fonts/*.woff2". */
function globFiles(pattern) {
  const dir = path.posix.dirname(pattern);
  const base = path.posix.basename(pattern);
  const re = new RegExp("^" + base.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$");
  if (!exists(dir)) return [];
  return fs.readdirSync(path.join(ROOT, dir)).filter((f) => re.test(f)).map((f) => `${dir}/${f}`);
}

// ---------- 1. manifest references ----------
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
Object.values(manifest.icons || {}).forEach((f) => requireFile(f, "manifest.icons"));
const action = manifest.action || {};
Object.values(action.default_icon || {}).forEach((f) => requireFile(f, "manifest.action.default_icon"));
requireFile(action.default_popup, "manifest.action.default_popup");
requireFile(manifest.background && manifest.background.service_worker, "manifest.background");
(manifest.content_scripts || []).forEach((cs, i) => {
  (cs.js || []).forEach((f) => requireFile(f, `content_scripts[${i}].js`));
  (cs.css || []).forEach((f) => requireFile(f, `content_scripts[${i}].css`));
});
(manifest.web_accessible_resources || []).forEach((war) => {
  (war.resources || []).forEach((pattern) => {
    if (pattern.includes("*")) {
      if (!globFiles(pattern).length) errors.push(`web_accessible_resources "${pattern}" tidak cocok dengan file apa pun`);
    } else requireFile(pattern, "web_accessible_resources");
  });
});

// ---------- 2. files referenced by the extension pages ----------
function walk(dir) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  if (fs.statSync(abs).isFile()) return [dir];
  return fs.readdirSync(abs).flatMap((name) => walk(`${dir}/${name}`));
}
const shipped = INCLUDE.flatMap(walk).filter((f) => !EXCLUDE.some((re) => re.test(f))).sort();

for (const page of shipped.filter((f) => f.endsWith(".html"))) {
  const html = fs.readFileSync(path.join(ROOT, page), "utf8");
  for (const m of html.matchAll(/<(?:script|img)[^>]+src="([^"]+)"|<link[^>]+href="([^"]+)"/g)) {
    const ref = m[1] || m[2];
    if (/^(https?:|data:|chrome:|#)/.test(ref)) continue;
    requireFile(rel(path.resolve(path.join(ROOT, path.dirname(page)), ref)), page);
  }
}
// url(...) in stylesheets (fonts)
for (const css of shipped.filter((f) => f.endsWith(".css"))) {
  const text = fs.readFileSync(path.join(ROOT, css), "utf8");
  for (const m of text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) {
    const ref = m[1];
    if (/^(https?:|data:|chrome-extension:|#|__MSG_)/.test(ref)) continue;
    requireFile(rel(path.resolve(path.join(ROOT, path.dirname(css)), ref)), css);
  }
}

// ---------- 3. one version everywhere ----------
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const schemaMatch = fs.readFileSync(path.join(ROOT, "src/shared/lead-schema.js"), "utf8").match(/SCHEMA_VERSION = "([^"]+)"/);
const versions = { "manifest.json": manifest.version, "package.json": pkg.version, "SCHEMA_VERSION": schemaMatch && schemaMatch[1] };
if (new Set(Object.values(versions)).size !== 1) {
  errors.push("Versi tidak sama: " + Object.entries(versions).map(([k, v]) => `${k}=${v}`).join(", "));
}

if (errors.length) {
  console.error(`\n✗ Rilis dibatalkan, ${errors.length} masalah:\n`);
  errors.forEach((e) => console.error("  - " + e));
  console.error("");
  process.exit(1);
}
console.log(`✓ Semua file yang dirujuk ada (${shipped.length} file), versi ${manifest.version} konsisten.`);
if (CHECK_ONLY) process.exit(0);

// ---------- 4. zip ----------
const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function dosTime(d) {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  };
}

const local = [];
const central = [];
let offset = 0;
for (const file of shipped) {
  const data = fs.readFileSync(path.join(ROOT, file));
  const deflated = zlib.deflateRawSync(data, { level: 9 });
  const useDeflate = deflated.length < data.length;
  const body = useDeflate ? deflated : data;
  const name = Buffer.from(file, "utf8");
  const crc = crc32(data);
  const { time, date } = dosTime(fs.statSync(path.join(ROOT, file)).mtime);

  const lh = Buffer.alloc(30);
  lh.writeUInt32LE(0x04034b50, 0);
  lh.writeUInt16LE(20, 4);
  lh.writeUInt16LE(0x0800, 6); // UTF-8 names
  lh.writeUInt16LE(useDeflate ? 8 : 0, 8);
  lh.writeUInt16LE(time, 10);
  lh.writeUInt16LE(date, 12);
  lh.writeUInt32LE(crc, 14);
  lh.writeUInt32LE(body.length, 18);
  lh.writeUInt32LE(data.length, 22);
  lh.writeUInt16LE(name.length, 26);
  local.push(lh, name, body);

  const ch = Buffer.alloc(46);
  ch.writeUInt32LE(0x02014b50, 0);
  ch.writeUInt16LE(20, 4);
  ch.writeUInt16LE(20, 6);
  ch.writeUInt16LE(0x0800, 8);
  ch.writeUInt16LE(useDeflate ? 8 : 0, 10);
  ch.writeUInt16LE(time, 12);
  ch.writeUInt16LE(date, 14);
  ch.writeUInt32LE(crc, 16);
  ch.writeUInt32LE(body.length, 20);
  ch.writeUInt32LE(data.length, 24);
  ch.writeUInt16LE(name.length, 28);
  ch.writeUInt32LE(offset, 42);
  central.push(ch, name);

  offset += lh.length + name.length + body.length;
}
const centralBuf = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(shipped.length, 8);
end.writeUInt16LE(shipped.length, 10);
end.writeUInt32LE(centralBuf.length, 12);
end.writeUInt32LE(offset, 16);

const outDir = path.join(ROOT, "dist");
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `PetaKlien-v${manifest.version}.zip`);
fs.writeFileSync(outFile, Buffer.concat([...local, centralBuf, end]));
console.log(`✓ ${rel(outFile)} (${(fs.statSync(outFile).size / 1024).toFixed(0)} KB)`);
