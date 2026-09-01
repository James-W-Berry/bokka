// Renders the store screenshots into screenshots/ at the 1280x800 slot both
// Chrome and Edge expect. Boots vite, drives headless Chrome once per shot,
// shuts vite down. Fixed seeds and static poses keep the output reproducible.
import { spawn } from 'node:child_process'
import { mkdirSync, existsSync, rmSync, statSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'
import { resolve } from 'node:path'

const CHROME =
  process.env.CHROME_BIN ??
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
if (!existsSync(CHROME)) {
  throw new Error(`Chrome not found at ${CHROME} — set CHROME_BIN`)
}

const PORT = 5199
const OUT = 'screenshots'
mkdirSync(OUT, { recursive: true })

const SHOTS = [
  ['01-board-hero.png', `http://localhost:${PORT}/test/shots.html?set=hero`],
  ['02-overloaded.png', `http://localhost:${PORT}/test/shots.html?set=overload`],
  ['03-healthy-sprint.png', `http://localhost:${PORT}/test/shots.html?set=healthy`],
  ['04-load-ladder.png', `http://localhost:${PORT}/test/shots-states.html`],
  // the options page is a built artifact, so it is shot straight off disk
  ['05-settings.png', `file://${resolve('dist-extension/options.html')}`],
]

const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
  stdio: ['ignore', 'pipe', 'inherit'],
})
try {
  await new Promise((ok, fail) => {
    const timer = setTimeout(() => fail(new Error('vite did not start in 30s')), 30_000)
    vite.stdout.on('data', (b) => {
      if (b.toString().includes('ready in')) {
        clearTimeout(timer)
        ok()
      }
    })
    vite.on('exit', (c) => fail(new Error(`vite exited early (${c})`)))
  })
  await sleep(500) // let the first module graph warm up

  for (const [name, url] of SHOTS) {
    const out = resolve(OUT, name)
    rmSync(out, { force: true })
    // headless Chrome writes the PNG and then keeps running, so the shot is
    // done when the file stops growing — waiting on exit would hang forever
    const child = spawn(
      CHROME,
      [
        '--headless=new',
        '--disable-gpu',
        '--hide-scrollbars',
        '--force-device-scale-factor=1',
        '--window-size=1280,800',
        '--virtual-time-budget=5000',
        '--no-first-run',
        '--no-default-browser-check',
        `--user-data-dir=${resolve('node_modules/.cache/bokka-shots', name)}`,
        `--screenshot=${out}`,
        url,
      ],
      { stdio: 'ignore' },
    )
    try {
      let last = -1
      for (let i = 0; i < 60; i++) {
        await sleep(500)
        const size = existsSync(out) ? statSync(out).size : 0
        if (size > 0 && size === last) break
        last = size
      }
      if (last <= 0) throw new Error(`no screenshot produced for ${name}`)
    } finally {
      child.kill('SIGKILL')
    }
    console.log(`${OUT}/${name} — ${(statSync(out).size / 1024).toFixed(0)} kB`)
  }
} finally {
  vite.kill()
}
