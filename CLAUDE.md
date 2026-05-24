# Let's Chat — Developer Reference

For the ongoing modernization status (shipped work, open items, known footguns), see [MODERNIZATION.md](MODERNIZATION.md).

## Project Overview

Self-hosted real-time team chat. Node.js + Express + Socket.IO + MongoDB. Users, rooms, messages, file uploads, @mentions.

Stack: **Express 5** + **Socket.IO 4** (with an in-tree compat layer at `app/express-oi-compat.js` that preserves the `app.io.route()` / `req.io.route()` dual-dispatch API the controllers rely on) · **Mongoose** · **Nunjucks** templates · **Passport** auth · in-tree asset pipeline at `app/assets.js` (Sprockets-style JS concat + `less` 4 for stylesheets, writes to `media/dist/`) · **Bootstrap 5** (prebuilt CSS + small jQuery modal shim in `media/js/legacy/bootstrap-modal-shim.js`).

## Running Locally

**Use Docker** — the dev environment lives in `docker/` and bundles MongoDB. Do not install Node deps or MongoDB on the host.

First-time setup:

```bash
./docker/bootstrap.sh   # creates docker/.env, generates LCB_SECRETS_COOKIE
```

Then bring the stack up with the dev override (bind-mount + `node --watch`, so source edits live-reload):

```bash
docker compose -f docker/docker-compose.yml -f docker/docker-compose.dev.yml up
```

Without the dev override the code is baked into the image and a `--build` is needed on every change. Use that flavor for prod-ish smoke tests:

```bash
docker compose -f docker/docker-compose.yml up --build
```

App at <http://localhost:8080>. Two named volumes persist state: `mongo-data`, `app-uploads`. See [docker/README.md](docker/README.md) for the full reference.

ESLint runs on the host (no Docker required): `npm test` — assumes `npm ci --legacy-peer-deps` was run once for IDE/lint tooling.

Config resolution order: env vars (`LCB_*`) > `config/settings.yml` or `settings.yml` > `defaults.yml`.

Key defaults: `database.uri = mongodb://localhost/letschat`, `http.port = 5000` (overridden to `8080` in Docker), `auth.providers = [local]`.

**Port note:** the upstream default is `5000`, but macOS reserves that for AirPlay. The Docker setup uses `8080` to avoid the conflict.

## Architecture

### Entry point: `app.js`

Setup order matters:
1. Cookie-secret guard (refuse to boot on default `"secretsauce"`)
2. Express app + HTTP server + Socket.IO 4 (via `app/express-oi-compat.js`)
3. `express-session` middleware (connect-mongo store), installed on both HTTP (`app.use`) and Socket.IO (`io.engine.use`) via `app.io.session()`
4. Auth (`app/auth/index.js`): Passport HTTP middleware + custom Socket.IO middleware that pulls `session.passport.user` and deserializes
5. Security middleware (Helmet)
6. Asset pipeline (`app/assets.js`: concat JS + less 4 → `media/dist/`, mtime-rebuild in dev)
7. Templates (Nunjucks with custom delimiters: `<% %>`, `<$ $>`, `<# #>`)
8. i18n
9. Controllers registered (each controller calls `app.get/post/io.route`)
10. Mongoose connect → `startApp()` (listen)

### Dual-dispatch (HTTP ⇄ Socket.IO) pattern

The compat layer in `app/express-oi-compat.js` lets one handler serve both protocols. HTTP routes typically just delegate:

```js
// HTTP route → dispatches to the io.route handler
app.post('/account/login', function(req) { req.io.route('account:login'); });

// Socket.IO handler — same code runs whether the request came in via
// HTTP POST or a socket emit. Uses standard Express res.* methods;
// the compat layer maps res.json/status/sendStatus to socket acks
// when the request originated from Socket.IO.
app.io.route('account', {
    login: function(req, res) {
        // ... auth.authenticate ...
        res.json({ status: 'success' });
    }
});
```

### Key directories

| Path | Contents |
|------|----------|
| `app/models/` | Mongoose schemas: User, Room, Message, File |
| `app/core/` | Business logic: account, rooms, messages, files, presence, users |
| `app/core/index.js` | Exports all core manager instances |
| `app/controllers/` | Express + Socket.IO route handlers (auto-loaded) |
| `app/auth/` | Passport strategies: local, LDAP, Kerberos |
| `app/middlewares/` | Express middleware (requireLogin, etc.) |
| `templates/` | Nunjucks HTML (login.html, chat.html, transcript.html) |
| `media/js/` | Client-side JavaScript (vendor libs committed under `media/js/vendor/` — no Bower/Grunt build step) |
| `media/less/` | LESS stylesheets → compiled by `app/assets.js` |
| `locales/` | i18n JSON files (19+ languages) |
| `extras/` | Emotes (YAML) and text replacements |

