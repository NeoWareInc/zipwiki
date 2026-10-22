import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { AdminCreditsLock } from "../components/AdminCreditsLock";

export default function AdminPage() {
  const [search, setSearch] = useState("");
  const [actionError, setActionError] = useState("");
  const [creditDrafts, setCreditDrafts] = useState<Record<string, string>>({});
  const accounts = useQuery(api.admin.listAccounts, {
    search: search || undefined,
  });
  const summary = useQuery(api.admin.summary);
  const setDisabled = useMutation(api.admin.setDisabled);
  const setRole = useMutation(api.admin.setRole);
  const setCreditsUnlimited = useMutation(api.admin.setCreditsUnlimited);
  const setCreditsLocked = useMutation(api.admin.setCreditsLocked);
  const adjustCredits = useMutation(api.admin.adjustCredits);
  const deleteAccount = useMutation(api.admin.deleteAccount);

  const list = (accounts ?? []) as Array<{
    id: string;
    email: string;
    name: string;
    role: string;
    status: string;
    disabled: boolean;
    creditsLocked?: boolean;
    usage: { parseCount: number; okfCount: number };
    creditsRemaining?: number;
    creditsUnlimited?: boolean;
  }>;
  const admins = list.filter((a) => a.role === "admin");
  const customers = list.filter((a) => a.role !== "admin");

  async function toggleLocked(accountId: string, locked: boolean) {
    setActionError("");
    try {
      await setCreditsLocked({
        id: accountId as Id<"accounts">,
        locked,
      });
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to update the credit lock",
      );
    }
  }

  async function toggleDisabled(accountId: string, disabled: boolean) {
    setActionError("");
    try {
      await setDisabled({
        id: accountId as Id<"accounts">,
        disabled,
      });
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to update login access",
      );
    }
  }

  async function removeAccount(accountId: string, email: string) {
    const ok = window.confirm(
      `Permanently delete ${email}? This removes their profile, login, API keys, and usage history. This cannot be undone.`,
    );
    if (!ok) return;
    setActionError("");
    try {
      await deleteAccount({ id: accountId as Id<"accounts"> });
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to delete account",
      );
    }
  }

  async function toggleUnlimited(accountId: string, unlimited: boolean) {
    setActionError("");
    try {
      await setCreditsUnlimited({
        id: accountId as Id<"accounts">,
        unlimited,
      });
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to update credits",
      );
    }
  }

  async function adjustAccountCredits(accountId: string, sign: 1 | -1) {
    setActionError("");
    const raw = creditDrafts[accountId] ?? "100";
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) {
      setActionError("Enter a positive credit amount");
      return;
    }
    try {
      await adjustCredits({
        id: accountId as Id<"accounts">,
        credits: sign * n,
      });
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to adjust credits",
      );
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Users</h1>
        <p className="mt-1 text-sm text-(--muted)">
          Manage accounts, roles, credits, and access. Only visible to admins.
        </p>
      </div>

      {summary && (
        <div className="grid gap-4 md:grid-cols-5">
          <Stat label="Accounts" value={summary.accounts} />
          <Stat label="Admins" value={summary.admins} />
          <Stat label="Total parses" value={summary.totalParses} />
          <Stat label="Total OKF" value={summary.totalOkf} />
          <Stat label="Disabled" value={summary.disabledAccounts} />
        </div>
      )}

      <AdminCreditsLock />
      <AdminBetaInvites />

      {actionError && <p className="text-sm text-red-600">{actionError}</p>}

      <input
        type="search"
        placeholder="Search email, name, or role…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full max-w-md rounded-md border border-(--border) px-3 py-2 text-sm"
      />

      <AccountTable
        title="Admins"
        rows={admins}
        emptyLabel="No admins found."
        creditDrafts={creditDrafts}
        onCreditDraftChange={(id, value) =>
          setCreditDrafts((prev) => ({ ...prev, [id]: value }))
        }
        onAdjustCredits={(id, sign) => void adjustAccountCredits(id, sign)}
        onDisable={(id, disabled) => void toggleDisabled(id, disabled)}
        onDelete={(id, email) => void removeAccount(id, email)}
        onSetRole={(id, role) =>
          void setRole({ id: id as Id<"accounts">, role })
        }
        onSetUnlimited={(id, unlimited) => void toggleUnlimited(id, unlimited)}
        onSetLocked={(id, locked) => void toggleLocked(id, locked)}
      />
      <AccountTable
        title="Customers"
        rows={customers}
        emptyLabel="No customers found."
        creditDrafts={creditDrafts}
        onCreditDraftChange={(id, value) =>
          setCreditDrafts((prev) => ({ ...prev, [id]: value }))
        }
        onAdjustCredits={(id, sign) => void adjustAccountCredits(id, sign)}
        onDisable={(id, disabled) => void toggleDisabled(id, disabled)}
        onDelete={(id, email) => void removeAccount(id, email)}
        onSetRole={(id, role) =>
          void setRole({ id: id as Id<"accounts">, role })
        }
        onSetUnlimited={(id, unlimited) => void toggleUnlimited(id, unlimited)}
        onSetLocked={(id, locked) => void toggleLocked(id, locked)}
      />
    </div>
  );
}

