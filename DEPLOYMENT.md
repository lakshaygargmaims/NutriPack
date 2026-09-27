# NutriPack — Deployment & Operations

## Environment variables

Copy `.env.example` → `.env` (never commit `.env`):

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3100` | HTTP port (`next start -p $PORT`) |
| `AUTH_SECRET` | dev fallback | HMAC key for session tokens — **set in production** |
| `DATABASE_URL` | empty | Reserved for PostgreSQL migration (see DATABASE.md) |
| `STORAGE_DRIVER` / `STORAGE_LOCAL_DIR` | `local` / `./data/uploads` | Object-storage abstraction (reports/images) |
| `ML_SERVICE_URL` | empty | Optional Python FastAPI prediction service; empty = built-in engine |
| `VISION_PROVIDER` / `VISION_API_KEY` | empty | Optional real vision service for image identification |

## Local production run

```bash
npm ci
npm run build
npm start            # serves on :3100
```

Health check: `GET /api/health` → `{"ok":true,...}`.

## Docker

```dockerfile
# Dockerfile (example)
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 3100
CMD ["npm", "start"]
```

```yaml
# docker-compose.yml (example)
services:
  nutripack:
    build: .
    ports: ["3100:3100"]
    environment:
      - AUTH_SECRET=${AUTH_SECRET}
    volumes:
      - nutripack-data:/app/data      # persist the document store
volumes:
  nutripack-data:
```

## Data directory

`data/nutripack.json` is the live store; `data/uploads/` holds uploaded artefacts.
Back up the `data/` volume; the store writes atomically (tmp + rename). For
multi-replica deployments migrate to PostgreSQL first (DATABASE.md) — the JSON
store is single-node by design.

On Railway the store reads `RAILWAY_VOLUME_MOUNT_PATH` (a volume attached at
`/data`) instead of `./data`, so projects and uploads survive redeploys. Off
platform the path falls back to `./data` unchanged.

## GitHub → Railway auto-deploy

The `nutripack-web` service is connected to `lakshaygargmaims/NutriPack`
(`serviceConnect`, branch `main`), so **every push to `main` builds and deploys
automatically** — no CLI upload needed. The deployment trigger has
`checkSuites: true`, meaning Railway waits for the GitHub Actions CI workflow
(typecheck → unit → build → API/e2e/behavioural suites) to pass before it ships;
a red build never reaches production.

Verified end-to-end with timestamps: trigger
`956ff400-c73d-481f-80ca-66487600c284` (github, main); on push `2a6df1d`
Railway created the deployment at 09:36:02Z but only scheduled the build at
09:37:11Z — after the CI check run completed green at 09:37:06Z — proving the
check gate holds. Volume persistence proven by redeploy `11dbd4f1`: seeded
projects (5) survived a fresh container.

To change the watched branch or detach: Railway dashboard → service →
Settings → Source, or `serviceDisconnect` / `deploymentTriggerUpdate` via
`railway api`.

## Security checklist

- [x] Passwords stored as scrypt hashes (never plaintext).
- [x] HMAC-signed session tokens with 7-day expiry; role checks server-side on
      every admin call.
- [x] zod validation on all POST bodies; structured error responses.
- [x] No secrets in frontend code; token held client-side in localStorage only.
- [ ] Production: set a strong `AUTH_SECRET`, put HTTPS in front (reverse proxy),
      add rate limiting at the proxy for public exposure, rotate demo accounts out.

## CI-style checks

```bash
npx tsc --noEmit     # types
npx vitest run       # 23 engine unit tests
npm run build        # production build
node scripts/e2e.mjs # 36 end-to-end acceptance checks against a running server
```

`scripts/e2e.mjs` is the §48 acceptance test: auth → tomato Delhi→Jaipur analysis →
twin what-if → optimization → comparison → validation closed loop → report → admin
roles → demo scenarios → error handling. Wire it into CI with a started server.

## Scaling notes

- Engine calls are pure CPU (<10 ms per analysis); Next.js route handlers scale
  horizontally once the store is externalized.
- Twin sliders fire one request per change; fine for single-node judging, add
  request coalescing (client-side already batches via React state) for load.
