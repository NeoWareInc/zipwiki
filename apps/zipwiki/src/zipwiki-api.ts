/**
 * Lightweight ZipWiki API client for setup (health + account auth).
 * Parse/OKF still use Bearer API keys; this module obtains that key via login/signup.
 */

export type ZipWikiHealth = {
  status?: string;
  database?: boolean;
  apiKeysRequired?: boolean;
  anthropicConfigured?: boolean;
  llamaparseConfigured?: boolean;
};

export type ZipWikiAuthUser = {
  id: string;
  email: string;
  role: string;
};

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

function joinUrl(base: string, path: string): string {
  return `${normalizeBaseUrl(base)}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Extract `zipwiki_session` from a Set-Cookie header list. */
export function extractSessionCookie(
  setCookie: string | string[] | null,
): string | undefined {
  if (!setCookie) return undefined;
  const headers = Array.isArray(setCookie) ? setCookie : [setCookie];
  for (const header of headers) {
    const match = header.match(/(?:^|,\s*)zipwiki_session=([^;,\s]+)/i);
    if (match?.[1]) return match[1];
  }
  // Some runtimes join multiple Set-Cookie with ", " which can break cookie
  // values; also try a simpler first-cookie parse.
  for (const header of headers) {
    const first = header.split(";")[0]?.trim() ?? "";
    if (first.toLowerCase().startsWith("zipwiki_session=")) {
      return first.slice("zipwiki_session=".length);
    }
  }
  return undefined;
}

export async function fetchZipWikiHealth(
  baseUrl: string,
): Promise<ZipWikiHealth> {
  const res = await fetch(joinUrl(baseUrl, "/health"), {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(
      `ZipWiki API health check failed (${res.status}) at ${normalizeBaseUrl(baseUrl)}`,
    );
  }
  return (await res.json()) as ZipWikiHealth;
}

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    if (body.error) return body.error;
  } catch {
    /* ignore */
  }
  return res.statusText || `HTTP ${res.status}`;
}

export async function signupZipWikiAccount(input: {
  baseUrl: string;
  email: string;
  password: string;
  name?: string;
}): Promise<{ user: ZipWikiAuthUser; apiKey: string }> {
  const res = await fetch(joinUrl(input.baseUrl, "/auth/signup"), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: input.email,
      password: input.password,
      name: input.name,
    }),
  });
  if (!res.ok) {
    throw new Error(`Signup failed: ${await readError(res)}`);
  }
  const body = (await res.json()) as {
    user: ZipWikiAuthUser;
    apiKey: string;
  };
  if (!body.apiKey?.trim()) {
    throw new Error("Signup succeeded but no API key was returned");
  }
  return { user: body.user, apiKey: body.apiKey.trim() };
}

export async function loginZipWikiAccount(input: {
  baseUrl: string;
  email: string;
  password: string;
}): Promise<{ user: ZipWikiAuthUser; sessionId: string }> {
  const res = await fetch(joinUrl(input.baseUrl, "/auth/login"), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: input.email,
      password: input.password,
    }),
  });
  if (!res.ok) {
    throw new Error(`Login failed: ${await readError(res)}`);
  }
  const body = (await res.json()) as { user: ZipWikiAuthUser };
  const rawCookie =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : res.headers.get("set-cookie");
  const sessionId = extractSessionCookie(rawCookie);
  if (!sessionId) {
    throw new Error(
      "Login succeeded but no session cookie was returned. Prefer: zipwiki auth login (device code → Convex).",
    );
  }
  return { user: body.user, sessionId };
}

export async function createZipwikiApiKey(input: {
  baseUrl: string;
  sessionId: string;
  name?: string;
}): Promise<{ id: string; prefix: string; key: string }> {
  const res = await fetch(joinUrl(input.baseUrl, "/account/keys"), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Cookie: `zipwiki_session=${input.sessionId}`,
    },
    body: JSON.stringify({ name: input.name ?? "zipwiki CLI" }),
  });
  if (!res.ok) {
    throw new Error(`Create API key failed: ${await readError(res)}`);
  }
  const body = (await res.json()) as {
    id: string;
    prefix: string;
    key: string;
  };
  if (!body.key?.trim()) {
    throw new Error("Create key succeeded but no raw key was returned");
  }
  return { id: body.id, prefix: body.prefix, key: body.key.trim() };
}

/**
 * Obtain a ZipWiki API key by signing up or logging in against the server.
 * Signup returns the key directly; login creates a new CLI key via session.
 */
export async function obtainZipwikiApiKey(input: {
  baseUrl: string;
  email: string;
  password: string;
  mode: "signup" | "login";
  name?: string;
}): Promise<{ apiKey: string; email: string }> {
  if (input.mode === "signup") {
    const { user, apiKey } = await signupZipWikiAccount({
      baseUrl: input.baseUrl,
      email: input.email,
      password: input.password,
      name: input.name,
    });
    return { apiKey, email: user.email };
  }

  const { user, sessionId } = await loginZipWikiAccount({
    baseUrl: input.baseUrl,
    email: input.email,
    password: input.password,
  });
  const created = await createZipwikiApiKey({
    baseUrl: input.baseUrl,
    sessionId,
    name: "zipwiki CLI",
  });
  return { apiKey: created.key, email: user.email };
}
