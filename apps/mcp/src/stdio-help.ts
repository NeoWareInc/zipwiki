/**
 * Shown when a person runs zipwiki-mcp in a terminal.
 * Agents launch this process with stdin piped, and that path stays silent.
 */
import { formatMcpInstallBlocks } from "./mcp-clients.js";

export function shouldShowMcpInstallHelp(
  argv: readonly string[],
  stdinIsTTY: boolean,
): boolean {
  if (argv.includes("--help") || argv.includes("-h")) return true;
  return stdinIsTTY;
}

export function formatMcpInstallHelp(): string {
  return [
    "zipwiki-mcp is the ZipWiki MCP server.",
    "It speaks MCP on standard input. zipwiki-mcp must be on your PATH.",
    "",
    formatMcpInstallBlocks(),
    "",
    "Install ZipWiki from https://zipwiki.ai/install",
    "Then run: zipwiki --help",
    "",
  ].join("\n");
}
