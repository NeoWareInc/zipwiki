import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthActions, useConvexAuth } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import { useEffect } from "react";
import { api } from "@convex/_generated/api";
import type { MeResponse } from "../lib/api";
import { AuthBusy } from "./AuthSession";

function EnsureProfile() {
  const ensure = useMutation(api.profiles.ensureProfileAndAccount);
  const me = useQuery(api.profiles.me);

  useEffect(() => {
    void (async () => {
      try {
        await ensure({});
      } catch {
        /* profile may already exist */
      }
    })();
  }, [ensure]);

  if (me === undefined) {
    return <AuthBusy label="Loading…" />;
  }

  if (me === null) {
    return <AuthBusy label="Setting up account…" />;
  }

  const data: MeResponse = {
    user: me.user,
    account: {
      id: me.account.id,
      name: me.account.name,
      status: me.account.status,
      disabled: me.account.disabled,
    },
    plan: me.plan,
    usage: {
      parseCount: 0,
      okfCount: 0,
      periodStart: new Date().toISOString(),
    },
  };

  return <Outlet context={data} />;
}

function SignOutDisabled() {
  const { signOut } = useAuthActions();

  useEffect(() => {
    void signOut();
  }, [signOut]);

  return <Navigate to="/login?error=account_disabled" replace />;
}

export function ProtectedRoute({ admin }: { admin?: boolean }) {
  const location = useLocation();
  const { isLoading, isAuthenticated } = useConvexAuth();
  const me = useQuery(api.profiles.me);

  if (isLoading) return <AuthBusy label="Loading…" />;
  if (!isAuthenticated) {
    return (
      <Navigate
        to="/login"
        state={{ from: `${location.pathname}${location.search}` }}
        replace
      />
    );
  }
  if (me?.account.disabled) return <SignOutDisabled />;
  if (admin && me && me.user.role !== "admin") {
    return <Navigate to="/dashboard" replace />;
  }
  return <EnsureProfile />;
}
