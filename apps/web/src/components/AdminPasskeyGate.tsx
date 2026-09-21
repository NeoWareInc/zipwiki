import { useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAction, useQuery } from "convex/react";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { api } from "@convex/_generated/api";
import { AuthBusy } from "./AuthSession";

export function AdminPasskeyGate() {
  const status = useQuery(api.adminPasskey.status);
  const beginRegistration = useAction(api.adminPasskeyNode.beginRegistration);
  const finishRegistration = useAction(api.adminPasskeyNode.finishRegistration);
  const beginAuthentication = useAction(api.adminPasskeyNode.beginAuthentication);
  const finishAuthentication = useAction(api.adminPasskeyNode.finishAuthentication);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  if (status === undefined) return <AuthBusy label="Loading…" />;
  if (!status || status.role !== "admin") {
    return <Navigate to="/dashboard" replace />;
  }
  if (status.stepUpActive) return <Outlet />;

  const registering = !status.hasPasskey;

  async function run() {
    setError("");
    setPending(true);
    const origin = window.location.origin;
    try {
      if (registering) {
        const options = await beginRegistration({ origin });
        const response = await startRegistration({ optionsJSON: options });
        await finishRegistration({ origin, response });
      } else {
        const options = await beginAuthentication({ origin });
        const response = await startAuthentication({ optionsJSON: options });
        await finishAuthentication({ origin, response });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Passkey check failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-(--paper) px-6">
      <div className="w-full max-w-md space-y-4 rounded-xl border border-(--border) bg-white p-6 shadow-soft">
        <h1 className="font-display text-2xl font-semibold">Admin passkey</h1>
        <p className="text-sm text-(--muted)">
          {registering
            ? "Register a passkey on this device before opening the admin panel."
            : "Confirm with your passkey to open the admin panel."}
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
              ? "Register passkey"
              : "Use passkey"}
        </button>
      </div>
    </div>
  );
}
