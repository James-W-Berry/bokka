// Bundles the browser extension into dist-extension/ (Chrome) and
// dist-extension-firefox/ (Firefox/Zen), and rasterizes the shared logo
// (src/porter/logo.ts) into the manifest icon PNGs.
// Uses esbuild, which ships as a dependency of vite.
import { build } from 'esbuild'
import { cpSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { deflateSync, deflateRawSync } from 'node:zlib'
import { pathToFileURL } from 'node:url'

const targets = [
  { dir: 'dist-extension', note: 'Chrome/Edge — chrome://extensions → Load unpacked' },
  { dir: 'dist-extension-firefox', note: 'Firefox/Zen — about:debugging → Load Temporary Add-on' },
]

for (const t of targets) mkdirSync(t.dir, { recursive: true })

await build({
  entryPoints: ['extension/content.ts', 'extension/options.ts', 'extension/background.ts'],
  bundle: true,
  format: 'iife',
  target: ['chrome110', 'firefox121'],
  outdir: 'dist-extension',
  logLevel: 'info',
})

// ---- icons: rasterize the logo rects into PNGs ---------------------------

await build({
  entryPoints: ['src/porter/logo.ts'],
  bundle: true,
  format: 'esm',
  outfile: 'dist-extension/.logo.tmp.mjs',
  logLevel: 'silent',
})
const { LOGO_RECTS, LOGO_SIZE } = await import(pathToFileURL('dist-extension/.logo.tmp.mjs'))
rmSync('dist-extension/.logo.tmp.mjs')

function crc32(buf) {
  let c = ~0
  for (const b of buf) {
    c ^= b
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}

function chunk(type, data) {
  const t = Buffer.from(type, 'ascii')
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])))
  return Buffer.concat([len, t, data, crc])
}

function encodePNG(size, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  const stride = size * 4
  const raw = Buffer.alloc(size * (stride + 1))
  for (let y = 0; y < size; y++) {
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

function renderIcon(size) {
  const scale = Math.max(1, Math.floor(size / LOGO_SIZE))
  const off = Math.floor((size - LOGO_SIZE * scale) / 2)
  const rgba = Buffer.alloc(size * size * 4) // transparent background
  for (const [x, y, w, h, color] of LOGO_RECTS) {
    const r = parseInt(color.slice(1, 3), 16)
    const g = parseInt(color.slice(3, 5), 16)
    const b = parseInt(color.slice(5, 7), 16)
    for (let py = y * scale; py < (y + h) * scale; py++) {
      for (let px = x * scale; px < (x + w) * scale; px++) {
        const i = ((py + off) * size + px + off) * 4
        rgba[i] = r
        rgba[i + 1] = g
        rgba[i + 2] = b
        rgba[i + 3] = 255
      }
    }
  }
  return encodePNG(size, rgba)
}

const ICON_SIZES = [16, 32, 48, 128]
for (const size of ICON_SIZES) {
  writeFileSync(`dist-extension/icon${size}.png`, renderIcon(size))
}

// ---- manifests ------------------------------------------------------------

// package.json is the single source of truth for the version. Both stores
// reject an upload whose version already exists, so it gets bumped in one
// place and stamped into both manifests here.
const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
if (!/^\d+(\.\d+){0,3}$/.test(pkg.version)) {
  throw new Error(
    `package.json version "${pkg.version}" is not a valid extension version ` +
      '(1-4 dot-separated integers, no pre-release suffix)',
  )
}

const manifest = JSON.parse(readFileSync('extension/manifest.json', 'utf8'))
manifest.version = pkg.version
manifest.icons = Object.fromEntries(ICON_SIZES.map((s) => [String(s), `icon${s}.png`]))
writeFileSync('dist-extension/manifest.json', JSON.stringify(manifest, null, 2))

// Firefox variant: gecko id is required to load MV3, host permissions are
// user-granted there, and backgrounds run as event pages not service workers.
// The id is permanent once AMO has seen it — do not change it after publishing.
const firefox = {
  ...manifest,
  background: { scripts: ['background.js'] },
  browser_specific_settings: {
    gecko: {
      id: '{c78c282b-ed96-4577-9b3f-d096dc986f07}',
      strict_min_version: '140.0',
      data_collection_permissions: { required: ['none'] },
    },
    gecko_android: { strict_min_version: '142.0' },
  },
}
writeFileSync('dist-extension-firefox/manifest.json', JSON.stringify(firefox, null, 2))

for (const t of targets) {
  if (t.dir !== 'dist-extension') {
    const files = ['content.js', 'options.js', 'background.js', ...ICON_SIZES.map((s) => `icon${s}.png`)]
    for (const f of files) cpSync(`dist-extension/${f}`, `${t.dir}/${f}`)
  }
  cpSync('extension/options.html', `${t.dir}/options.html`)
  console.log(`${t.dir}/ ready — ${t.note}`)
}

// ---- store packages -------------------------------------------------------
// Chrome, Edge and AMO all take a plain zip with manifest.json at the root.
// Hand-rolled like the PNG encoder above so the build stays dependency-free;
// fixed DOS timestamps make the archives byte-reproducible across builds.

const DOS_TIME = 0 // 00:00:00
const DOS_DATE = 0x21 // 1980-01-01, the DOS epoch

function collectFiles(dir, prefix = '', skip = () => false) {
  const out = []
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))
  for (const e of entries) {
    if (e.name.startsWith('.') || skip(prefix + e.name)) continue
    if (e.isDirectory()) out.push(...collectFiles(`${dir}/${e.name}`, `${prefix}${e.name}/`, skip))
    else if (e.isFile()) out.push({ name: prefix + e.name, data: readFileSync(`${dir}/${e.name}`) })
  }
  return out
}

