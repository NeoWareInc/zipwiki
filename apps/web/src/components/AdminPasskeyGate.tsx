import { useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAction, useQuery } from "convex/react";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { api } from "@convex/_generated/api";
import { AuthBusy } from "./AuthSession";

function isPasskeyUnavailable(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const name = "name" in err ? String((err as { name?: string }).name) : "";
  const msg = err.message.toLowerCase();
  return (
    name === "NotAllowedError" ||
    name === "AbortError" ||
    name === "InvalidStateError" ||
    name === "NotSupportedError" ||
    msg.includes("not allowed") ||
    msg.includes("no authenticator") ||
    msg.includes("no credentials") ||
    msg.includes("timed out") ||
    msg.includes("cancel")
  );
}

export function AdminPasskeyGate() {
  const status = useQuery(api.adminPasskey.status);
  const beginRegistration = useAction(api.adminPasskeyNode.beginRegistration);
  const finishRegistration = useAction(api.adminPasskeyNode.finishRegistration);
  const beginAuthentication = useAction(api.adminPasskeyNode.beginAuthentication);
  const finishAuthentication = useAction(api.adminPasskeyNode.finishAuthentication);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  /** User chose to create a Chrome passkey even if one is already on file. */
  const [addingChromePasskey, setAddingChromePasskey] = useState(false);

  if (status === undefined) return <AuthBusy label="Loading…" />;
  if (!status || status.role !== "admin") {
    return <Navigate to="/dashboard" replace />;
  }
  if (status.stepUpActive) return <Outlet />;

  const registering = !status.hasPasskey || addingChromePasskey;

  async function runRegister() {
    const origin = window.location.origin;
    const options = await beginRegistration({ origin });
    const response = await startRegistration({ optionsJSON: options });
    await finishRegistration({ origin, response });
    setAddingChromePasskey(false);
  }

  async function runAuthenticate() {
    const origin = window.location.origin;
    const options = await beginAuthentication({ origin });
    const response = await startAuthentication({ optionsJSON: options });
    await finishAuthentication({ origin, response });
  }

  async function run() {
    setError("");
    setPending(true);
    try {
      if (registering) {
        await runRegister();
      } else {
        await runAuthenticate();
      }
    } catch (err) {
      if (!registering && isPasskeyUnavailable(err)) {
        setAddingChromePasskey(true);
        setError(
          "No Chrome passkey is available on this computer. Add one below (Google Password Manager in Chrome) — do not use your iPhone.",
        );
      } else {
        setError(err instanceof Error ? err.message : "Passkey check failed");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-(--paper) px-6">
      <div className="w-full max-w-md space-y-4 rounded-xl border border-(--border) bg-(--surface) p-6 shadow-soft">
        <h1 className="font-display text-2xl font-semibold">Admin passkey</h1>
        <p className="text-sm text-(--muted)">
          {registering
            ? "Create a passkey in Google Chrome on this computer (Google Password Manager). Do not choose iPhone, QR code, or another device."
            : "Confirm with the Chrome passkey saved on this computer."}
        </p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="button"
          disabled={pending}
          onClick={() => void run()}
          className="rounded-md bg-(--accent) px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {pending
            ? "Waiting for passkey…"
            : registering
              ? "Add Chrome passkey"
              : "Use Chrome passkey"}
        </button>
        {!registering && (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setError("");
              setAddingChromePasskey(true);
            }}
            className="block text-sm font-medium text-(--accent) hover:underline disabled:opacity-50"
          >
            Add a Chrome passkey instead
          </button>
        )}
        {addingChromePasskey && status.hasPasskey && (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setError("");
              setAddingChromePasskey(false);
            }}
            className="block text-sm text-(--muted) hover:underline disabled:opacity-50"
          >
            Back to unlock
          </button>
        )}
      </div>
    </div>
  );
}
