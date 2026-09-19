/** Comma-separated marketing / dashboard origins for CORS. */
export function parseWebOrigins(): string[] {
  const raw =
    process.env.WEB_ORIGIN?.trim() ||
    "http://localhost:5173,http://localhost:5174";
  return raw
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

export function primaryWebOrigin(): string {
  return parseWebOrigins()[0] || "http://localhost:5173";
}

export function isAllowedWebOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  const normalized = origin.trim().replace(/\/$/, "");
  return parseWebOrigins().includes(normalized);
}
