# ZipWiki

The `zipwiki` command packs documents into a `.zipwiki` and queries that package on this machine. `zipwiki-mcp` is the stdio server for Claude and Cursor. LiteParse is included. This package is not published on the public npm registry.

Requires Node.js 22.23.4 or newer (or 24.22.1+ / 26.12.1+ — Oct 2026 Brotli security fix). Word, Excel, and PowerPoint also need LibreOffice installed on the machine.

```bash
npm i -g --allow-remote=root https://zipwiki.ai/releases/zipwiki-0.2.0-darwin-arm64.tgz
zipwiki --help
zipwiki login
```

Starting in npm 12, `--allow-remote=root` is required when installing a tarball directly from an HTTPS URL (or download the `.tgz` file first and run `npm i -g ./zipwiki-0.2.0-darwin-arm64.tgz`). Pick the tarball that matches your OS and CPU. The install page lists them: https://zipwiki.ai/install

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
