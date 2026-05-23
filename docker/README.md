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
