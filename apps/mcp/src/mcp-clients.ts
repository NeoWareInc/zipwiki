/**
 * Where to register zipwiki-mcp. The install page and `zipwiki-mcp --help`
 * both render this list.
 */

export type McpInstallPlace = {
  name: string;
  path: string;
};

export type McpInstallBlock = {
  id: string;
  title: string;
  places: McpInstallPlace[];
  config: string;
  note?: string;
};

const MCP_SERVERS = `{
  "mcpServers": {
    "zipwiki": {
      "command": "zipwiki-mcp"
    }
  }
}`;

export const MCP_INSTALL_BLOCKS: McpInstallBlock[] = [
  {
    id: "mcp-servers",
    title: "Cursor, Claude, Windsurf, and the same JSON",
    places: [
      { name: "Cursor", path: "~/.cursor/mcp.json or .cursor/mcp.json" },
      {
        name: "Claude Desktop",
        path: "~/Library/Application Support/Claude/claude_desktop_config.json (macOS), %APPDATA%\\Claude\\claude_desktop_config.json (Windows). Settings → Developer → Edit Config.",
      },
      {
        name: "Claude Code",
        path: "~/.claude.json or .mcp.json in the project. Or: claude mcp add zipwiki -- zipwiki-mcp",
      },
      {
        name: "Windsurf",
        path: "~/.codeium/windsurf/mcp_config.json",
      },
      {
        name: "Cline",
        path: "Cline panel → MCP Servers. File: cline_mcp_settings.json in VS Code globalStorage (saoudrizwan.claude-dev).",
      },
      {
        name: "Gemini CLI",
        path: "~/.gemini/settings.json",
      },
      {
        name: "Amazon Q Developer",
        path: "~/.aws/amazonq/mcp.json or .amazonq/mcp.json",
      },
      { name: "LM Studio", path: "~/.lmstudio/mcp.json" },
      {
        name: "Junie",
        path: "~/.junie/mcp/mcp.json or .junie/mcp/mcp.json",
      },
      { name: "Kimi Code", path: "~/.kimi/mcp.json" },
      {
        name: "Kiro",
        path: "~/.kiro/settings/mcp.json or .kiro/settings/mcp.json",
      },
      {
        name: "Qwen Code",
        path: "~/.qwen/settings.json or .qwen/settings.json",
      },
      { name: "Augment Code", path: "~/.augment/settings.json" },
      {
        name: "Antigravity",
        path: "~/.gemini/config/mcp_config.json or .agents/mcp_config.json",
      },
    ],
    config: MCP_SERVERS,
  },
  {
    id: "vscode",
    title: "Visual Studio Code",
    places: [
      {
        name: "User",
        path: "~/Library/Application Support/Code/User/mcp.json (macOS), %APPDATA%\\Code\\User\\mcp.json (Windows), ~/.config/Code/User/mcp.json (Linux)",
      },
      { name: "Project", path: ".vscode/mcp.json" },
    ],
    note: "Command palette: MCP: Open User Configuration, or MCP: Open Workspace Folder MCP Configuration.",
    config: `{
  "servers": {
    "zipwiki": {
      "type": "stdio",
      "command": "zipwiki-mcp"
    }
  }
}`,
  },
  {
    id: "copilot-cli",
    title: "GitHub Copilot CLI",
    places: [{ name: "User", path: "~/.copilot/mcp-config.json" }],
    config: `{
  "mcpServers": {
    "zipwiki": {
      "command": "zipwiki-mcp",
      "tools": ["*"]
    }
  }
}`,
  },
  {
    id: "codex",
    title: "Codex CLI",
    places: [
      { name: "User", path: "~/.codex/config.toml" },
      { name: "Project", path: ".codex/config.toml" },
    ],
    config: `[mcp_servers.zipwiki]
command = "zipwiki-mcp"`,
  },
  {
    id: "zed",
    title: "Zed",
    places: [
      {
        name: "User",
        path: "~/.config/zed/settings.json (macOS and Linux), %APPDATA%\\Zed\\settings.json (Windows)",
      },
      { name: "Project", path: ".zed/settings.json" },
    ],
    config: `{
  "context_servers": {
    "zipwiki": {
      "command": "zipwiki-mcp"
    }
  }
}`,
  },
  {
    id: "continue",
    title: "Continue",
    places: [
      { name: "User", path: "~/.continue/config.yaml" },
      { name: "Project", path: ".continue/mcpServers/zipwiki.yaml" },
    ],
    note: "A new config.yaml also needs name, version, and schema at the top. The cn CLI reads this file with: cn --config ~/.continue/config.yaml",
    config: `mcpServers:
  - name: zipwiki
    command: zipwiki-mcp`,
  },
  {
    id: "goose",
    title: "Goose",
    places: [
      {
        name: "User",
        path: "~/.config/goose/config.yaml (macOS and Linux), %APPDATA%\\Block\\goose\\config\\config.yaml (Windows)",
      },
    ],
    config: `extensions:
  zipwiki:
    name: zipwiki
    cmd: zipwiki-mcp
    enabled: true
    type: stdio`,
  },
  {
    id: "opencode",
    title: "OpenCode",
    places: [
      { name: "User", path: "~/.config/opencode/opencode.json" },
      { name: "Project", path: "opencode.json" },
    ],
    config: `{
  "mcp": {
    "zipwiki": {
      "type": "local",
      "command": ["zipwiki-mcp"],
      "enabled": true
    }
  }
}`,
  },
  {
    id: "augment-ide",
    title: "Augment Code IDE",
    places: [
      {
        name: "VS Code extension",
        path: "augment.vscode-augment globalStorage mcpServers.json (JSON array). The Augment CLI uses ~/.augment/settings.json.",
      },
    ],
    config: `[
  {
    "type": "stdio",
    "name": "zipwiki",
    "command": "zipwiki-mcp"
  }
]`,
  },
];

export function formatMcpInstallBlocks(): string {
  return MCP_INSTALL_BLOCKS.map((block) => {
    const places = block.places
      .map((place) => `  ${place.name} — ${place.path}`)
      .join("\n");
    const note = block.note ? `\n${block.note}` : "";
    return `${block.title}\n${places}${note}\n\n${block.config}`;
  }).join("\n\n");
}
