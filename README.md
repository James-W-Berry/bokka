# Bokka 歩荷

A pixel-art sprint-load visualizer. Every teammate is a **bokka** — one of Japan's
mountain porters who haul supplies to remote huts on wooden pack frames — and every
sprint point is cargo on their back. As load passes team capacity, the porter's
animations get more dramatic, all the way to being flattened under the pile.

## States

| Load vs capacity | State | What you see |
| --- | --- | --- |
| 0 | Resting | Standing easy, blinking |
| ≤ 1/3 | Warming up | Cheerful walk, a few crates |
| ≤ 2/3 | Steady pace | Taller stack, slight lean |
| ≤ 1× | Heavy load | Bent forward, walking stick, sweat, grimace |
| ≤ 1.5× | Overloaded! | Trembling, swaying tower, `!!`, slow trudge |
| > 1.5× | Flattened… | Face-down under a cargo mound, dizzy stars |
| sprint complete | Delivered! | Jumping celebration (manual mode) |

## Browser extension (the product)

The porters live at the bottom of the window while you work the sprint board —
they wander around, trudge slower as you pile tickets on them, collapse when
you overdo it, and celebrate when their issues get closed.

**Zero setup.** Bokka figures out the data source from the page you're on:

1. **Project board / table** (Projects v2) — two in-page strategies, no token,
   no config, private projects included (you're already logged in):
   - board-view DOM: cards, assignee avatars, estimates from label chips
     (`sp:3`) or estimate text; a Done/Closed/Shipped column counts as
     delivered; reacts within ~1s of dragging a card via a MutationObserver
   - embedded JSON data islands (the project's initial payload): covers table
     and roadmap views and virtualized boards; understands the Status field,
     number fields named Estimate/Story Points/Size, single-select sizes
     (S/M/L → points), and labels. Kept fresh by re-fetching the project's own
     internal items endpoint (same-origin, your session) every ~15s and after
     you interact, so Story Point edits land without a reload. The view's URL
     state is honored too: `sliceBy[value]` and common `filterQuery` predicates
     (`-is:pr`, `status:`/`-status:"X"`, `Type:`, iteration fields like
     `sprint:@next`/`@current`) filter the porters the way they filter the
     board; unknown predicates fail open rather than hiding anyone.
   If neither strategy can read a project page, the pill shows `歩荷 ?` —
   clicking it copies a structure fingerprint (element/test-id counts only, no
   ticket content) to paste into a bug report so scraping can be fixed.
2. **Repo pages** — infers `owner/repo` from the URL and uses the public REST
   API (a token is only ever needed here, for private repos, as an optional
   setting).
3. Anywhere else — the pill sits idle until you open a board or repo.

```sh
npm install
npm run build:ext
```

This produces two load-ready builds:

- **Chrome / Edge**: `chrome://extensions` → Developer mode → **Load unpacked**
  → `dist-extension/`
- **Firefox / Zen**: `about:debugging` → This Firefox/Zen → **Load Temporary
  Add-on** → `dist-extension-firefox/manifest.json`. Temporary add-ons are
  removed on restart; for a permanent install either set
  `xpinstall.signatures.required = false` in `about:config` (works in Firefox
  forks like Zen) or sign the zip via AMO self-distribution. The build is
  `web-ext lint` clean (0 errors, 0 warnings), needs Firefox ≥ 140.

The strip:

- shows the top-loaded porters (configurable count, or filter to specific logins
  via Alt+click on the pill → settings)
- is click-through (`pointer-events: none`) except for the 歩荷 pill, which
  toggles visibility and shows the team's total points in transit
- triggers a jumping celebration when a porter's cargo gets delivered (e.g. a
  card dragged to Done)

Board scraping caveats: selectors are heuristic (GitHub's board markup isn't a
public API), and very large boards that virtualize off-screen cards will only
count what's rendered.

## Web app

```sh
npm run dev
```

## GitHub mode (the MVP)

Point it at any repo (`owner/name`) and hit **Sync**:

- Every issue **assignee** becomes a porter; unassigned issues pile onto an
  "Unassigned" porter.
- Points are read from labels like `sp:3`, `5 pts`, `points/8`, `size-2`, or a
  bare `3` — unlabeled issues fall back to a configurable default.
- Open issues are cargo in transit; issues closed within the sprint window
  (default 14 days) count as delivered.
- Optional milestone filter and a personal access token for private repos /
  rate limits. The token never leaves the browser (localStorage).

Deep links work as live widgets: `/?repo=owner/name` auto-syncs on load.

## Manual mode

No integration needed — add porters, deal points with Fibonacci buttons, and hit
**Complete sprint** to deliver the cargo and watch the team celebrate.

## Architecture / roadmap

The renderer ([src/porter/porter.ts](src/porter/porter.ts)) is pure canvas 2D with
zero dependencies; the GitHub sync ([src/github.ts](src/github.ts)) is plain fetch.
Both are shared verbatim between the web app and the extension. Next targets:

1. **Desktop pet** — Tauri transparent always-on-top window, same renderer,
   porter walks along the taskbar
2. **Jira / Linear** — additional sync adapters behind the same `MemberLoad` shape
3. **Projects v2 Estimate field** — GraphQL adapter for teams that use the
   native estimate instead of point labels

## Dev checks

```sh
npm run build                 # strict tsc + vite
npx tsx test/sync-smoke.ts    # live GitHub sync smoke test
# visual gallery of all states:
npm run dev  →  /test/states.html
# extension strip over a fake board (live data, no extension install needed):
npm run dev  →  /test/strip.html
```
