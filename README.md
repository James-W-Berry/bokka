# Bokka

A pixel-art sprint-load visualizer. Every teammate is a **bokka** — a mountain
porter who hauls supplies to remote huts on a wooden pack frame — and every
sprint point is cargo on their back. As load passes team capacity, the porter's
animations get more dramatic, all the way to being flattened under the pile.

## Install

Bokka is being submitted to Firefox Add-ons; the install link lands here once
it clears review. Chrome and Edge follow after that. Until then, see
[build from source](#build-from-source) below.

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

## Browser extension

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
   If neither strategy can read a project page, the pill shows `?` — clicking
   it copies a structure fingerprint (element/test-id counts only, no ticket
   content). Send it to hellobokka@protonmail.com so board parsing can be
   fixed.
2. **Repo pages** — infers `owner/repo` from the URL and reads issues from the
   public REST API, unauthenticated. The extension has no field for a token or
   an account anywhere in its interface, so private repos are covered by the
   board strategies above rather than by the API. GitHub allows 60
   unauthenticated calls an hour, so this path polls at most once a minute and
   backs off exponentially to 30 minutes after an error — a rate-limited or
   missing repo is never retried in a loop.
3. Anywhere else — the pill sits idle until you open a board or repo.

### Build from source

```sh
npm install
npm run build:ext
```

Load the result unpacked — this is the development path; for everyday use,
install the signed build from the store instead.

- **Chrome / Edge**: `chrome://extensions` → Developer mode → **Load unpacked**
  → `dist-extension/`
- **Firefox / Zen**: `about:debugging` → This Firefox/Zen → **Load Temporary
  Add-on** → `dist-extension-firefox/manifest.json`. Temporary add-ons are
  removed when the browser restarts, which is why a store install is the better
  route once one exists. Needs Firefox 142 or newer.

The strip:

- shows the top-loaded porters (configurable count, or filter to specific logins
  via Alt+click on the pill → settings)
- is click-through (`pointer-events: none`) except for the Bokka pill, which
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

## GitHub mode

The web app's data source. Point it at any repo (`owner/name`) and hit **Sync**:

- Every issue **assignee** becomes a porter; unassigned issues pile onto an
  "Unassigned" porter.
- Points are read from labels like `sp:3`, `5 pts`, `points/8`, `size-2`, or a
  bare `3` — unlabeled issues fall back to a configurable default.
- Open issues are cargo in transit; issues closed within the sprint window
  (default 14 days) count as delivered.
- Optional milestone filter, and — in the web app only, not the extension — a
  personal access token for private repos or higher rate limits. The token is
  kept in `localStorage` and sent to nobody but GitHub.

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

## Packages

`npm run build:ext` also writes zips to `dist-packages/`: one per browser, plus
a source archive of the tree it was built from. Every archive uses fixed
timestamps, so rebuilding the same commit reproduces it byte for byte — anyone
can check a published package against this source.

## Dev checks

```sh
npm run build                 # strict tsc + vite
npx tsx test/sync-smoke.ts    # live GitHub sync smoke test
# visual gallery of all states:
npm run dev  →  /test/states.html
# extension strip over a fake board (live data, no extension install needed):
npm run dev  →  /test/strip.html
# store screenshots (1280x800) into screenshots/, fictional team, no network:
npm run shots
```

## Privacy

No backend, no analytics, no remote code, and no credential field anywhere in
the extension. Settings stay on your device, and the only network requests go to
GitHub itself. The manifest asks for one permission (`storage`) and one site
(a content script on `github.com`) — there is no `host_permissions` key, since
the unauthenticated `api.github.com` calls are already allowed by CORS. Full
detail in [PRIVACY.md](PRIVACY.md).

## Contact

hellobokka@protonmail.com

## License

MIT — see [LICENSE](LICENSE).
