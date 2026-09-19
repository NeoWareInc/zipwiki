import Fastify from "fastify";
import cors from "@fastify/cors";
import { healthPayload, rootPayload } from "./health.js";
import { parseWebOrigins } from "./web-origin.js";

export async function buildApp() {
  const app = Fastify({ logger: false });

  await app.register(cors, {
    origin(origin, cb) {
      const allowed = parseWebOrigins();
      if (!origin) {
        cb(null, true);
        return;
      }
      if (allowed.includes(origin.replace(/\/$/, ""))) {
        cb(null, origin);
        return;
      }
      cb(null, false);
    },
    credentials: true,
  });

  app.get("/health", async () => healthPayload());
  app.get("/", async () => rootPayload());

  return app;
}
