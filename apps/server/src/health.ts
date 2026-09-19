export const SERVER_PHASE = "1b";
export const SERVICE_NAME = "zipwiki";

export function isConvexConfigured(): boolean {
  return Boolean(
    process.env.CONVEX_SITE_URL?.trim() || process.env.CONVEX_URL?.trim(),
  );
}

export function healthPayload() {
  return {
    status: "ok" as const,
    service: SERVICE_NAME,
    phase: SERVER_PHASE,
    database: false,
    convex: isConvexConfigured(),
    apiKeysRequired: false,
    llamaparseConfigured: Boolean(process.env.LLAMA_CLOUD_API_KEY?.trim()),
    anthropicConfigured: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
  };
}

export function rootPayload() {
  return {
    name: SERVICE_NAME,
    message: "ZipWiki API",
    phase: SERVER_PHASE,
    health: "/health",
  };
}
