# ZipWiki deploy

| Path | Purpose |
| --- | --- |
| [`fly/`](fly/) | Fly.io API (`zipwiki-api-dev` / `zipwiki-api-prod`) — only hosted deploy path |
| [`docker-compose.yml`](docker-compose.yml) | Local API image smoke (`pnpm dev:stack`; not production) |
| [`env.example`](env.example) | Local secrets template → `deploy/.env` |
| [`env.dev.example`](env.dev.example) / [`env.prod.example`](env.prod.example) | Fly secrets templates → `deploy/.env.dev` / `.env.prod` |
| [`env.convex.dev.example`](env.convex.dev.example) / [`env.convex.prod.example`](env.convex.prod.example) | Convex env templates → `deploy/.env.convex.dev` / `.env.convex.prod` |

Hosted API: [`doc/HOSTED-API.md`](../doc/HOSTED-API.md).

**Fly secrets:** edit `deploy/.env.dev` or `deploy/.env.prod`, then:

```bash
pnpm secrets:fly:dev    # → zipwiki-api-dev
pnpm secrets:fly:prod   # → zipwiki-api-prod
```

**Convex env** (auth, Stripe, worker secret, public API URL). Copy the template, fill the empty values, then:

```bash
cp deploy/env.convex.dev.example deploy/.env.convex.dev
cp deploy/env.convex.prod.example deploy/.env.convex.prod
pnpm secrets:convex:dev     # → dev deployment dashing-cod-224
pnpm secrets:convex:prod    # → production festive-hare-381
```

Empty values are skipped. If a name is already set to a different value, the command stops. Replace those values only when you mean to:

```bash
pnpm secrets:convex:dev -- --force
```

Do not put `JWT_PRIVATE_KEY`, `JWKS`, or `CONVEX_SITE_URL` in that file. Auth setup creates the first two. Convex provides the site URL. `ZIPWIKI_WORKER_SECRET` must be the same value as the Fly secret for that environment. The webhook variable the server reads is `STRIPE_WEBHOOK_SECRET`.

Stripe and login keys stay on Convex. LlamaParse and Anthropic master keys stay on Fly.
