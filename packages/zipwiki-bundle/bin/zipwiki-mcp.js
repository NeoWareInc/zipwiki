#!/usr/bin/env node
const entry = import.meta.resolve("@zipwiki/mcp");
await import(new URL("./stdio.js", entry).href);