function formatWhen(ms: number | null | undefined) {
  if (!ms) return null;
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return null;
  }
}

function AdminBetaInvites() {
  const status = useQuery(api.betaAccess.adminSeatStatus);
  const invites = useQuery(api.betaAccess.listInvites);
  const requests = useQuery(api.betaAccess.listRequests);
  const addInvite = useMutation(api.betaAccess.addInvite);
  const removeInvite = useMutation(api.betaAccess.removeInvite);
  const resendInvite = useMutation(api.betaAccess.resendInvite);
  const declineRequest = useMutation(api.betaAccess.declineRequest);
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [busyEmail, setBusyEmail] = useState<string | null>(null);

  if (status === undefined) return null;

  const seatsLabel =
    status.mode === "invite"
      ? null
      : status.limit == null
        ? `${status.accountCount.toLocaleString()} accounts · no seat limit`
        : `${status.accountCount.toLocaleString()} / ${status.limit.toLocaleString()} seats used`;

  const modeLabel =
    status.mode === "invite"
      ? "Invite-only (dev). Bootstrap admin emails are always allowed."
      : status.canJoin
        ? "Open beta with a limited number of account seats."
        : "Open beta is at capacity — approve waitlist requests below to grant seats.";

  const pendingRequests = (requests ?? []).filter(
    (row) => row.status === "pending",
  );

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError("");
    try {
      await addInvite({
        email: email.trim(),
        note: note.trim() || undefined,
        sendEmail: true,
      });
      setEmail("");
      setNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add invite");
    } finally {
      setPending(false);
    }
  }

  async function onApprove(requestEmail: string) {
    setBusyEmail(requestEmail);
    setError("");
    try {
      await addInvite({ email: requestEmail, sendEmail: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not approve request");
    } finally {
      setBusyEmail(null);
    }
  }

  async function onDecline(requestEmail: string) {
    setBusyEmail(requestEmail);
    setError("");
    try {
      await declineRequest({ email: requestEmail });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not decline request");
    } finally {
      setBusyEmail(null);
    }
  }

  async function onResend(inviteEmail: string) {
    setBusyEmail(inviteEmail);
    setError("");
    try {
      await resendInvite({ email: inviteEmail });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resend invite");
    } finally {
      setBusyEmail(null);
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-(--border) bg-(--surface) p-4 shadow-soft">
      <div>
        <h2 className="font-display text-lg font-semibold">Beta access</h2>
        <p className="mt-1 text-sm text-(--muted)">{modeLabel}</p>
        {seatsLabel ? (
          <p className="mt-2 text-sm font-medium text-(--ink)">{seatsLabel}</p>
        ) : (
          <p className="mt-2 text-sm font-medium text-(--ink)">
            {status.accountCount.toLocaleString()} accounts (invite mode — seat
            limit not applied)
          </p>
        )}
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-(--ink)">
          Pending access requests
        </h3>
        {requests === undefined ? (
          <p className="text-sm text-(--muted)">Loading…</p>
        ) : pendingRequests.length === 0 ? (
          <p className="text-sm text-(--muted)">No pending requests.</p>
        ) : (
          <ul className="divide-y divide-(--border) text-sm">
            {pendingRequests.map((row) => (
              <li key={row.id} className="space-y-2 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-(--ink)">
                      {row.name}{" "}
                      <span className="font-normal text-(--muted)">
                        &lt;{row.email}&gt;
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-(--muted)">
                      {row.reason === "invite_only" ? "Invite request" : "Waitlist"}
                      {formatWhen(row.createdAt)
                        ? ` · ${formatWhen(row.createdAt)}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busyEmail === row.email}
                      className="rounded-md bg-(--accent) px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                      onClick={() => void onApprove(row.email)}
                    >
                      Approve &amp; email
                    </button>
                    <button
                      type="button"
                      disabled={busyEmail === row.email}
                      className="rounded-md border border-(--border) px-2.5 py-1.5 text-xs text-(--muted) hover:text-(--ink) disabled:opacity-50"
                      onClick={() => void onDecline(row.email)}
                    >
                      Decline
                    </button>
                  </div>
                </div>
                {row.message ? (
                  <p className="rounded-md bg-(--paper) px-3 py-2 text-xs text-(--muted)">
                    {row.message}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2 border-t border-(--border) pt-4">
        <h3 className="text-sm font-semibold text-(--ink)">Invites</h3>
        <p className="text-xs text-(--muted)">
          Add an email to allow signup when invite-only or at capacity. An invite
          email is sent automatically.
        </p>
        <form onSubmit={onAdd} className="flex flex-wrap items-end gap-2">
          <label className="text-sm">
            <span className="mb-1 block text-(--muted)">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-md border border-(--border) px-3 py-2 text-sm"
              required
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-(--muted)">Note (optional)</span>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="rounded-md border border-(--border) px-3 py-2 text-sm"
            />
          </label>
          <button
            type="submit"
            disabled={pending || !email.trim()}
            className="rounded-md bg-(--accent) px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {pending ? "Sending…" : "Add & email invite"}
          </button>
        </form>
        <ul className="divide-y divide-(--border) text-sm">
          {(invites ?? []).map((row) => {
            const joined = Boolean(row.acceptedAt || row.hasAccount);
            const statusText = joined
              ? `Joined${formatWhen(row.acceptedAt) ? ` · ${formatWhen(row.acceptedAt)}` : ""}`
              : row.sentAt
                ? `Invited · emailed ${formatWhen(row.sentAt)}`
                : "Invited · email pending";
            return (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2"
              >
                <div>
                  <p className="font-medium text-(--ink)">{row.email}</p>
                  <p className="text-xs text-(--muted)">{statusText}</p>
                  {row.note ? (
                    <p className="text-xs text-(--muted)">{row.note}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-3">
                  {!joined ? (
                    <button
                      type="button"
                      disabled={busyEmail === row.email}
                      className="text-xs font-medium text-(--accent) hover:underline disabled:opacity-50"
                      onClick={() => void onResend(row.email)}
                    >
                      Resend email
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="text-xs text-red-600 hover:underline"
                    onClick={() => void removeInvite({ email: row.email })}
                  >
                    Remove
                  </button>
                </div>
              </li>
            );
          })}
          {(invites ?? []).length === 0 ? (
            <li className="py-3 text-(--muted)">No invites yet.</li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-(--border) bg-(--surface) shadow-soft p-4">
      <p className="text-xs text-(--muted)">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function AccountTable({
  title,
  rows,
  emptyLabel,
  creditDrafts,
  onCreditDraftChange,
  onAdjustCredits,
  onDisable,
  onDelete,
  onSetRole,
  onSetUnlimited,
  onSetLocked,
}: {
  title: string;
  rows: Array<{
    id: string;
    email: string;
    name: string;
    role: string;
    status: string;
    disabled: boolean;
    creditsLocked?: boolean;
    usage: { parseCount: number; okfCount: number };
    creditsRemaining?: number;
    creditsUnlimited?: boolean;
  }>;
  emptyLabel: string;
  creditDrafts: Record<string, string>;
  onCreditDraftChange: (id: string, value: string) => void;
  onAdjustCredits: (id: string, sign: 1 | -1) => void;
  onDisable: (id: string, disabled: boolean) => void;
  onDelete: (id: string, email: string) => void;
  onSetRole: (id: string, role: "admin" | "customer") => void;
  onSetUnlimited: (id: string, unlimited: boolean) => void;
  onSetLocked: (id: string, locked: boolean) => void;
}) {
  return (
    <div className="space-y-2">
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      <div className="overflow-hidden rounded-xl border border-(--border) bg-(--surface) shadow-soft">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-(--border) bg-(--paper)">
            <tr>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Credits</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id} className="border-b border-(--border) last:border-0">
                <td className="px-4 py-3">
                  <Link
                    to={`/admin/accounts/${a.id}`}
                    className="font-medium text-(--accent) hover:underline"
                  >
                    {a.email}
                  </Link>
                  <div className="text-xs text-(--muted)">{a.name}</div>
                </td>
                <td className="px-4 py-3 text-(--muted) tabular-nums">
                  <label className="flex items-center gap-2 text-(--ink)">
                    <input
                      type="checkbox"
                      checked={a.creditsUnlimited === true}
                      onChange={(e) => onSetUnlimited(a.id, e.target.checked)}
                      aria-label={`Unlimited credits for ${a.email}`}
                    />
                    <span>
                      {a.creditsUnlimited
                        ? "Unlimited"
                        : (a.creditsRemaining ?? 0).toLocaleString()}
                    </span>
                  </label>
                  {!a.creditsUnlimited && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={creditDrafts[a.id] ?? "100"}
                        onChange={(e) =>
                          onCreditDraftChange(a.id, e.target.value)
                        }
                        aria-label={`Credit amount for ${a.email}`}
                        className="w-20 rounded-md border border-(--border) bg-(--surface) px-2 py-1 text-xs text-(--ink)"
                      />
                      <button
                        type="button"
                        className="rounded-md bg-(--accent) px-2 py-1 text-xs font-semibold text-white hover:bg-(--accent-bright)"
                        onClick={() => onAdjustCredits(a.id, 1)}
                      >
                        Add
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-(--border) px-2 py-1 text-xs font-semibold text-(--ink)"
                        onClick={() => onAdjustCredits(a.id, -1)}
                      >
                        Subtract
                      </button>
                    </div>
                  )}
                  <div className="mt-1 text-xs">
                    {a.usage.parseCount}p / {a.usage.okfCount}okf
                  </div>
                </td>
                <td className="px-4 py-3">
                  {a.disabled ? "login disabled" : a.status}
                  {a.creditsLocked ? " · credits locked" : ""}
                </td>
                <td className="px-4 py-3 space-x-2 text-right">
                  <button
                    type="button"
                    className="text-xs text-(--accent) hover:underline"
                    onClick={() =>
                      onSetRole(
                        a.id,
                        a.role === "admin" ? "customer" : "admin",
                      )
                    }
                  >
                    {a.role === "admin" ? "Demote" : "Promote"}
                  </button>
                  <button
                    type="button"
                    className="text-xs text-(--accent) hover:underline"
                    onClick={() => onSetLocked(a.id, !a.creditsLocked)}
                  >
                    {a.creditsLocked ? "Unlock credits" : "Lock credits"}
                  </button>
                  <button
                    type="button"
                    className="text-xs text-red-600 hover:underline"
                    onClick={() => onDisable(a.id, !a.disabled)}
                  >
                    {a.disabled ? "Enable login" : "Disable login"}
                  </button>
                  <button
                    type="button"
                    className="text-xs text-red-700 hover:underline"
                    onClick={() => onDelete(a.id, a.email)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-(--muted)">
                  {emptyLabel}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
