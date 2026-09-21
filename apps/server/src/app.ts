import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { healthPayload, rootPayload } from "./health.js";
import { parseWebOrigins } from "./web-origin.js";
import { gatewayDeps, registerGateway } from "./gateway/routes.js";
import type { GatewayDeps } from "./gateway/handle.js";

export async function buildApp(overrides?: Partial<GatewayDeps>) {
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

  await app.register(multipart, {
    limits: { fileSize: 50 * 1024 * 1024, files: 1 },
  });

  app.get("/health", async () => healthPayload());
  app.get("/", async () => rootPayload());
  await registerGateway(app, gatewayDeps(overrides));

  return app;
}
