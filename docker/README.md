# Let's Chat — Docker

Run Let's Chat + MongoDB with one command. No host installs required.

## Quick start

From the repo root:

```
docker compose -f docker/docker-compose.yml up --build
```

Or from this directory:

```
cd docker && docker compose up --build
```

Then open <http://localhost:8080>.

## What's in this folder

| File | Purpose |
|------|---------|
| `Dockerfile` | Node 20 image; runs `npm ci --legacy-peer-deps` then `npm start` |
| `Dockerfile.dockerignore` | Excludes host `node_modules`, `.git`, etc. from the build context (BuildKit reads `<dockerfile>.dockerignore` automatically) |
| `docker-compose.yml` | `app` + `mongo:7` services on a private network |

## Common commands

| Action | Command |
|--------|---------|
| Start (detached) | `docker compose -f docker/docker-compose.yml up -d` |
| Tail app logs | `docker compose -f docker/docker-compose.yml logs -f app` |
| Stop | `docker compose -f docker/docker-compose.yml down` |
| Stop + wipe DB & uploads | `docker compose -f docker/docker-compose.yml down -v` |
| Rebuild after dep changes | `docker compose -f docker/docker-compose.yml build --no-cache app` |
| Shell into app container | `docker compose -f docker/docker-compose.yml exec app bash` |

## Configuration

The container honours all `LCB_*` environment variables. To override defaults, edit `docker-compose.yml` or mount a `settings.yml`:

```yaml
    volumes:
      - app-uploads:/usr/src/app/uploads
      - ./my-settings.yml:/usr/src/app/config/settings.yml:ro
```

See the [environment variables wiki](https://github.com/sdelements/lets-chat/wiki/Environment-variables) for the full list.

## Persistence

Named volumes:
- `mongo-data` — MongoDB database files
- `app-uploads` — user-uploaded files

`docker compose down` keeps data; `docker compose down -v` wipes it.

## Ports

- Host `8080` → container `8080` (HTTP). macOS reserves `5000` for AirPlay, so the legacy default is avoided.
- XMPP is disabled by default (`xmpp.enable: false` in `defaults.yml`). To enable it, set `LCB_XMPP_ENABLE=true` and expose port 5222.
