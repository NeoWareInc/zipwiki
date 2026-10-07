/** Pack / query activity fields. Absent optionals stay off the object. */

export type ActivityType = "pack" | "pack_start" | "pack_end" | "query";

export type ActivityInput = {
  type: ActivityType;
  engine?: string;
  status?: string;
  filename?: string;
  bytes?: number;
  pages?: number;
  createId?: string;
  creditCost?: number;
  llamaCredits?: number;
  inputTokens?: number;
  outputTokens?: number;
  okfCount?: number;
};

/**
 * Convex rejects an explicit `undefined` (`undefined is not a valid Convex value`).
 * Optional activity fields are omitted instead of set.
 */
export function omitUndefined<T extends Record<string, unknown>>(value: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) out[key] = item;
  }
  return out as T;
}

function trimmed(value: string | undefined, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim().slice(0, max);
  return text || undefined;
}

function finite(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Document fields for `usageEvents`, without `accountId`. */
export function activityEventFields(
  args: ActivityInput,
): Record<string, string | number> {
  const fields: Record<string, string | number> = {
    type: args.type,
    status: trimmed(args.status, 64) ?? "success",
  };
  const engine = trimmed(args.engine, 64);
  const filename = trimmed(args.filename, 512);
  const createId = trimmed(args.createId, 128);
  if (engine) fields.engine = engine;
  if (filename) fields.filename = filename;
  if (createId) fields.createId = createId;
  const numbers = {
    bytes: finite(args.bytes),
    pages: finite(args.pages),
    creditCost: finite(args.creditCost),
    llamaCredits: finite(args.llamaCredits),
    inputTokens: finite(args.inputTokens),
    outputTokens: finite(args.outputTokens),
    okfCount: finite(args.okfCount),
  };
  for (const [key, value] of Object.entries(numbers)) {
    if (value !== undefined) fields[key] = value;
  }
  return fields;
}
