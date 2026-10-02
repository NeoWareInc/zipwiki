# @zipwiki/zipwiki

TypeScript **zipwiki** creates and queries a knowledge base. Local pack works
without an account: LiteParse + `--no-ai-okf`. Settings home is `~/.zipwiki`.

```bash
pnpm zipwiki -- pack knowledge/test2 -o knowledge/test2.zipwiki --no-ai-okf --parser liteparse
pnpm zipwiki -- open knowledge/test2.zipwiki
pnpm zipwiki -- search knowledge/test2.zipwiki deed
```

Hosted parse/OKF and `zipwiki login` are Phase 3.
