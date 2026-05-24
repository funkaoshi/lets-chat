# Modernization status

Living doc tracking the rolling effort to bring this ~2014 codebase forward.
Updated as work lands; sections move from "Open" to "Shipped" as commits go in.

## Shipped

| SHA | What |
|-----|------|
| _pending_ | express.oi → Express 5 + Socket.IO 4 via in-tree compat layer; passport.socketio replaced |
| `64f29db` | BS5 visual fixes: 18-col grid override, `:root` token cascade, `.hide` shim, modal stacking-context |
| `c62dee1` | Bootstrap 3 → 5 (prebuilt CSS + modal shim, ~8k LOC of vendored LESS gone) |
| `be515ee` | Docker dev flow: bind-mount + `node --watch` override, bootstrap.sh first-run helper |
| `f9c263c` | Phase 1: drop XMPP, Multer 2, ESLint 9 flat config, GH Actions CI, fail-fast on default cookie secret |
| `2bde695` | Expand .env.example: cookie secret, db URI, plugin creds |
| `515b5f8` | Load Docker secrets from optional docker/.env |
| `5105618` | Move client libs from vendor/ to npm, modernize versions |
| `dd86552` | Cull build-time CVE chain: remove Grunt/Bower + mongoose-validate |
| `2a78a87` | Modernize Let's Chat to run on Node 20 + MongoDB 7 in Docker |

### express.oi → Express 5 + Socket.IO 4

The biggest server-side unlock, done via an in-tree compat layer rather
than a controller-by-controller rewrite. Same trade-off pattern as the
sweetalert / bootstrap-modal shims.

- **In-tree replacement for `express.oi`.** New
  [app/express-oi-compat.js](app/express-oi-compat.js) (~150 lines)
  reimplements the dual-dispatch trick on top of native Express 5 +
  Socket.IO 4. Exposes the same surface (`app.io.route(name, handler)`,
  `app.io.session(mw)`, `req.io.route(name)`, `req.param()`,
  `req.body || req.data` straddling) that the 12 controllers and 8
  io.route blocks rely on -- zero controller code changed.
- **Auth bridge rewritten.** `passport.socketio` (last release 2017,
  incompatible with Socket.IO 4) is gone. New in
  [app/auth/index.js](app/auth/index.js): a Socket.IO middleware that
  reads `socket.request.session.passport.user` (populated by
  `io.engine.use(sessionMiddleware)` in the compat layer) and runs the
  existing `passport.deserializeUser` to attach `socket.request.user`.
  Bearer-token path (?token=...) preserved.
- **Express 4 → 5** (`^5.1.0`) and **Socket.IO 1 → 4** (`^4.7.5`) bumps.
  Client-side `socket.io-client` bumped 1.7.4 → ^4.7.5 to match.
- **Socket.IO 4 breaking-change fix.** `socket.conn` was a writable
  property in Socket.IO 1.x; the project hung its presence-tracking
  Connection object off it. In 4.x it's a read-only getter returning
  the engine.io Client. Renamed to `socket.lcbConn` in
  [app/controllers/presence.js](app/controllers/presence.js) and the
  two read sites in [app/controllers/rooms.js](app/controllers/rooms.js).
- **Socket.IO 4 client breaking-change fix.** The `reconnect` lifecycle
  event moved off the socket onto the Manager (`socket.io.on('reconnect',
  ...)`); fixed in [media/js/client.js](media/js/client.js).
- **`req.param()` deprecation.** Express 5 removed `req.param()`; the
  compat layer reinstates it on both HTTP and socket-routed requests,
  so the ~30 call sites in controllers (`req.param('room')` etc.) keep
  working unchanged.
- **`extras` controller require fix.** Changed `require('express.oi')`
  to `require('express')` for the `express.static` it pulled in.

CVE delta: 34 → **19** total (3 crit → 3, 14 high → 7, 13 mod → 9,
3 low → 0). 15 vulns lifted, mostly the `express` 4 and `socket.io` 1
transitive chains.

Verification: HTTP register/login/whoami via curl, then Socket.IO
handshake from inside the container with the session cookie + emit
`account:whoami`, `rooms:list`, `extras:emotes:list` — all return
correct payloads. Backbone-side `npm test` clean.

### Phase 1 cleanup (this batch)

- **XMPP removed.** `app/xmpp/` (events + msg-processors), `node-xmpp-server`
  dep, `xmpp.*` config tree in [defaults.yml](defaults.yml),
  `addXmppConfHost` step in [app/config.js](app/config.js), the
  XMPP-active-sessions check in
  [app/core/account.js](app/core/account.js), and the `xmpp.html` modal +
  its include in [templates/chat.html](templates/chat.html). Feature was
  disabled by default and the native build was fragile.