### Config pipeline (`app/config.js`)

Reads `defaults.yml` → `settings.yml` → env vars → merges. Exports the result directly. Plugins (auth providers, file backends) inject their defaults into the merge.

### Models

- `User`: email, username (unique), password (bcrypt), token (for API auth), provider (local/ldap/kerberos)
- `Room`: slug (unique), name, participants, private flag, optional password (bcrypt)
- `Message`: text, owner (User ref), room (Room ref)
- `File`: stored by provider (local by default, S3/Azure optional)

### Auth

Multiple providers can be active simultaneously (local, LDAP, Kerberos). Bearer token and HTTP Basic auth supported for API access. Session sharing between HTTP and Socket.IO runs through a small custom middleware in `app/auth/index.js` — reads `socket.request.session.passport.user` (populated by `io.engine.use(sessionMiddleware)` in the compat layer) and runs the regular `passport.deserializeUser` to attach `socket.request.user`.

## Package Notes

- **`app/express-oi-compat.js`** — in-tree replacement for the unmaintained `express.oi` npm package. Reimplements the dual-dispatch trick (one handler serves both HTTP and Socket.IO) on top of native Express 5 + Socket.IO 4. Touching it can break any controller that uses `app.io.route()` or `req.io.route()`.
- **`app/assets.js`** — in-tree replacement for the unmaintained `connect-assets` package. Sprockets-style `//= require X` expansion for JS entries; `less.render()` for `.less` entries (with `javascriptEnabled: true` because `hat.less` mixins use backtick inline-JS). Writes to `media/dist/`; the existing `/media` static mount serves them. Dev mode mtime-rebuilds on request when sources change. Registers `'<name>' | js` / `'<name>' | css` Nunjucks filters.

## Migration patterns used here

When upgrading a major dep with many call sites, this codebase consistently picks a **compat-shim** approach over a "rewrite all the callers" pass. Four concrete examples in the tree:

- **`media/js/legacy/sweetalert-shim.js`** — maps the legacy `swal('title','text','type')` and `swal({...}, cb)` signatures onto sweetalert2's Promise API. Let us bump v1 → v2 without touching 22 call sites.
- **`media/js/legacy/bootstrap-modal-shim.js`** — re-attaches `$.fn.modal('show'/'hide')` (jQuery plugin API, dropped in BS5) onto `bootstrap.Modal.getOrCreateInstance(...)`. Let us bump BS3 → 5 without touching 14 Backbone views.
- **`app/express-oi-compat.js`** — in-tree reimplementation of the unmaintained `express.oi` package on top of native Express 5 + Socket.IO 4. Preserves `app.io.route()` / `req.io.route()` dual-dispatch + `req.param()` so 12 controllers stayed unchanged.
- **`app/assets.js`** — in-tree replacement for `connect-assets`. Same `//= require X` directives, same `'name' | js` / `'name' | css` Nunjucks filters, same `/media/dist/` URLs — so 4 bundle entries + 4 templates + every `@import` in the LESS tree all stayed unchanged. Let us bump `less` 2 → 4 and drop the entire `request`/`har-validator` CVE chain.

**The decision rule:** if a migration would touch more than ~10 call sites, ask "would a 30-line shim let me upgrade the lib *without* touching the callers?" If yes, prefer it — even at the cost of carrying a small piece of glue forever. A later, narrower project can drop the shim when the underlying call-site pattern is itself being replaced (e.g., the shim files all disappear together when jQuery/Backbone go).

## Things that bit us — worth knowing

- **`docker compose up --build -d` can silently drop bind mounts** from the dev override file. After a rebuild, run `down` then `up -d --force-recreate` (with both `-f` files) to ensure overrides re-apply. Symptom: edits to host files don't reach the container, `node --watch` never restarts.
- **Always do a real browser smoke after server-side changes.** Programmatic socket clients can mask issues that real clients hit: Socket.IO 4 ack ordering races, Backbone delegated-event bubbling through stacking contexts, modal backdrop layering. The Express 5 / Socket.IO 4 migration passed curl + scripted-socket smoke cleanly and then surfaced two bugs in the browser within 30 seconds.
- **Socket.IO 4 doesn't auto-stringify room names** — pass `String(room._id)` to `socket.join()` and `io.to()` consistently, or Set membership won't match.

## ESLint

Flat config in `eslint.config.js`. Ignores `media/`. Run with `npm test`.
