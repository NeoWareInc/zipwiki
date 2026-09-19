# ZipWiki deploy

| Path | Purpose |
| --- | --- |
| [`fly/`](fly/) | Fly.io API (`zipwiki-api-dev` / `zipwiki-api-prod`) — only hosted deploy path |
| [`docker-compose.yml`](docker-compose.yml) | Local API image smoke (`pnpm dev:stack`; not production) |
| [`env.example`](env.example) | Local secrets template → `deploy/.env` |
| [`env.dev.example`](env.dev.example) / [`env.prod.example`](env.prod.example) | Fly secrets templates → `deploy/.env.dev` / `.env.prod` |

Hosted API: [`doc/HOSTED-API.md`](../doc/HOSTED-API.md).

**Fly secrets:** edit `deploy/.env.dev` or `deploy/.env.prod`, then:

```bash
pnpm secrets:fly:dev    # → zipwiki-api-dev
pnpm secrets:fly:prod   # → zipwiki-api-prod
```

Phase 1b does not require secrets. Convex / Stripe / provider keys are later,
on **new** projects — not zipcodex.ai.
