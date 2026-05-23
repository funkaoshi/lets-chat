# Let's Chat — Developer Reference

For the ongoing modernization status (shipped work, open items, known footguns), see [MODERNIZATION.md](MODERNIZATION.md).

## Project Overview

Self-hosted real-time team chat. Node.js + Express + Socket.IO + MongoDB. Users, rooms, messages, file uploads, @mentions.

Stack: **express.oi** (Express 4 + Socket.IO 1.x wrapper) · **Mongoose** · **Nunjucks** templates · **Passport** auth · **connect-assets** for LESS/JS bundling.

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
1. Express.oi init (HTTP or HTTPS server with Socket.IO)
2. Session (connect-mongo store)
3. Auth (Passport + passport.socketio)
4. Security middleware (Helmet)
5. Asset pipeline (connect-assets: LESS + JS bundles)
6. Templates (Nunjucks with custom delimiters: `<% %>`, `<$ $>`, `<# #>`)
7. i18n
8. Controllers registered (each controller calls `app.get/post/io.route`)
9. Mongoose connect → `startApp()` (listen)

### express.oi pattern

Controllers use `req.io.route()` to dispatch to socket handlers:

```js
// HTTP route → dispatches to socket handler
app.post('/account/login', function(req) { req.io.route('account:login'); });

// Socket.IO handler
app.io.route('account:login', function(req) { req.io.respond({...}); });
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
| `media/less/` | LESS stylesheets → compiled by connect-assets |
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

Multiple providers can be active simultaneously. Bearer token and HTTP Basic auth supported for API access. `passport.socketio` shares sessions between HTTP and Socket.IO.

## Package Notes

- **`express.oi` 0.0.21** — pinned. Wraps Express 4 + Socket.IO 1.x. Do not update; replacing it requires rewriting all controller socket handlers.
- **`passport.socketio` 3.6.2** — pinned. Session bridge between Passport and Socket.IO 1.x, tied to express.oi.
- **`connect-assets` 5.3.0** — pinned. Bundles LESS and JS. Depends on `less` being present.

## ESLint

Flat config in `eslint.config.js`. Ignores `media/`. Run with `npm test`.