- **Multer 1 → 2.** Single use site in
  [app/controllers/files.js](app/controllers/files.js) (`multer.diskStorage({}).any()`)
  is API-compatible.
- **ESLint 8 → 9 flat config.** `.eslintrc` + `.eslintignore` →
  [eslint.config.js](eslint.config.js); added `globals` dev dep.
- **GitHub Actions CI.** `.travis.yml` (long dead) replaced by
  [.github/workflows/ci.yml](.github/workflows/ci.yml) running `npm test`
  + a docker build sanity check on PRs.
- **Fail-fast on default cookie secret.** [app.js](app.js) refuses to boot
  if `secrets.cookie` is unset or still `"secretsauce"`. Default flipped
  to empty in [defaults.yml](defaults.yml) with a guidance comment;
  [docker/.env.example](docker/.env.example) updated to flag it as
  required.

### Bootstrap 3 → 5

The big visible-but-mechanical refactor. Done as a single pass across
~12 templates + the LESS pipeline.

- **Pipeline.** `bootstrap` bumped 3.4.1 → 5.3.3; `@popperjs/core` added.
  The vendored BS3 LESS tree (42 files under
  `media/less/vendor/bootstrap/`) is gone. [media/less/vendor.less](media/less/vendor.less)
  now `@import (inline)`'s the prebuilt
  `node_modules/bootstrap/dist/css/bootstrap.css` instead of compiling
  from source. Selectize integration swapped from `bootstrap3` →
  `bootstrap5`. The vendor bundle still compiles via connect-assets LESS
  — no SCSS transformer added.
- **Design tokens.** New [media/less/lcb-tokens.less](media/less/lcb-tokens.less)
  loads first, overriding BS5's `:root` CSS custom properties (`--bs-primary`,
  `--bs-columns: 18` to preserve the custom 18-col grid, brand color
  palette). Same file also defines a few legacy LESS variables
  (`@screen-xs-max`, `@brand-*`) and small mixin shims
  (`.text-overflow`, `.size`, `.square`, `.progress-bar-variant`) that
  the existing `media/less/style/**` still references.
- **Modal JS shim.** BS5 dropped jQuery plugin support, but 14
  `$el.modal('show'/'hide')` call sites across the Backbone views still
  rely on it. New [media/js/legacy/bootstrap-modal-shim.js](media/js/legacy/bootstrap-modal-shim.js)
  (~30 lines) re-attaches `$.fn.modal` and delegates to BS5's vanilla
  `bootstrap.Modal.getOrCreateInstance(...)`. Mirrors the
  sweetalert-shim pattern already accepted. The shim file goes away
  when jQuery/Backbone do.
- **Template sweep.** Across all 12 templates + 8 Handlebars partials:
  `data-toggle`/`data-dismiss`/`data-target` → `data-bs-*`;
  `btn-default` → `btn-secondary`; `pull-left`/`pull-right` →
  `float-start`/`float-end`; `hidden-xs` → `d-none d-sm-inline-block`
  (preserving intent); `input-group-addon` span → `input-group-text`
  (BS5 dropped the wrapping div); `class="close" &times;` →
  `<button class="btn-close">`; `form-horizontal` removed (5 templates)
  with each row rebuilt as `.row + .col-form-label + .col-*`;
  `col-sm-offset-2` → `offset-sm-2`; checkbox/radio markup
  reworked to BS5's `.form-check`/`.form-check-input`/`.form-check-label`;
  `dropdown-menu-right` → `dropdown-menu-end`; `li class="divider"` →
  `<li><hr class="dropdown-divider"></li>`; dropdown items gained
  `.dropdown-item`.
- **Daterangepicker.** Stale `./media/js/vendor/...-bs3.css` link in
  [transcript.html](templates/transcript.html) (broken since the
  vendor dir was dropped a few commits ago) repointed at the
  node_modules copy via connect-assets's `/media/dist/` mount.
- **Loaded JS.** [media/js/vendor.js](media/js/vendor.js) now requires
  `bootstrap.bundle.js` (includes Popper) and the modal shim, in that
  order.

Net diff: ~8000 LOC removed (vendored BS3 LESS), ~130 LOC added.

Programmatic verification: `npm test` clean; vendor.css compiles with
BS5 selectors present; all asset URLs return 200; templates contain
zero BS3-removed class names. Browser-side smoke pass still on the
maintainer to walk — see the verification baseline at the bottom.

### BS5 visual fixes uncovered during smoke test

Four issues surfaced once the page actually rendered in a browser:

- **All room panes visible at once.** BS3 had a `.hide` utility class
  that templates and Backbone views toggled to switch panes; BS4 renamed
  it to `.d-none`. Restored a one-line `.hide { display: none !important }`
  shim in [lcb-overrides.less](media/less/lcb-overrides.less) rather
  than touch every call site.
