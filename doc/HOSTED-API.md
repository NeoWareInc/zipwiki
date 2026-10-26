# ZipWiki hosted API

Unified product API in `apps/server`. The Fly process is the only caller of
LlamaParse and Claude. It resolves the caller’s ZipWiki API key, checks
prepaid credits in Convex, calls the vendor with a master key, and debits
credits on successful hosted work.

Master keys are Fly secrets: `LLAMA_CLOUD_API_KEY`, `ANTHROPIC_API_KEY`,
`CONVEX_SITE_URL`, and `ZIPWIKI_WORKER_SECRET`. They are not stored in
`~/.zipwiki`, are not accepted from the client, and are **not** loaded by the
CLI from `deploy/.env.dev` / `deploy/.env.prod` (those files are Fly push
templates only). User BYO Llama/Anthropic keys come only from shell, project
`.env` / `.env.local`, or `~/.zipwiki/.env` — see [CONVEX.md](CONVEX.md)
“Secret lanes”.

## Endpoints

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/health` | — | Service status |
| `GET` | `/` | — | Name + pointer to `/health` |
| `POST` | `/api/parse` | `Authorization: Bearer` ZipWiki API key | Multipart field `file`. Hosted LlamaParse. Credits on success. |
| `POST` | `/api/okf/enrich` | `Authorization: Bearer` ZipWiki API key | JSON body (`primaries`, `parsedMarkdown`, `title`, `digest`, `documentType`, optional `okfProfile`). Hosted Claude. Credits on success. |
| `POST` | `/api/okf/digest` | `Authorization: Bearer` ZipWiki API key | JSON body (`index` or `catalog`, `count`, optional `missing`, `bodyBudget`, `model`). Package-level `ai.digest` summary from the full OKF index. Credits on success. |
| `POST` | `/api/query/answer` | `Authorization: Bearer` ZipWiki API key | Hosted ask turn (`question`, excerpts / tool follow-ups). Credits on success. |
| `GET` | `/api/settings` | `Authorization: Bearer` ZipWiki API key | Account settings snapshot for the CLI / portal. |
| `PUT` | `/api/settings` | `Authorization: Bearer` ZipWiki API key | Update account settings. |
| `GET` | `/api/client-config` | `Authorization: Bearer` ZipWiki API key | Credits remaining, entitlements, OKF model list, feature flags. |
| `POST` | `/api/usage/llamaparse` | `Authorization: Bearer` ZipWiki API key | Record BYO LlamaParse usage against the ledger when applicable. |
| `POST` | `/api/telemetry/liteparse` | `Authorization: Bearer` ZipWiki API key | LiteParse usage telemetry. |
| `POST` | `/api/telemetry/activity` | `Authorization: Bearer` ZipWiki API key | CLI / MCP activity telemetry. |

Out of credits does not call the vendor and does not debit. Parse responds
`200` with `fallbackReason: "quota_fallback_free"` so the CLI uses local
LiteParse. OKF / digest / ask respond `402` with a code the client can map
(e.g. `okf_fallback_host_llm`, ask credit errors).

The ledger stores provider, model, page count, and token counts. Markup and
credit math live in Convex (`convex/lib/credits.ts`).

Hosted OKF / digest / ask models are allowlisted in both
`convex/lib/credits.ts` (`HOSTED_OKF_MODELS`) and
`apps/server/src/gateway/anthropic.ts`. Unknown or older saved model ids
resolve to the default (`claude-haiku-5-5`) instead of returning 400.

## Hosts

| Env | URL |
| --- | --- |
| Local | `http://localhost:3001` |
| Dev | `https://api-dev.zipwiki.ai` (ops: `https://zipwiki-api-dev.fly.dev`) |
| Production | `https://api.zipwiki.ai` (ops: `https://zipwiki-api-prod.fly.dev`) |

Product clients should use the custom hosts. Fly `.fly.dev` hostnames remain
for ops and debugging. Dev and prod Fly VMs are configured for **2GB** RAM
(`deploy/fly/fly.*.toml`) so hosted PDF parse has headroom; redeploy after
changing that value. The API image pins **Node 22.23.4** (CVE-2026-111497).

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
pnpm check:fly:dev
pnpm check:fly:prod
```

Docker context is the repo root. [`.dockerignore`](../.dockerignore) excludes
`knowledge/`, `.pack/`, and website release tarball dirs so Fly uploads stay
small.
