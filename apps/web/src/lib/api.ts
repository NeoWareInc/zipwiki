const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

if (!API_BASE && import.meta.env.PROD) {
  console.error(
    "VITE_API_URL was empty at build time — API calls will hit this site and fail with 405.",
  );
}

export function googleAuthUrl(opts?: { returnPath?: string }): string {
  const returnOrigin =
    typeof window !== "undefined" ? window.location.origin : "";
  const params = new URLSearchParams();
  if (returnOrigin) params.set("return", returnOrigin);
  if (opts?.returnPath?.startsWith("/")) {
    params.set("return_path", opts.returnPath);
  }
  const q = params.toString() ? `?${params.toString()}` : "";
  return `${API_BASE}/auth/google${q}`;
}

export type AuthUser = {
  id: string;
  email: string;
  role: string;
};

export type MeResponse = {
  user: AuthUser;
  account: {
    id: string;
    name: string;
    status: string;
    disabled: boolean;
  };
  plan: {
    slug: string;
    name: string;
    maxParsesPerMonth: number;
    maxOkfPerMonth: number;
    maxPagesPerDocument: number | null;
  } | null;
  usage: {
    parseCount: number;
    okfCount: number;
    liteparseSuccessCount?: number;
    liteparseFailCount?: number;
    periodStart: string;
  };
};

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(text.slice(0, 200) || res.statusText);
  }
  if (!res.ok) {
    const err =
      typeof data === "object" &&
      data !== null &&
      "error" in data &&
      typeof (data as { error: unknown }).error === "string"
        ? (data as { error: string }).error
        : res.statusText;
    throw new Error(err);
  }
  return data as T;
}

export const api = {
  me: () => request<MeResponse>("/auth/me"),
  authProviders: () =>
    request<{ google: boolean; password: boolean }>("/auth/providers"),
  login: (email: string, password: string) =>
    request<{ user: AuthUser }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  signup: (email: string, password: string) =>
    request<{ user: AuthUser; apiKey: string }>("/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  logout: () =>
    request<{ ok: boolean }>("/auth/logout", { method: "POST" }),
  usage: () =>
    request<{
      parseCount: number;
      okfCount: number;
      liteparseSuccessCount: number;
      liteparseFailCount: number;
      maxParses: number;
      maxOkf: number;
      maxPagesPerDocument: number | null;
      periodStart: string;
    }>("/account/usage"),
  keys: () =>
    request<
      Array<{
        id: string;
        name: string;
        prefix: string;
        lastUsedAt: string | null;
        createdAt: string;
      }>
    >("/account/keys"),
  createKey: (name?: string) =>
    request<{ id: string; name: string; prefix: string; key: string }>(
      "/account/keys",
      { method: "POST", body: JSON.stringify({ name }) },
    ),
  revokeKey: (id: string) =>
    request<{ ok: boolean }>(`/account/keys/${id}`, { method: "DELETE" }),
  devicePending: (userCode: string) =>
    request<{
      user_code: string;
      client_name: string;
      expires_at: string;
    }>(`/auth/device/pending?user_code=${encodeURIComponent(userCode)}`),
  deviceApprove: (userCode: string, opts?: { deny?: boolean; keyName?: string }) =>
    request<{
      ok: boolean;
      status: string;
      key_prefix?: string;
      setup_required?: boolean;
      setup_url?: string | null;
    }>("/auth/device/approve", {
      method: "POST",
      body: JSON.stringify({
        user_code: userCode,
        deny: opts?.deny === true,
        key_name: opts?.keyName,
      }),
    }),
  getSettings: () =>
    request<{
      settings: import("@zipwiki/api-client").AccountSettingsBody;
      setupComplete: boolean;
      setupCompletedAt: string | null;
      updatedAt: string | null;
      setupUrl?: string | null;
    }>("/account/settings"),
  putSettings: (
    body: import("@zipwiki/api-client").AccountSettingsBodyInput & {
      markSetupComplete?: boolean;
    },
  ) =>
    request<{
      settings: import("@zipwiki/api-client").AccountSettingsBody;
      setupComplete: boolean;
      setupCompletedAt: string | null;
      updatedAt: string | null;
    }>("/account/settings", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  subscription: () =>
    request<{
      status: string;
      plan: MeResponse["plan"];
      stripeCustomerId: string | null;
    }>("/account/subscription"),
  checkout: (usdCents: number) =>
    request<{ url: string; via?: "checkout" | "portal" }>("/account/checkout", {
      method: "POST",
      body: JSON.stringify({ usdCents }),
    }),
  billingPortal: () =>
    request<{ url: string }>("/account/billing-portal", { method: "POST" }),
  adminAccounts: (search?: string) =>
    request<
      Array<{
        id: string;
        userId: string;
        name: string;
        email: string;
        role: string;
        auth: string;
        status: string;
        disabled: boolean;
        createdAt: string;
        plan: { slug: string; name: string };
        usage: { parseCount: number; okfCount: number };
      }>
    >(`/admin/accounts${search ? `?search=${encodeURIComponent(search)}` : ""}`),
  adminAccount: (id: string) =>
    request<{
      account: {
        id: string;
        userId: string;
        name: string;
        email: string;
        role: string;
        auth: string;
        status: string;
        disabled: boolean;
        stripeCustomerId: string | null;
        createdAt: string;
        plan: {
          slug: string;
          name: string;
          maxParses: number;
          maxOkf: number;
        };
      };
      keys: Array<{
        id: string;
        name: string;
        prefix: string;
        revoked: boolean;
        lastUsedAt: string | null;
        createdAt: string;
      }>;
      periods: Array<{
        periodStart: string;
        parseCount: number;
        okfCount: number;
      }>;
      events: Array<{
        type: string;
        engine: string | null;
        bytes: number | null;
        createdAt: string;
      }>;
    }>(`/admin/accounts/${id}`),
  adminDisable: (id: string, disabled = true) =>
    request<{ ok: boolean }>(`/admin/accounts/${id}/disable`, {
      method: "POST",
      body: JSON.stringify({ disabled }),
    }),
  adminSetPlan: (id: string, plan: string) =>
    request<{ ok: boolean; plan: string }>(`/admin/accounts/${id}/plan`, {
      method: "POST",
      body: JSON.stringify({ plan }),
    }),
  adminSetRole: (id: string, role: "admin" | "customer") =>
    request<{ ok: boolean; role: string }>(`/admin/accounts/${id}/role`, {
      method: "POST",
      body: JSON.stringify({ role }),
    }),
  adminRevokeKeys: (id: string) =>
    request<{ ok: boolean }>(`/admin/accounts/${id}/revoke-keys`, {
      method: "POST",
    }),
  adminDeleteAccount: (id: string) =>
    request<{ ok: boolean }>(`/admin/accounts/${id}`, { method: "DELETE" }),
  adminSummary: () =>
    request<{
      accounts: number;
      admins: number;
      totalParses: number;
      totalOkf: number;
      disabledAccounts: number;
    }>("/admin/usage/summary"),
};