- **Brand colors not applied.** `:root` overrides for `--bs-primary`
  etc. were loaded BEFORE bootstrap.css, so BS5's defaults won the
  cascade. Split [lcb-tokens.less](media/less/lcb-tokens.less) into a
  compile-time half (LESS variables + mixin shims, still loaded first)
  and the new [lcb-overrides.less](media/less/lcb-overrides.less) that
  carries the `:root` block and loads AFTER bootstrap.css.
- **18-column grid broken in horizontal forms.** Setting
  `--bs-columns: 18` only affects auto-layout `.col`; BS5's prebuilt
  `.col-sm-N` classes hardcode 12-col math. A row of `.col-sm-6 +
  .col-sm-11` was wrapping to two lines because 50% + 92% > 100%.
  Added explicit `.col-sm-{6,9,10,11,14,18}` rules using
  `calc(N/18 * 100%)` at the `sm+` breakpoint to override BS5's
  defaults.
- **Modal backdrop blocked modals (the big one).** `.lcb-client` uses
  `position: fixed`, which creates a CSS stacking context. BS5 appends
  `.modal-backdrop` to `<body>` (z-index 1050), but the `.modal`
  element stays inside `.lcb-client`. The body-level backdrop ended up
  painting above everything inside `.lcb-client`, so modals looked
  dimmed and were unclickable. Reparenting the modal to body (the
  obvious fix) would have broken Backbone's delegated event handlers on
  RoomView -- the room-edit modal lives inside `.lcb-room` so
  `.submit-edit-room`/`.archive-room` clicks rely on bubbling through
  it. CSS-only fix instead: bump `.lcb-client` z-index above the
  backdrop (1060), hide the now-pointless body-level backdrop, and
  synthesize a replacement backdrop inside `.lcb-client` via a
  `::before` pseudo on `.lcb-client:has(.modal.show)`. Requires `:has()`
  selector support (Safari 15.4+, Chrome 105+, Firefox 121+).

### Docker dev flow

- [docker/docker-compose.dev.yml](docker/docker-compose.dev.yml) layered
  on top of the base compose: bind-mounts the repo into the container and
  runs the app under `node --watch` (Node 20 built-in, no extra dep).
  Client edits show on browser refresh, server edits trigger an automatic
  process restart. Anonymous volume shadows `/usr/src/app/node_modules`
  so Linux-built modules win over the host's (matters on macOS).
- [docker/bootstrap.sh](docker/bootstrap.sh): first-run helper that
  creates `docker/.env` from the example and generates
  `LCB_SECRETS_COOKIE` via `openssl rand -hex 32`. Idempotent — safe to
  re-run, never overwrites existing values.
- [docker/README.md](docker/README.md) and [CLAUDE.md](CLAUDE.md)
  rewritten to lead with the dev flow and keep the prod-ish flavor as a
  fallback.

### Server-side

- Node engine floor bumped to `>=20`; the app runs under `node:20-bookworm-slim`
  in Docker against `mongo:7`.
- Mongoose 4 → 6 (promise-based connect, `MongoStore.create()`).
- Helmet 2 → 7 (single config object with `directives`).
- js-yaml 3 → 4 (`safeLoad` → `load`).
- connect-mongo 1 → 5, async 2 → 3, passport, uuid, nunjucks all current.
- `new Buffer()` → `Buffer.from()`.
- `mongoose-validate` (unmaintained since 2014, locked `validator` to a
  vulnerable version) replaced with a Mongoose `match:` regex.

### Build / packaging

- Grunt + bower + grunt-bower-task removed (devDeps + Gruntfile.js + bower.json
  deleted). They only existed to re-fetch the client vendor files that were
  already committed.
- `media/js/vendor/` (45 files, ~64K lines, 2.1 MB) deleted.
- 13 client libs moved to `package.json` and served via connect-assets out
  of `node_modules/`.
- 4 orphan libs (JVFloat, backbone.keys, atwho, desktop-notifications)
  relocated to `media/js/legacy/`.

### Client-side version bumps

- jQuery 2.1.3 → 3.7.1
- Backbone 1.1.2 → 1.6.1
- Handlebars 2.0 → 4.7.9
- lodash 2.4.1 → 4.18.1
- Bootstrap 3.1.1 → 3.4.1 (intentionally pinned to last 3.x)
- moment 2.8 → 2.30, dropzone 4 → 5.9, selectize fork 0.15.2,
  store.js → store2, jquery-validation 1.22, favico.js 0.3.10
- sweetalert v1 → **sweetalert2 v11** with a small shim
  ([media/js/legacy/sweetalert-shim.js](media/js/legacy/sweetalert-shim.js))
  that maps the legacy `swal('title','text','type')` and
  `swal({...}, callback)` signatures onto sweetalert2's Promise API,
  so the 22 existing call sites don't need to change.
