import { loadServerEnv } from "./load-server-env.js";
import { isConvexConfigured } from "./health.js";
import { buildApp } from "./app.js";

loadServerEnv();

const PORT = Number(process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? "0.0.0.0";

const app = await buildApp();
await app.listen({ port: PORT, host: HOST });

const linkHost = HOST === "0.0.0.0" || HOST === "::" ? "localhost" : HOST;
const url = `http://${linkHost}:${PORT}`;

console.log("");
console.log("  ZipWiki server");
console.log(`  ${url}`);
console.log(
  `  product backend: ${isConvexConfigured() ? "Convex" : "open (no Convex — Phase 1b health only)"}`,
);
console.log("");
