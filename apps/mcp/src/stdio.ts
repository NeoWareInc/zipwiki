#!/usr/bin/env node
/**
 * ZipWiki MCP stdio server for Claude Code/Desktop (local .nzip via zipaccess library).
 * Remote agents that cannot see local files use hosted HTTP MCP on apps/server.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./register-tools.js";

const server = new McpServer({
  name: "zipwiki",
  version: "0.1.0",
});

registerTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);
