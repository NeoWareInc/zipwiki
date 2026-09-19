# ZipWiki hosted API

Unified product API in `apps/server`. Phase 1b is the Fly host and health
check. Parse, OKF, MCP, accounts, and billing stay in the lab until later
phases, on **new** Fly / Convex / Stripe projects (not zipcodex.ai).

## Endpoints (Phase 1b)

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/health` | — | Service status (`phase: "1b"`, `convex: false`) |
| `GET` | `/` | — | Name + pointer to `/health` |

## Hosts

| Env | URL |
| --- | --- |
| Local | `http://localhost:3001` |
| Dev | `https://zipwiki-api-dev.fly.dev` → later `https://api-dev.zipwiki.ai` |
| Production | `https://zipwiki-api-prod.fly.dev` → later `https://api.zipwiki.ai` |

## Local

```bash
pnpm --filter @zipwiki/server dev
curl -sS http://localhost:3001/health
```

Or image parity: `pnpm dev:stack`.

## Deploy

See [`deploy/fly/README.md`](../deploy/fly/README.md).

```bash
pnpm deploy:fly:dev
pnpm deploy:fly:prod
pnpm check:fly
```
