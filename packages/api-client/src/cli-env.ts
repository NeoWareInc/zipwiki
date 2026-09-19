/**
 * Connection profile for CLI ↔ hosted API (URL + key only).
 * Parse/OKF credential flags are not included — hosted is inferred from URL+key.
 */

export type CliConnectionEnv = {
  ZIPWIKI_API_URL: string;
  ZIPWIKI_API_KEY: string;
};

export function formatCliEnv(conn: CliConnectionEnv): string {
  const url = conn.ZIPWIKI_API_URL.trim().replace(/\/+$/, "");
  const key = conn.ZIPWIKI_API_KEY.trim();
  return (
    `# ZipWiki CLI connection — do not commit\n` +
    `ZIPWIKI_API_URL=${JSON.stringify(url)}\n` +
    `ZIPWIKI_API_KEY=${JSON.stringify(key)}\n`
  );
}

/** Parse a downloaded zipwiki-cli.env (or similar) into URL + key. */
export function parseCliEnv(text: string): CliConnectionEnv {
  const map: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
      value = value
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\");
    }
    map[key] = value;
  }

  const url = map.ZIPWIKI_API_URL?.trim();
  const apiKey = map.ZIPWIKI_API_KEY?.trim();
  if (!url) throw new Error("CLI env missing ZIPWIKI_API_URL");
  if (!apiKey) throw new Error("CLI env missing ZIPWIKI_API_KEY");
  return {
    ZIPWIKI_API_URL: url.replace(/\/+$/, ""),
    ZIPWIKI_API_KEY: apiKey,
  };
}

/** Optional JSON twin: { version, apiUrl, apiKey }. */
export function parseCliEnvJson(raw: unknown): CliConnectionEnv {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("CLI JSON must be an object");
  }
  const o = raw as Record<string, unknown>;
  const url =
    (typeof o.apiUrl === "string" && o.apiUrl) ||
    (typeof o.ZIPWIKI_API_URL === "string" && o.ZIPWIKI_API_URL) ||
    "";
  const key =
    (typeof o.apiKey === "string" && o.apiKey) ||
    (typeof o.ZIPWIKI_API_KEY === "string" && o.ZIPWIKI_API_KEY) ||
    "";
  if (!url.trim()) throw new Error("CLI JSON missing apiUrl");
  if (!key.trim()) throw new Error("CLI JSON missing apiKey");
  return {
    ZIPWIKI_API_URL: url.trim().replace(/\/+$/, ""),
    ZIPWIKI_API_KEY: key.trim(),
  };
}
