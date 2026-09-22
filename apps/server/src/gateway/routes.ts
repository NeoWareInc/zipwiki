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

  app.post("/api/usage/llamaparse", async (req, reply) => {
    const token = bearer(req.headers.authorization);
    if (!token) return reply.code(401).send({ error: "unauthorized" });
    const body = req.body;
    if (!body || typeof body !== "object") {
      return reply.code(400).send({ error: "invalid_request" });
    }
    const llamaCredits = (body as { llamaCredits?: unknown }).llamaCredits;
    const pages = (body as { pages?: unknown }).pages;
    const bytes = (body as { bytes?: unknown }).bytes;
    let validated;
    try {
      validated = await deps.convex.validateKey(token, "parse");
    } catch {
      return reply.code(503).send({ error: "convex_unavailable" });
    }
    if (!validated.ok) {
      return reply.code(validated.status).send({ error: validated.error });
    }
    if (!validated.billable || validated.fallback) {
      return reply.code(402).send({ error: "quota_fallback_free" });
    }
    try {
      const recorded = await deps.convex.recordUsage({
        accountId: validated.accountId,
        kind: "parse",
        billable: true,
        usage: {
          provider: "llamaparse",
          engine: "llamaparse",
          ...(typeof pages === "number" ? { pages } : {}),
          ...(typeof bytes === "number" ? { bytes } : {}),
          ...(typeof llamaCredits === "number" ? { llamaCredits } : {}),
        },
      });
      return reply.code(200).send({ ok: true, ...recorded });
    } catch (err) {
      const message = err instanceof Error ? err.message : "record_usage_failed";
      return reply.code(502).send({ error: message });
    }
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
