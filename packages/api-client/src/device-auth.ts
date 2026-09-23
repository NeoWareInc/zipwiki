import { apiFetch, ZipwikiApiError } from "./client-config.js";
import {
  DeviceCodeResponseSchema,
  type DeviceCodeResponse,
  type DeviceTokenResult,
} from "./types.js";

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { error: text.slice(0, 200) };
  }
}

export async function requestDeviceCode(
  baseUrl: string,
): Promise<DeviceCodeResponse> {
  const res = await apiFetch(baseUrl, "/auth/device/code", {
    method: "POST",
    body: JSON.stringify({ client: "zipwiki" }),
  });
  const body = await readBody(res);
  if (!res.ok) {
    const msg =
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof (body as { error: unknown }).error === "string"
        ? (body as { error: string }).error
        : res.statusText;
    throw new ZipwikiApiError(msg, res.status, body);
  }
  return DeviceCodeResponseSchema.parse(body);
}

export async function pollDeviceToken(
  baseUrl: string,
  deviceCode: string,
): Promise<DeviceTokenResult> {
  const res = await apiFetch(baseUrl, "/auth/device/token", {
    method: "POST",
    body: JSON.stringify({ device_code: deviceCode }),
  });
  const body = (await readBody(res)) as Record<string, unknown>;

  if (res.status === 400) {
    const err =
      typeof body.error === "string" ? body.error : "authorization_pending";
    if (err === "authorization_pending") {
      return { status: "authorization_pending" };
    }
    if (err === "slow_down") {
      return {
        status: "slow_down",
        interval:
          typeof body.interval === "number" ? body.interval : undefined,
      };
    }
    if (err === "expired_token" || err === "access_denied") {
      return { status: err };
    }
    return { status: "error", error: err };
  }

  if (!res.ok) {
    const msg =
      typeof body.error === "string" ? body.error : res.statusText;
    throw new ZipwikiApiError(msg, res.status, body);
  }

  if (
    typeof body.api_key !== "string" ||
    typeof body.api_url !== "string" ||
    typeof body.key_prefix !== "string"
  ) {
    throw new ZipwikiApiError("invalid_device_token_response", res.status, body);
  }

  return {
    status: "approved",
    api_key: body.api_key,
    key_prefix: body.key_prefix,
    api_url: body.api_url,
    ...(typeof body.email === "string" && body.email.trim()
      ? { email: body.email.trim() }
      : {}),
  };
}

export async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

/** Poll until approved, denied, or expired. */
export async function waitForDeviceApproval(
  baseUrl: string,
  deviceCode: string,
  opts: { intervalSec: number; expiresInSec: number; signal?: AbortSignal },
): Promise<Extract<DeviceTokenResult, { status: "approved" }>> {
  const deadline = Date.now() + opts.expiresInSec * 1000;
  let intervalMs = Math.max(1, opts.intervalSec) * 1000;

  while (Date.now() < deadline) {
    if (opts.signal?.aborted) {
      throw new Error("Device login aborted");
    }
    const result = await pollDeviceToken(baseUrl, deviceCode);
    if (result.status === "approved") return result;
    if (result.status === "slow_down") {
      intervalMs = Math.max(
        intervalMs + 1000,
        (result.interval ?? opts.intervalSec) * 1000,
      );
    } else if (result.status === "expired_token") {
      throw new Error("Device code expired — run auth login again");
    } else if (result.status === "access_denied") {
      throw new Error("Device login was denied in the browser");
    } else if (result.status === "error") {
      throw new Error(result.error ?? "Device login failed");
    }
    await sleep(intervalMs);
  }
  throw new Error("Device code expired — run auth login again");
}
