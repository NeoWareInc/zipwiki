# @zipwiki/server

ZipWiki API on Fly (`api-dev.zipwiki.ai` / `api.zipwiki.ai`).

Phase 1b is a health host. Parse, OKF, MCP, Convex, and Stripe stay in the
lab (`zip-codex`) until later phases. New Fly apps — do not point this
service at zipcodex.ai credentials.

```bash
pnpm --filter @zipwiki/server dev     # http://localhost:3001
pnpm --filter @zipwiki/server test
curl -sS http://localhost:3001/health
```

Deploy: [`deploy/fly/README.md`](../../deploy/fly/README.md).
