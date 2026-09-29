import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { createConvexGateway } from "./convex.js";
import {
  handleOkf,
  handleParse,
  handleQueryAnswer,
  type GatewayDeps,
  type QueryExcerptInput,
} from "./handle.js";

function bearer(header: string | undefined): string {
  if (!header) return "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() ?? "";
}

function headerText(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0]?.trim() ?? "";
  return value?.trim() ?? "";
}

/** Fail closed. A missing worker secret does not open the model route. */
function workerSecretMatches(got: string, expected: string | undefined): boolean {
  const want = expected?.trim() ?? "";
  if (!want || !got) return false;
  const left = Buffer.from(got);
  const right = Buffer.from(want);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
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
  app.get("/api/client-config", async (req, reply) => {
    const token = bearer(req.headers.authorization);
    if (!token) return reply.code(401).send({ error: "unauthorized" });
    try {
      const config = await deps.convex.getClientConfig(token);
      return reply.code(200).send(config);
    } catch (err) {
      const message = err instanceof Error ? err.message : "client_config_failed";
      if (message === "unauthorized") {
        return reply.code(401).send({ error: "unauthorized" });
      }
      return reply.code(502).send({ error: message });
    }
  });

  app.get("/api/settings", async (req, reply) => {
    const token = bearer(req.headers.authorization);
    if (!token) return reply.code(401).send({ error: "unauthorized" });
    let validated;
    try {
      validated = await deps.convex.validateKey(token);
    } catch {
      return reply.code(503).send({ error: "convex_unavailable" });
    }
    if (!validated.ok) {
      return reply.code(validated.status).send({ error: validated.error });
    }
    try {
      const settings = await deps.convex.getAccountSettings(validated.accountId);
      return reply.code(200).send(settings);
    } catch (err) {
      const message = err instanceof Error ? err.message : "settings_get_failed";
      return reply.code(502).send({ error: message });
    }
  });

  app.put("/api/settings", async (req, reply) => {
    const token = bearer(req.headers.authorization);
    if (!token) return reply.code(401).send({ error: "unauthorized" });
    const body = req.body;
    if (!body || typeof body !== "object") {
      return reply.code(400).send({ error: "invalid_request" });
    }
    let validated;
    try {
      validated = await deps.convex.validateKey(token);
    } catch {
      return reply.code(503).send({ error: "convex_unavailable" });
    }
    if (!validated.ok) {
      return reply.code(validated.status).send({ error: validated.error });
    }
    const markSetupComplete =
      (body as { markSetupComplete?: unknown }).markSetupComplete === true;
    const { markSetupComplete: _m, ...settings } = body as Record<
      string,
      unknown
    >;
    try {
      const saved = await deps.convex.putAccountSettings({
        accountId: validated.accountId,
        settings,
        markSetupComplete,
      });
      return reply.code(200).send(saved);
    } catch (err) {
      const message = err instanceof Error ? err.message : "settings_put_failed";
      return reply.code(502).send({ error: message });
    }
  });

  app.post("/api/telemetry/liteparse", async (req, reply) => {
    const token = bearer(req.headers.authorization);
    if (!token) return reply.code(401).send({ error: "unauthorized" });
    const body = req.body;
    if (!body || typeof body !== "object") {
      return reply.code(400).send({ error: "invalid_request" });
    }
    const success = (body as { success?: unknown }).success;
    const bytes = (body as { bytes?: unknown }).bytes;
    if (typeof success !== "boolean") {
      return reply.code(400).send({ error: "invalid_request" });
    }
    let validated;
    try {
      validated = await deps.convex.validateKey(token);
    } catch {
      return reply.code(503).send({ error: "convex_unavailable" });
    }
    if (!validated.ok) {
      return reply.code(validated.status).send({ error: validated.error });
    }
    try {
      await deps.convex.recordLiteparse({
        accountId: validated.accountId,
        success,
        ...(typeof bytes === "number" ? { bytes } : {}),
      });
      return reply.code(200).send({ ok: true });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "liteparse_record_failed";
      return reply.code(502).send({ error: message });
    }
  });

  app.post("/api/telemetry/activity", async (req, reply) => {
    const token = bearer(req.headers.authorization);
    if (!token) return reply.code(401).send({ error: "unauthorized" });
    const body = req.body;
    if (!body || typeof body !== "object") {
      return reply.code(400).send({ error: "invalid_request" });
    }
    const type = (body as { type?: unknown }).type;
    if (type !== "pack" && type !== "query") {
      return reply.code(400).send({ error: "invalid_request" });
    }
    const engine = (body as { engine?: unknown }).engine;
    const status = (body as { status?: unknown }).status;
    const filename = (body as { filename?: unknown }).filename;
    const bytes = (body as { bytes?: unknown }).bytes;
    const pages = (body as { pages?: unknown }).pages;
    let validated;
    try {
      validated = await deps.convex.validateKey(token);
    } catch {
      return reply.code(503).send({ error: "convex_unavailable" });
    }
    if (!validated.ok) {
      return reply.code(validated.status).send({ error: validated.error });
    }
    try {
      await deps.convex.recordActivity({
        accountId: validated.accountId,
        type,
        ...(typeof engine === "string" ? { engine } : {}),
        ...(typeof status === "string" ? { status } : {}),
        ...(typeof filename === "string" ? { filename } : {}),
        ...(typeof bytes === "number" ? { bytes } : {}),
        ...(typeof pages === "number" ? { pages } : {}),
      });
      return reply.code(200).send({ ok: true });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "activity_record_failed";
      return reply.code(502).send({ error: message });
    }
  });

  app.post("/api/parse", async (req, reply) => {
    const token = bearer(req.headers.authorization);
    if (!token) return reply.code(401).send({ error: "unauthorized" });
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: "file required" });
    const bytes = await file.toBuffer();
    const fields = file.fields;
    const noOcr = readField(fields, "noOcr") === "true";
    const tier = readField(fields, "tier") || undefined;
    const version = readField(fields, "version") || undefined;
    const stream =
      (req.query as { stream?: string }).stream === "1" ||
      String(req.headers.accept ?? "").includes("application/x-ndjson");

    if (!stream) {
      const result = await handleParse(deps, {
        token,
        filename: file.filename,
        bytes,
        noOcr,
        tier,
        version,
      });
      return reply.code(result.status).send(result.body);
    }

    // NDJSON: progress lines keep the connection alive past Fly/proxy idle limits,
    // then a final result / fallback / error event.
    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
      connection: "keep-alive",
    });
    const writeLine = (obj: Record<string, unknown>) => {
      raw.write(`${JSON.stringify(obj)}\n`);
    };
    try {
      const result = await handleParse(deps, {
        token,
        filename: file.filename,
        bytes,
        noOcr,
        tier,
        version,
        onProgress: (info) => {
          writeLine({
            event: "progress",
            filename: file.filename,
            jobId: info.jobId,
            status: info.status,
            elapsedSec: info.elapsedSec,
            ...(info.progress != null ? { progress: info.progress } : {}),
            ...(info.detail ? { detail: info.detail } : {}),
          });
        },
      });
      if (result.status >= 400) {
        writeLine({
          event: "error",
          status: result.status,
          ...(typeof result.body === "object" && result.body !== null
            ? (result.body as Record<string, unknown>)
            : { error: String(result.body) }),
        });
      } else {
        writeLine({
          event: "result",
          ...(typeof result.body === "object" && result.body !== null
            ? (result.body as Record<string, unknown>)
            : { body: result.body }),
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "parse_failed";
      writeLine({ event: "error", status: 502, error: message });
    }
    raw.end();
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
    const filename = (body as { filename?: unknown }).filename;
    const jobId = (body as { jobId?: unknown }).jobId;
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
          ...(typeof filename === "string" && filename.trim()
            ? { filename: filename.trim().slice(0, 512) }
            : {}),
          ...(typeof jobId === "string" && jobId.trim()
            ? { jobId: jobId.trim().slice(0, 128) }
            : {}),
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
    const raw = body as Record<string, unknown>;
    const model = typeof raw.model === "string" ? raw.model : undefined;
    const result = await handleOkf(deps, {
      token,
      model,
      input: {
        primaries: raw.primaries as
          | Array<{ path?: string; documentType?: string }>
          | undefined,
        parsedMarkdown:
          typeof raw.parsedMarkdown === "string"
            ? raw.parsedMarkdown
            : undefined,
        title: typeof raw.title === "string" ? raw.title : undefined,
        digest: typeof raw.digest === "string" ? raw.digest : undefined,
        documentType:
          typeof raw.documentType === "string" ? raw.documentType : undefined,
      },
    });
    return reply.code(result.status).send(result.body);
  });

  app.post("/api/query/answer", async (req, reply) => {
    const env = deps.env ?? process.env;
    const secret = headerText(req.headers["x-zipwiki-worker-secret"]);
    if (!workerSecretMatches(secret, env.ZIPWIKI_WORKER_SECRET)) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const body = req.body;
    if (!body || typeof body !== "object") {
      return reply.code(400).send({ error: "invalid_request" });
    }
    const raw = body as Record<string, unknown>;
    const question = typeof raw.question === "string" ? raw.question : "";
    const excerpts = Array.isArray(raw.excerpts)
      ? raw.excerpts.flatMap((item): QueryExcerptInput[] => {
          if (!item || typeof item !== "object") return [];
          const row = item as Record<string, unknown>;
          const path = typeof row.path === "string" ? row.path : "";
          const text = typeof row.text === "string" ? row.text : "";
          const kind = row.kind === "parsed" ? "parsed" : row.kind === "okf" ? "okf" : null;
          if (!path || !kind) return [];
          const documents = Array.isArray(row.documents)
            ? row.documents.filter((path): path is string => typeof path === "string")
            : [];
          return [
            {
              path,
              text,
              kind,
              ...(typeof row.title === "string" ? { title: row.title } : {}),
              ...(documents.length > 0 ? { documents } : {}),
            },
          ];
        })
      : [];
    const result = await handleQueryAnswer(deps, { question, excerpts });
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
