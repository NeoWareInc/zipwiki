# ZipWiki

The `zipwiki` command packs documents into a `.zipwiki` and queries that package on this machine. `zipwiki-mcp` is the stdio server for Claude and Cursor. LiteParse is included. This package is not published on the public npm registry.

Requires Node.js 22.13 or newer. Word, Excel, and PowerPoint also need LibreOffice installed on the machine.

```bash
npm i -g https://zipwiki.ai/releases/zipwiki-0.1.0-darwin-arm64.tgz
zipwiki --help
zipwiki login
```

Pick the tarball that matches your OS and CPU. The install page lists them: https://zipwiki.ai/install

Hosted questions (`zipwiki ask` and the MCP `ask` tool) use the account from `zipwiki login`. Local pack with LiteParse does not.

Claude or Cursor, after the command is on `PATH`:

```json
{
  "mcpServers": {
    "zipwiki": {
      "command": "zipwiki-mcp"
    }
  }
}
```

See `examples/mcp.json`. Command and format notes are in `doc/`. Third-party licenses are in `THIRD_PARTY_NOTICES`.
