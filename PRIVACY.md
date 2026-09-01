# Bokka — Privacy Policy

_Last updated: 2026-08-31_

**Bokka does not collect, transmit, sell, or share any personal data.** It has no
backend, no analytics, no telemetry, no advertising, and no remote code. Every
piece of data it touches stays on your own machine or goes directly to GitHub.

## What Bokka stores

Bokka stores your settings in your browser's extension storage
(`chrome.storage.local`), on your device only:

| Setting | Why |
| --- | --- |
| Sprint capacity, sprint length, default points per issue | How heavy a porter's load looks |
| Porter count and optional login filter | Which teammates to show |
| Hidden/shown state | Remembers whether you dismissed the strip |

This data is never uploaded anywhere, and it is removed when you uninstall the
extension.

## What Bokka reads

On `github.com` pages only, Bokka reads the sprint information already displayed
in your browser: issue assignees, issue state, and story-point values from
labels or project fields. It does this in two ways:

1. **Reading the page you are already looking at** — project board cards, their
   assignees and estimates, and the project data GitHub embeds in the page.
2. **Requesting the same data GitHub's own page requests**, using your existing
   logged-in session (`credentials: 'same-origin'`), so board edits show up
   without a reload.

To find a point value, Bokka scans the text of a card, which means an issue
title can pass through that check. Nothing of the sort is kept: what it retains
per teammate is a login, an avatar URL, and four numbers — open points, open
issues, delivered points, delivered issues. Issue titles, descriptions and
comments are never stored, and never leave your browser. Bokka does not run on
any site other than `github.com`.

## What Bokka sends, and to whom

Bokka sends network requests to exactly two destinations, both of them GitHub:

- **`https://api.github.com`** — to list issues for a repository, unauthenticated.
  Bokka has no field anywhere in its interface for a GitHub token or password,
  never asks for one, and sends no `Authorization` header on any request.
  GitHub serves this API with `Access-Control-Allow-Origin: *`, so Bokka reaches
  it under ordinary CORS and asks for no host permission to do so.
- **`https://github.com`** — same-origin requests to the project data endpoint
  that the page you are viewing already uses, authenticated by your existing
  browser session.

There is no third destination. No data is sent to the author of this extension
or to any other party.

## Diagnostics

If Bokka cannot read a project board, you can click the pill to copy a
**structure fingerprint** — counts of page elements and test IDs, plus the
logins and point totals it managed to parse. It never includes issue titles or
other ticket content. This is copied to your clipboard by your explicit action
and is not transmitted anywhere; sending it to hellobokka@protonmail.com is
entirely your choice.

## Permissions

Bokka requests one permission and one site.

| Permission | Why it is needed |
| --- | --- |
| `storage` | Save your settings on your device |
| Content script on `https://github.com/*` | Draw the porter strip and read sprint data from the board you are viewing |

It requests no host permission for `api.github.com`: those calls are
unauthenticated and CORS already allows them, so there is nothing to grant.

## Changes

Any change to this policy will be published in this file alongside a new
extension version. Questions or concerns: hellobokka@protonmail.com.
