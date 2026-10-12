#!/usr/bin/env node
/**
 * ZipWiki MCP stdio server for Claude Code/Desktop (local .nzip via zipaccess library).
 * Remote agents that cannot see local files use hosted HTTP MCP on apps/server.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  maybeCheckForUpdate,
  printZipwikiBanner,
} from "@zipwiki/zipwiki/config";
import { registerTools } from "./register-tools.js";
import { formatMcpInstallHelp, shouldShowMcpInstallHelp } from "./stdio-help.js";

const args = process.argv.slice(2);
if (shouldShowMcpInstallHelp(args, process.stdin.isTTY === true)) {
  printZipwikiBanner(process.argv, console.log, undefined, "ZipWiki MCP");
  console.log("");
  console.log(formatMcpInstallHelp().trimEnd());
  process.exit(0);
}

void maybeCheckForUpdate();

const server = new McpServer({
  name: "zipwiki",
  version: "0.1.0",
});

registerTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);