- socket.io-client **pinned at ^1.7.4** — must match the server's
  Socket.IO 1.x (required by `express.oi` 0.0.21).

### Breaking-change fixes uncovered during smoke test

- lodash 4 dropped the `thisArg` parameter that lodash 2 supported on
  `_.each`/`_.map`. Four sites silently lost `this` context — fixed via
  `_.bind(fn, this)` in [media/js/client.js](media/js/client.js),
  [media/js/views/upload.js](media/js/views/upload.js), and
  [media/js/views/room.js](media/js/views/room.js).
- Same pattern inside [media/js/legacy/backbone.keys.js](media/js/legacy/backbone.keys.js).
- lodash 4 `_.contains` → `_.includes`, `_.all` → `_.every` (both hit in
  backbone.keys).
- jQuery 3 removed `.unbind()` — replaced with `.off()` in
  [media/js/views/room.js](media/js/views/room.js).
- jQuery 3 removed `.andSelf()` (renamed to `.addBack()` in 1.8) — fixed in
  `toggleSidebar` in [media/js/views/room.js](media/js/views/room.js).
  The "back to rooms" button was throwing on join.
- **The big one:** RoomView render did `this.$el = $(template(...))` instead
  of `this.setElement(...)`. Backbone delegated handlers (keypress to send a
  message, click `.show-edit-room`, etc.) stayed bound to the empty `<div>`
  Backbone created at construction, while the rendered content lived on a
  different DOM node. Send / edit-room all silently no-op'd until `setElement`
  re-delegated events to the actual rendered element.

### Docker / config

- `docker/Dockerfile` rewritten on node:20-bookworm-slim, runs as `node` user,
  uses `npm ci --legacy-peer-deps`.
- `docker/docker-compose.yml` uses modern syntax, explicit project name
  `lets-chat` (avoids collision with other compose projects), named volumes
  for Mongo data and uploads, optional `env_file: docker/.env`.
- `docker/Dockerfile.dockerignore` keeps host `node_modules` out of the build
  context (BuildKit-native per-Dockerfile dockerignore).
- `docker/.env` gitignored; [docker/.env.example](docker/.env.example) committed
  and documents `LCB_SECRETS_COOKIE`, `LCB_GIPHY_API_KEY`, `LCB_DATABASE_URI`,
  and placeholder LDAP / S3 credential vars. Header explains the
  camelCase YAML → SNAKE_CASE env var mapping (`giphy.apiKey` ↔
  `LCB_GIPHY_API_KEY`, not `LCB_GIPHY_APIKEY`).

### CVE delta

| Stage | total | critical | high | mod | low |
|------|------:|---------:|-----:|----:|----:|
| Start (after Node 20 bump) | 78 | 19 | 34 | 21 | 4 |
| After build-time cull | 33 | 4 | 14 | 12 | 3 |
| After vendor migration + sweetalert2 | 34 | 4 | 14 | 13 | 3 |
| Current (post express.oi → Express 5) | 19 | 3 | 7 | 9 | 0 |

Residual 19 are transitive deps of `connect-assets` 5.x (still pinned;
the only remaining piece of the original 2014-era stack).

## Known footguns

- **Giphy API key is rendered into the DOM** as `data-apikey` on every chat
  page. Fine for a team-only deployment, sketchy for anything public. A
  "move secret out of client HTML" cleanup is in the open list below.

## Open / deferred

Rough priority order. Sizes are S/M/L/XL where XL is multi-day.

| Item | Size | Notes |
|------|:----:|-------|
| moment → dayjs/Luxon | M | moment is maintenance-mode. Surface area used is small. |
| Actual tests | XL | No test suite exists. Pre-commit hook runs ESLint only. |
| Drop jQuery / Backbone (UI rewrite) | XL | 341 jQuery refs, 9 Backbone views. Far-future project. |
| Move Giphy key out of client HTML | S | Proxy through server, hide key. Quick once you decide on the API shape. |

## Verification baseline

Boot via:

```
docker compose -f docker/docker-compose.yml up --build -d
```

App at <http://localhost:8080>. Confirmed working in browser:

- Account registration with email validation
- Login + session
- Room creation, joining, archive (confirm modal)
- Sending messages
- Edit-room button
- @-mention autocomplete (atwho)
- File upload (dropzone)
- Keyboard shortcuts (backbone.keys)
- Giphy search (with a valid `LCB_GIPHY_API_KEY` in `docker/.env`)

`npm test` (ESLint) is clean inside the container.

## How this doc gets maintained

Each landed commit moves items between sections. When a new chunk of work
starts, plan it inline (or in [.claude/plans/](../../.claude/plans/) during a
plan-mode session) and copy the outcome here once it ships. The goal is one
place a teammate or future-self can read top-to-bottom to understand where
the modernization stands.
