import type { FastifyInstance } from "fastify";
import { createConvexGateway } from "./convex.js";
import { handleOkf, handleParse, type GatewayDeps } from "./handle.js";

function bearer(header: string | undefined): string {
  if (!header) return "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() ?? "";
}

export function gatewayDeps(overrides?: Partial<GatewayDeps>): GatewayDeps {
  return {
    convex: overrides?.convex ?? createConvexGateway(),
    fetchImpl: overrides?.fetchImpl,
    env: overrides?.env,
    sleep: overrides?.sleep,
  };
}

export async function registerGateway(
  app: FastifyInstance,
  deps: GatewayDeps,
): Promise<void> {
  app.post("/api/parse", async (req, reply) => {
    const token = bearer(req.headers.authorization);
    if (!token) return reply.code(401).send({ error: "unauthorized" });
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: "file required" });
    const bytes = await file.toBuffer();
    const fields = file.fields;
    const noOcr = readField(fields, "noOcr") === "true";
    const result = await handleParse(deps, {
      token,
      filename: file.filename,
      bytes,
      noOcr,
    });
    return reply.code(result.status).send(result.body);
  });

  app.post("/api/okf/enrich", async (req, reply) => {
    const token = bearer(req.headers.authorization);
    if (!token) return reply.code(401).send({ error: "unauthorized" });
    const body = req.body;
    if (!body || typeof body !== "object") {
      return reply.code(400).send({ error: "invalid_request" });
    }
    const result = await handleOkf(deps, {
      token,
      input: body as {
        primaries?: Array<{ path?: string; documentType?: string }>;
        parsedMarkdown?: string;
        title?: string;
        digest?: string;
        documentType?: string;
      },
    });
    return reply.code(result.status).send(result.body);
  });
}

function readField(
  fields: Record<string, unknown> | undefined,
  name: string,
): string | undefined {
  const field = fields?.[name];
  if (!field || typeof field !== "object") return undefined;
  if ("value" in field && typeof field.value === "string") return field.value;
  return undefined;
}
