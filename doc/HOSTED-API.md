# ZipWiki hosted API

Unified product API in `apps/server`. The Fly process is the only caller of
LlamaParse and Claude. It resolves the caller’s ZipWiki API key, checks
prepaid credits in Convex, calls the vendor with a master key, and debits one
credit per successful hosted parse or completion.

Master keys are Fly secrets: `LLAMA_CLOUD_API_KEY`, `ANTHROPIC_API_KEY`,
`CONVEX_SITE_URL`, and `ZIPWIKI_WORKER_SECRET`. They are not stored in
`~/.zipwiki` and are not accepted from the client.

## Endpoints

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/health` | — | Service status |
| `GET` | `/` | — | Name + pointer to `/health` |
| `POST` | `/api/parse` | `Authorization: Bearer` ZipWiki API key | Multipart field `file`. Hosted LlamaParse. One credit on success. |
| `POST` | `/api/okf/enrich` | `Authorization: Bearer` ZipWiki API key | JSON body (`primaries`, `parsedMarkdown`, `title`, `digest`, `documentType`). Hosted Claude Haiku. One credit on success. |

Out of credits does not call the vendor and does not debit. Parse responds
`200` with `fallbackReason: "quota_fallback_free"` so the CLI uses local
LiteParse. OKF responds `402` with `code: "okf_fallback_host_llm"`.

The ledger stores provider, model, page count, and token counts. The charge
stays one credit per successful call.

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
