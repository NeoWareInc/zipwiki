/** Read LlamaParse `job.usage.credits` from a v1 or v2 job payload. */
export function llamaCreditsFromPayload(body: unknown): number | null {
  if (!body || typeof body !== "object") return null;
  const root = body as Record<string, unknown>;
  const job =
    root.job && typeof root.job === "object"
      ? (root.job as Record<string, unknown>)
      : root;
  const usage = job.usage;
  if (usage && typeof usage === "object") {
    const credits = (usage as { credits?: unknown }).credits;
    if (typeof credits === "number" && Number.isFinite(credits)) return credits;
  }
  if (typeof job.credits_used === "number" && Number.isFinite(job.credits_used)) {
    return job.credits_used;
  }
  const meta = job.job_metadata;
  if (meta && typeof meta === "object") {
    const credits = (meta as { credits_used?: unknown }).credits_used;
    if (typeof credits === "number" && Number.isFinite(credits)) return credits;
  }
  return null;
}

export function jobIdFromPayload(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const root = body as Record<string, unknown>;
  const job =
    root.job && typeof root.job === "object"
      ? (root.job as Record<string, unknown>)
      : root;
  return typeof job.id === "string" && job.id.trim() ? job.id : null;
}
