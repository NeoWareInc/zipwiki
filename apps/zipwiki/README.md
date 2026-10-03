# @zipwiki/zipwiki

TypeScript **zipwiki** creates and queries a knowledge base. Local pack works
without an account: LiteParse + `--no-ai-okf`. Settings home is `~/.zipwiki`.

```bash
pnpm zipwiki -- pack knowledge/test2 -o knowledge/sample-docs.zipwiki --no-ai-okf --parser liteparse
pnpm zipwiki -- open knowledge/sample-docs.zipwiki
pnpm zipwiki -- search knowledge/sample-docs.zipwiki deed
```

Hosted parse/OKF and `zipwiki login` are Phase 3.

## Install on this machine (no npmjs)

From the monorepo root (do **not** `npm pack` the repo root — that has no `bin`):

```bash
pnpm install:cli
# or: pnpm pack:cli && npm i -g ./.pack/zipwiki
zipwiki --help
```

That builds a self-contained tree under `.pack/zipwiki` (workspace deps resolved) and links the `zipwiki` binary onto your global npm prefix.
