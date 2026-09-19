/** Crypto helpers for Convex default runtime (Web Crypto). */

export async function hashApiKey(rawKey: string): Promise<string> {
  const data = new TextEncoder().encode(rawKey);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function hashDeviceCode(deviceCode: string): Promise<string> {
  return hashApiKey(deviceCode);
}

export function generateApiKey(): { raw: string; prefix: string } {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const raw = `zc_live_${base64Url(bytes)}`;
  const prefix = raw.slice(0, 16);
  return { raw, prefix };
}

export function generateDeviceCodes(): {
  deviceCode: string;
  userCode: string;
} {
  const deviceBytes = new Uint8Array(32);
  crypto.getRandomValues(deviceBytes);
  const deviceCode = base64Url(deviceBytes);
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const codeBytes = new Uint8Array(8);
  crypto.getRandomValues(codeBytes);
  let userCode = "";
  for (let i = 0; i < 8; i++) {
    userCode += alphabet[codeBytes[i]! % alphabet.length];
    if (i === 3) userCode += "-";
  }
  return { deviceCode, userCode };
}

export function startOfMonthMs(d = new Date()): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

function base64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
