# Deploy the ZipWiki API on Fly.io

**API production hosting = Fly.io only** (marketing site stays on Vercel later;
SaaS data on Convex later). Local Compose (`pnpm dev:stack`) is image parity
on your laptop — not a second deploy target.

Config + runbook only. This directory does **not** log in or deploy for you.

## What this deploys

| On Fly (Phase 1b) | Later |
| --- | --- |
| **`@zipwiki/server`** — `GET /health` | Hosted parse / OKF / MCP |
| Dev + prod apps under the **NeoWare** org | New Convex + Stripe projects |

Do **not** reuse `zipcodex-api-*` apps or zipcodex.ai secrets.

Image: [`apps/server/Dockerfile`](../../apps/server/Dockerfile) (port **3001**,
`HOST=0.0.0.0`).

| Env | Fly app | Hostname | Config |
| --- | --- | --- | --- |
| Dev | `zipwiki-api-dev` | `api-dev.zipwiki.ai` | [`fly.dev.toml`](fly.dev.toml) |
| Prod | `zipwiki-api-prod` | `api.zipwiki.ai` | [`fly.prod.toml`](fly.prod.toml) |

## Machine notes

- **Process:** `app` → `node dist/index.js` (`WORKDIR /app/apps/server`).
- **VM:** `shared-cpu-1x` / **256MB**. Raise to 1GB when parse/OKF land.
- **Health:** Fly Proxy `GET /health` (HTTP 2xx). Expect `"status":"ok"`,
  `"service":"zipwiki"`, `"phase":"1b"`, `"convex":false`.
- **Dev:** `auto_stop_machines = "stop"`, `min_machines_running = 0`.
- **Prod:** same autostop for excess Machines, `min_machines_running = 1`.
- **Region:** `primary_region = "iad"`.

## Prerequisites

1. A [Fly.io](https://fly.io) account in the **NeoWare** org.
2. [`flyctl`](https://fly.io/docs/flyctl/install/) installed and logged in.
3. Optional secrets from [`../env.dev.example`](../env.dev.example) /
   [`../env.prod.example`](../env.prod.example). Phase 1b needs none.

```bash
fly auth login
fly orgs list
```

## 1. Create the two apps

From the **repository root**:

```bash
fly apps create zipwiki-api-dev --org neoware
fly apps create zipwiki-api-prod --org neoware
```

Skip `fly launch` — these TOML files already name the apps.

Default public hosts until custom domains are attached:

- `https://zipwiki-api-dev.fly.dev`
- `https://zipwiki-api-prod.fly.dev`

## 2. Deploy

Always from the **repository root** so the Docker context is the monorepo.

```bash
pnpm deploy:fly:dev
pnpm deploy:fly:prod
```

Same as `fly deploy . --config deploy/fly/fly.dev.toml` (or `fly.prod.toml`).

## 3. Custom domains and certs

`zipwiki.ai` DNS is on Squarespace. Fly already created the certificates;
they stay **Not verified** until these records exist:

| Host | Type | Value |
| --- | --- | --- |
| `api-dev.zipwiki.ai` | A | `66.241.125.118` |
| `api-dev.zipwiki.ai` | AAAA | `2a09:8280:1::194:4f06:0` |
| `api.zipwiki.ai` | A | `66.241.125.73` |
| `api.zipwiki.ai` | AAAA | `2a09:8280:1::194:4f07:0` |

CNAME alternative: `api-dev` → `9905rq2.zipwiki-api-dev.fly.dev`, `api` →
`qe1gzq1.zipwiki-api-prod.fly.dev`.

```bash
fly certs check api-dev.zipwiki.ai -c deploy/fly/fly.dev.toml
fly certs check api.zipwiki.ai -c deploy/fly/fly.prod.toml
```

Until then, smoke-test the `.fly.dev` hosts.

## 4. Smoke

```bash
pnpm check:fly
curl -sS https://zipwiki-api-dev.fly.dev/health
curl -sS https://zipwiki-api-prod.fly.dev/health
```

## Local Compose (optional)

```bash
cp deploy/env.example deploy/.env
pnpm dev:stack
```
