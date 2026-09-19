# @zipwiki/mcp

Stdio MCP (`zipwiki-mcp`). Tools: `open`, `search`, `query`, `read_okf`,
`read_parsed`, `read_entry`, `read`, `origin`, `extract`, `pack`, `update`,
`okf_enrich`.

```bash
pnpm --filter @zipwiki/mcp build
node apps/mcp/dist/stdio.js
```

Default package argument: a `.zipwiki` path, or `wiki.zipwiki` in the cwd.
