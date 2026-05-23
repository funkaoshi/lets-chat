# Let's Chat — Docker

Run Let's Chat + MongoDB with one command. No host installs required.

## Quick start (dev — live reload)

First run only:

```
./docker/bootstrap.sh
```

This creates `docker/.env` from the example and generates a random
`LCB_SECRETS_COOKIE` (the app refuses to boot without one). Idempotent —
re-running won't overwrite anything you've already filled in.

Then bring the stack up with the dev override layered on:

```
docker compose -f docker/docker-compose.yml -f docker/docker-compose.dev.yml up
```

The dev override bind-mounts the repo into the container and starts the
app under `node --watch`, so client edits show up on browser refresh and
server edits restart the process automatically. No `--build` needed
unless you change a dependency.

Open <http://localhost:8080>.

## Quick start (prod-ish)

Without the dev override — code is baked into the image, no live reload:

```
docker compose -f docker/docker-compose.yml up --build
```

## What's in this folder

| File | Purpose |
|------|---------|
| `Dockerfile` | Node 20 image; runs `npm ci --legacy-peer-deps` then `npm start` |
| `Dockerfile.dockerignore` | Excludes host `node_modules`, `.git`, etc. from the build context (BuildKit reads `<dockerfile>.dockerignore` automatically) |
| `docker-compose.yml` | `app` + `mongo:7` services on a private network |
| `docker-compose.dev.yml` | Dev override: source bind mount + `node --watch` |
| `bootstrap.sh` | First-run helper: creates `.env`, generates cookie secret |

## Common commands

`COMPOSE` shorthand for brevity below:

```
export COMPOSE="docker compose -f docker/docker-compose.yml -f docker/docker-compose.dev.yml"
```

(Drop the second `-f` for the prod-ish flavor.)

| Action | Command |
|--------|---------|
| Start (detached) | `$COMPOSE up -d` |
| Tail app logs | `$COMPOSE logs -f app` |
| Stop | `$COMPOSE down` |
| Stop + wipe DB & uploads | `$COMPOSE down -v` |
| Rebuild after dep changes | `$COMPOSE build --no-cache app` |
| Shell into app container | `$COMPOSE exec app bash` |
| Restart the app process | `$COMPOSE restart app` |

## Configuration

The container honours all `LCB_*` environment variables. The preferred way to set secrets and local overrides is via `docker/.env`:

```
cp docker/.env.example docker/.env
# edit docker/.env, fill in real values
docker compose -f docker/docker-compose.yml up -d
```

`docker/.env` is gitignored. Compose passes everything in it through to the app container. See [.env.example](.env.example) for the format. For the full list of LCB_* variables, see the [environment variables wiki](https://github.com/sdelements/lets-chat/wiki/Environment-variables).

You can also mount a full settings.yml if you prefer:

```yaml
    volumes:
      - app-uploads:/usr/src/app/uploads
      - ./my-settings.yml:/usr/src/app/config/settings.yml:ro
```

## Persistence

Named volumes:
- `mongo-data` — MongoDB database files
- `app-uploads` — user-uploaded files

`docker compose down` keeps data; `docker compose down -v` wipes it.

## Ports

- Host `8080` → container `8080` (HTTP). macOS reserves `5000` for AirPlay, so the legacy default is avoided.
