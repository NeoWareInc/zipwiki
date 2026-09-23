# @zipwiki/zipwiki

TypeScript **zipwiki** creates and queries a knowledge base. Local pack works
without an account: LiteParse + `--no-ai-okf`. Settings home is `~/.zipwiki`.

```bash
pnpm zipwiki -- pack knowledge/test2 -o knowledge/sample-docs.zipwiki --no-ai-okf --parser liteparse
pnpm zipwiki -- open knowledge/sample-docs.zipwiki
pnpm zipwiki -- search knowledge/sample-docs.zipwiki deed
```

Hosted parse/OKF and `auth login` are Phase 3.
