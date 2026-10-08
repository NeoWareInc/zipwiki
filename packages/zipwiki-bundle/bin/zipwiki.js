#!/usr/bin/env node
const entry = import.meta.resolve("@zipwiki/zipwiki");
await import(new URL("./cli.js", entry).href);
