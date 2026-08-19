// Bundles the browser extension into dist-extension/ (Chrome) and
// dist-extension-firefox/ (Firefox/Zen), and rasterizes the shared logo
// (src/porter/logo.ts) into the manifest icon PNGs.
// Uses esbuild, which ships as a dependency of vite.
import { build } from 'esbuild'
import { cpSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
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

const manifest = JSON.parse(readFileSync('extension/manifest.json', 'utf8'))
manifest.icons = Object.fromEntries(ICON_SIZES.map((s) => [String(s), `icon${s}.png`]))
writeFileSync('dist-extension/manifest.json', JSON.stringify(manifest, null, 2))

// Firefox variant: gecko id is required to load MV3, host permissions are
// user-granted there, and backgrounds run as event pages not service workers
const firefox = {
  ...manifest,
  background: { scripts: ['background.js'] },
  browser_specific_settings: {
    gecko: {
      id: 'bokka@rivet.work',
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
