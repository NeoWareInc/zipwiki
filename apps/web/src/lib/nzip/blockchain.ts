import type { ZipReaderBrowser } from "neozipkit/browser";

export type BlockchainState = "tokenized" | "timestamped" | "pending";

export type BlockchainBadge = {
  state: BlockchainState;
  /** Short label for the badge text. */
  label: string;
  /** Optional hover text (network / token id) from the sidecar JSON. */
  title?: string;
};

const LABELS: Record<BlockchainState, string> = {
  tokenized: "Tokenized",
  timestamped: "Timestamped",
  pending: "Stamp pending",
};

const TOKEN_PATHS = ["meta-inf/token.nzip", "meta-inf/nzip.token"];
const TIMESTAMP_PATH = "meta-inf/timestamp.nzip";
const SUBMIT_PATH = "meta-inf/ts-submit.nzip";

function pickString(
  record: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const v = record[key];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return undefined;
}

/** Best-effort title from a sidecar JSON body; never throws. */
async function sidecarTitle(
  reader: ZipReaderBrowser,
  name: string,
): Promise<string | undefined> {
  try {
    const bytes = await reader.readEntry(name);
    if (bytes.byteLength > 64 * 1024) return undefined;
    const parsed: unknown = JSON.parse(new TextDecoder("utf-8").decode(bytes));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return undefined;
    }
    const root = parsed as Record<string, unknown>;
    const nested =
      root.metadata && typeof root.metadata === "object"
        ? (root.metadata as Record<string, unknown>)
        : {};
    const lookup = (keys: string[]) =>
      pickString(root, keys) ?? pickString(nested, keys);
    const network = lookup(["network", "networkName", "chain", "chainId"]);
    const tokenId = lookup(["tokenId", "token_id"]);
    const parts = [
      network ? `Network: ${network}` : null,
      tokenId ? `Token ID: ${tokenId}` : null,
    ].filter((p): p is string => p !== null);
    return parts.length > 0 ? parts.join(" · ") : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Lightweight badge from reserved META-INF sidecars (no chain access).
 * TOKEN → tokenized, TIMESTAMP → timestamped, TS-SUBMIT alone → pending.
 */
export async function detectBlockchainBadge(
  reader: ZipReaderBrowser,
  entryNames: string[],
): Promise<BlockchainBadge | null> {
  const byLower = new Map<string, string>();
  for (const name of entryNames) {
    const lower = name.toLowerCase();
    if (!byLower.has(lower)) byLower.set(lower, name);
  }
  const token = TOKEN_PATHS.map((p) => byLower.get(p)).find(Boolean);
  const stamp = byLower.get(TIMESTAMP_PATH);
  const submit = byLower.get(SUBMIT_PATH);

  let state: BlockchainState | null = null;
  let sidecar: string | undefined;
  if (token) {
    state = "tokenized";
    sidecar = token;
  } else if (stamp) {
    state = "timestamped";
    sidecar = stamp;
  } else if (submit) {
    state = "pending";
    sidecar = submit;
  }
  if (!state || !sidecar) return null;
  const title = await sidecarTitle(reader, sidecar);
  return { state, label: LABELS[state], ...(title ? { title } : {}) };
}
