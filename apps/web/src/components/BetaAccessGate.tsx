import { useState, type FormEvent } from "react";
import { useAction, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { Link } from "react-router-dom";
import { api } from "@convex/_generated/api";
import {
  AuthCard,
  AuthField,
  FormError,
  authInputClassName,
  authPrimaryButtonClassName,
} from "./AuthChrome";

const CONTACT_EMAIL = "hello@zipwiki.ai";

export type BetaAccessStatus = {
  mode: "invite" | "open";
  canJoin: boolean;
  limit: number | null;
  accountCount: number | null;
  title: string | null;
  message: string | null;
  requestEnabled: boolean;
};

export function useBetaAccessStatus(): BetaAccessStatus | undefined {
  return useQuery(api.betaAccess.status) ?? undefined;
}

export function parseBetaAccessError(err: unknown): {
  code: string;
  title: string;
  message: string;
} | null {
  if (!(err instanceof ConvexError)) return null;
  const data = err.data;
  if (
    data &&
    typeof data === "object" &&
    "code" in data &&
    "message" in data &&
    typeof (data as { code: unknown }).code === "string" &&
    typeof (data as { message: unknown }).message === "string"
  ) {
    const d = data as { code: string; title?: string; message: string };
    return {
      code: d.code,
      title: d.title ?? (d.code === "invite_only" ? "Invite-only" : "At capacity"),
      message: d.message,
    };
  }
  return null;
}

/** Banner + optional waitlist form when new accounts are closed. */
export function BetaAccessNotice({
  status,
  compact,
}: {
  status: BetaAccessStatus;
  compact?: boolean;
}) {
  if (status.canJoin && status.mode === "open") return null;
  if (!status.title || !status.message) return null;

  return (
    <div
      className={
        compact
          ? "rounded-lg border border-(--border) bg-(--paper) p-4 text-left"
          : "mx-auto max-w-lg space-y-4"
      }
    >
      <div className="space-y-2">
        <h2
          className={
            compact
              ? "text-sm font-semibold text-(--ink)"
              : "font-display text-2xl font-semibold text-(--ink)"
          }
        >
          {status.title}
        </h2>
        <p className="text-sm leading-relaxed text-(--muted)">{status.message}</p>
      </div>
      {status.requestEnabled ? <BetaAccessRequestForm reason={status.mode === "invite" ? "invite" : "capacity"} /> : null}
      {!compact ? (
        <p className="text-center text-sm text-(--muted)">
          Already invited?{" "}
          <Link to="/login" className="font-medium text-(--accent) hover:underline">
            Sign in
          </Link>
          {" · "}
          <Link to="/install" className="font-medium text-(--accent) hover:underline">
            Install
          </Link>
        </p>
      ) : null}
    </div>
  );
}

function BetaAccessRequestForm({ reason }: { reason: "invite" | "capacity" }) {
  const submit = useAction(api.mail.submitAccessRequest);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState(
    reason === "invite"
      ? "Please invite me to the ZipWiki development beta."
      : "Please add me to the waitlist for the next ZipWiki beta cohort.",
  );
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      await submit({ name, email, message });
      setDone(true);
    } catch (err) {
      setError(
        err instanceof ConvexError && typeof err.data === "string"
          ? err.data
          : `Could not send your request. Email ${CONTACT_EMAIL} instead.`,
      );
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <p className="rounded-md border border-(--accent)/30 bg-(--accent)/10 px-3 py-2 text-sm text-(--ink)">
        Thanks — we received your request and will follow up at {email.trim() || "your email"}.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <FormError message={error} />
      <AuthField id="beta-name" label="Name">
        <input
          id="beta-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={authInputClassName()}
          required
        />
      </AuthField>
      <AuthField id="beta-email" label="Email">
        <input
          id="beta-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={authInputClassName()}
          required
        />
      </AuthField>
      <AuthField id="beta-message" label="Message">
        <textarea
          id="beta-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          className={authInputClassName()}
          required
        />
      </AuthField>
      <button
        type="submit"
        disabled={pending}
        className={authPrimaryButtonClassName()}
      >
        {pending
          ? "Sending…"
          : reason === "invite"
            ? "Request an invite"
            : "Join the waitlist"}
      </button>
    </form>
  );
}

/** Full-page card when signup is closed. */
export function BetaAccessClosedPage({ status }: { status: BetaAccessStatus }) {
  return (
    <AuthCard
      title={status.title ?? "Beta access"}
      subtitle={status.message ?? undefined}
    >
      {status.requestEnabled ? (
        <BetaAccessRequestForm
          reason={status.mode === "invite" ? "invite" : "capacity"}
        />
      ) : null}
      <p className="text-center text-sm text-(--muted)">
        <Link to="/login" className="font-medium text-(--accent) hover:underline">
          Sign in
        </Link>
        {" · "}
        <Link to="/install" className="font-medium text-(--accent) hover:underline">
          Install CLI
        </Link>
      </p>
    </AuthCard>
  );
}
