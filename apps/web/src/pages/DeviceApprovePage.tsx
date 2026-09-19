import { FormEvent, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { AuthCard, FormError } from "../components/AuthChrome";

export default function DeviceApprovePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const initial = (params.get("user_code") ?? "").toUpperCase();
  const [userCode, setUserCode] = useState(initial);
  const [error, setError] = useState("");
  const [done, setDone] = useState<"approved" | "denied" | null>(null);

  const pending = useQuery(
    api.deviceAuth.pendingByUserCode,
    userCode.replace(/-/g, "").length >= 8
      ? { userCode }
      : "skip",
  );
  const approveMut = useMutation(api.deviceAuth.approve);

  useEffect(() => {
    if (initial && initial !== userCode) setUserCode(initial);
  }, [initial, userCode]);

  async function decide(deny: boolean) {
    setError("");
    try {
      const res = await approveMut({
        userCode,
        decision: deny ? "denied" : "approved",
      });
      if (res.status === "denied") {
        setDone("denied");
      } else if (res.setup_required) {
        navigate(res.setup_url?.replace(/^https?:\/\/[^/]+/, "") || "/cli/setup");
      } else {
        setDone("approved");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
  }

  if (done === "approved") {
    return (
      <AuthCard title="CLI linked">
        <p className="text-sm text-(--muted)">
          Approved. Return to your terminal — zipwiki will finish saving the
          API key.
        </p>
        <button
          type="button"
          className="mt-4 rounded-md bg-(--accent) px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-(--accent-bright)"
          onClick={() => navigate("/dashboard/keys")}
        >
          View API keys
        </button>
      </AuthCard>
    );
  }

  if (done === "denied") {
    return (
      <AuthCard title="Request denied">
        <p className="text-sm text-(--muted)">
          The CLI login was denied. You can close this tab.
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Authorize ZipWiki CLI">
      <p className="mb-4 text-sm text-(--muted)">
        Confirm the code shown in your terminal to mint an API key for zipwiki.
      </p>
      <form onSubmit={onSubmit} className="space-y-3">
        <input
          value={userCode}
          onChange={(e) => setUserCode(e.target.value.toUpperCase())}
          placeholder="ABCD-EFGH"
          className="w-full rounded-md border border-(--border) px-3 py-2 font-mono tracking-widest"
        />
        <FormError message={error} />
        {pending === null && userCode.replace(/-/g, "").length >= 8 && (
          <p className="text-sm text-amber-700">No pending request for that code.</p>
        )}
        {pending && (
          <p className="text-sm text-(--muted)">
            Client: <strong>{pending.clientName}</strong>
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            disabled={!pending}
            onClick={() => void decide(false)}
            className="flex-1 rounded-md bg-(--accent) py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-(--accent-bright) disabled:opacity-50 disabled:hover:bg-(--accent)"
          >
            Approve
          </button>
          <button
            type="button"
            disabled={!pending}
            onClick={() => void decide(true)}
            className="flex-1 rounded-md border border-(--border) py-2 text-sm font-semibold disabled:opacity-50"
          >
            Deny
          </button>
        </div>
      </form>
    </AuthCard>
  );
}