function writeZip(outfile, files) {
  const locals = []
  const central = []
  let offset = 0
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8')
    const data = deflateRawSync(f.data, { level: 9 })
    const crc = crc32(f.data)

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4) // version needed to extract
    local.writeUInt16LE(0, 6) // flags
    local.writeUInt16LE(8, 8) // deflate
    local.writeUInt16LE(DOS_TIME, 10)
    local.writeUInt16LE(DOS_DATE, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(f.data.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28) // extra field length
    locals.push(local, name, data)

    const cd = Buffer.alloc(46)
    cd.writeUInt32LE(0x02014b50, 0)
    cd.writeUInt16LE(20, 4) // version made by
    cd.writeUInt16LE(20, 6) // version needed to extract
    cd.writeUInt16LE(0, 8)
    cd.writeUInt16LE(8, 10)
    cd.writeUInt16LE(DOS_TIME, 12)
    cd.writeUInt16LE(DOS_DATE, 14)
    cd.writeUInt32LE(crc, 16)
    cd.writeUInt32LE(data.length, 20)
    cd.writeUInt32LE(f.data.length, 24)
    cd.writeUInt16LE(name.length, 28)
    cd.writeUInt16LE(0, 30) // extra
    cd.writeUInt16LE(0, 32) // comment
    cd.writeUInt16LE(0, 34) // disk number
    cd.writeUInt16LE(0, 36) // internal attrs
    cd.writeUInt32LE((0o100644 << 16) >>> 0, 38) // external attrs: regular file, 0644
    cd.writeUInt32LE(offset, 42)
    central.push(cd, name)

    offset += local.length + name.length + data.length
  }

  const cdBuf = Buffer.concat(central)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4) // this disk
  eocd.writeUInt16LE(0, 6) // disk with central directory
  eocd.writeUInt16LE(files.length, 8)
  eocd.writeUInt16LE(files.length, 10)
  eocd.writeUInt32LE(cdBuf.length, 12)
  eocd.writeUInt32LE(offset, 16)
  eocd.writeUInt16LE(0, 20) // comment length
  writeFileSync(outfile, Buffer.concat([...locals, cdBuf, eocd]))
  return files.length
}

const PKG_DIR = 'dist-packages'
rmSync(PKG_DIR, { recursive: true, force: true })
mkdirSync(PKG_DIR, { recursive: true })

for (const [dir, label] of [
  ['dist-extension', 'chrome'],
  ['dist-extension-firefox', 'firefox'],
]) {
  const out = `${PKG_DIR}/bokka-${label}-${pkg.version}.zip`
  const n = writeZip(out, collectFiles(dir))
  console.log(`${out} — ${n} files`)
}

// AMO requires the source for any bundled/machine-generated script, which
// content.js is (esbuild). Reviewers rebuild from this zip; see README.
const SOURCE_SKIP = new Set([
  'node_modules',
  'dist',
  'dist-extension',
  'dist-extension-firefox',
  'screenshots',
  PKG_DIR,
])
const sourceOut = `${PKG_DIR}/bokka-source-${pkg.version}.zip`
const sourceFiles = collectFiles('.', '', (rel) => SOURCE_SKIP.has(rel.split('/')[0]))
console.log(`${sourceOut} — ${writeZip(sourceOut, sourceFiles)} files (AMO source upload)`)
