# Store listing copy

Everything the Chrome Web Store, Firefox AMO and Edge Add-ons ask for, written
out so submission is copy-paste. Build the uploads with `npm run build:ext` —
the zips land in `dist-packages/`.

---

## Shared copy

**Name:** `Bokka — sprint porters`

**Summary / short description** (Chrome caps this at 132 characters):

> Pixel porters walk along the bottom of GitHub carrying your team's sprint points, and buckle when you overload them.

**Full description:**

> Bokka turns your sprint board into a tiny mountain expedition. Every teammate
> becomes a pixel-art porter walking along the bottom of the page, and every
> story point is cargo on their back. The lighter the load, the happier the
> walk; pile too much on and they trudge, tremble, and eventually collapse flat
> under the pile.
>
> ZERO SETUP. Open a GitHub project board and the porters appear. Bokka reads
> the board you are already looking at — assignees, story points from labels or
> project fields, and which column counts as Done. No token, no config, no
> account, and private projects work because you are already logged in.
>
> WHAT YOU GET
> • A live read on who is carrying too much, without opening a burndown chart
> • Instant reaction when you drag a card — the porter's load changes as you plan
> • Points from labels (sp:3, 5 pts, points/8, size-2) or the project's own
>   Estimate / Story Points / Size fields, including S/M/L sizes
> • A celebration jump when someone's ticket gets delivered
> • Board filters respected: slice-by and common filter queries narrow the
>   porters the way they narrow the board
> • Repo pages work too — Bokka infers owner/repo from the URL and reads issues
>   from the public GitHub API
>
> STAYS OUT OF YOUR WAY. The strip is click-through, so it never intercepts a
> click meant for the page. One small pill toggles the porters and shows the
> team's total points in transit. Alt+click it for settings: sprint capacity,
> sprint length, how many porters to show, or a filter down to specific logins.
>
> PRIVACY. Bokka has no backend, no analytics, and no remote code. Settings live
> in your browser. The only network requests it makes go to GitHub itself. An
> optional personal access token — needed only for private repos accessed
> through the API — is stored on your device and sent to nobody but GitHub.
>
> Bokka is an independent project and is not affiliated with or endorsed by
> GitHub.

**Category:** Developer Tools (Chrome / Edge) · Other, tagged `developer` and
`productivity` (AMO)

**Privacy policy URL:** host `PRIVACY.md` and link it — GitHub Pages on this
repo, or the rendered file on the repository, both count.

---

## Chrome Web Store

Dashboard: <https://chrome.google.com/webstore/devconsole> ($5 one-time
registration fee). Upload `dist-packages/bokka-chrome-<version>.zip`.

**Single purpose** (required field):

> Bokka visualizes how many sprint story points each teammate is carrying, by
> rendering an animated porter strip on GitHub project boards and repositories.

**Permission justifications** (required, one per permission):

| Field | Justification |
| --- | --- |
| `storage` | Stores the user's own settings — sprint capacity, sprint length, default points per issue, how many porters to show, an optional login filter, and an optional GitHub token — on the user's device. Nothing is transmitted. |
| `https://api.github.com/*` | Reads issues, their assignees and their labels for the repository the user is viewing, so each teammate's story-point load can be calculated. This is the only API Bokka calls. |
| Host access to `https://github.com/*` | The content script draws the porter strip on the page and reads the sprint data already displayed on the project board (assignees, status column, estimate fields). Bokka runs on no other site. |
| Remote code | Not used. All code ships inside the package; nothing is fetched or evaluated at runtime. |

**Data-use disclosures** — answer *no collection* for every category. The
GitHub token is stored locally and transmitted only to GitHub as authentication
for the user's own request, so it is not collected by the developer. Then tick
all three certification boxes (no unrelated sale, no unrelated use, no
creditworthiness use).

**Trader status:** required in the EU. Declaring "trader" publishes a contact
address and email on the listing; declaring "non-trader" is the right answer for
an unmonetized personal project.

**Assets:** `npm run shots` renders all of these to `screenshots/` at 1280×800,
the size both Chrome and Edge want. Upload in this order — the first one is the
card thumbnail:

| File | What it shows |
| --- | --- |
| `01-board-hero.png` | The whole team walking under a busy sprint board |
| `02-overloaded.png` | Three porters buckling — the pitch for the extension |
| `03-healthy-sprint.png` | The same board, plannable, for contrast |
| `04-load-ladder.png` | All seven states labelled, resting → flattened |
| `05-settings.png` | The options page |

The icon 128×128 is already generated into the package. A small promo tile
440×280 is still optional — only needed if the listing gets promoted.

Everything in the shots is fictional: the team is `noor`, `mira-k`, `tomasz`,
`priya-n`, `dcarter` and `wu-lin` on a made-up `acme-labs/platform` board, so no
real repository, project or person appears in the store listing.

---

## Firefox AMO

Dashboard: <https://addons.mozilla.org/developers/> (free). Upload
`dist-packages/bokka-firefox-<version>.zip`.

Pick a distribution mode:

- **Listed** — public on addons.mozilla.org, human-reviewed, auto-updates.
- **Unlisted (self-distribution)** — Mozilla signs an `.xpi` you host yourself.
  Installs permanently, no AMO listing, no `xpinstall.signatures.required`
  workaround for your users.

**Source code is mandatory.** `content.js` is an esbuild bundle, so AMO
classifies it as machine-generated and will reject the submission without the
source. Upload `dist-packages/bokka-source-<version>.zip` in the "Source code"
step, with these build instructions:

> Requires Node 20+. Run `npm install` then `npm run build:ext`. The Firefox
> package is the contents of `dist-extension-firefox/`, byte-identical to the
> uploaded zip — the build uses fixed timestamps so archives are reproducible.
> Build script: `scripts/build-extension.mjs`. No minifier is used; the bundler
> is esbuild, pinned via package-lock.json.

**Add-on ID:** `{c78c282b-ed96-4577-9b3f-d096dc986f07}` — permanent once AMO has
seen it. Change it *before* the first submission or never.

**Data collection:** the manifest already declares
`data_collection_permissions: { required: ['none'] }`, which must match what you
tick in the submission form: no data collected.

**License:** pick one (MIT is the usual choice) — AMO requires a license
selection for listed add-ons.

Before uploading:

```sh
npx web-ext lint --source-dir dist-extension-firefox
```

---

## Edge Add-ons

Dashboard: <https://partner.microsoft.com/dashboard/microsoftedge> (free).
Accepts `dist-packages/bokka-chrome-<version>.zip` unchanged and reuses all the
copy above. Review is typically slower than Chrome's; there is nothing extra to
prepare.

---

## Release checklist

1. [ ] Bump `version` in `package.json` (stores reject a re-used version)
2. [ ] `npm run build` — strict tsc + vite must pass
3. [ ] `npm run build:ext` — produces `dist-packages/`
4. [ ] `npx web-ext lint --source-dir dist-extension-firefox` — 0 errors
5. [ ] Load both unpacked builds once and check the strip on a real board
6. [ ] Privacy policy URL is live and reachable
7. [ ] Upload, fill the copy above, submit
8. [ ] Tag the release in git
