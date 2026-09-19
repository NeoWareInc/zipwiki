import { Navigate, Outlet, useLocation } from "react-router-dom";
import {
  Authenticated,
  AuthLoading,
  Unauthenticated,
  useMutation,
  useQuery,
} from "convex/react";
import { useEffect } from "react";
import { api } from "@convex/_generated/api";
import type { MeResponse } from "../lib/api";

function EnsureProfile() {
  const ensure = useMutation(api.profiles.ensureProfileAndAccount);
  const seed = useMutation(api.plans.seedPlansIfEmpty);
  const me = useQuery(api.profiles.me);

  useEffect(() => {
    void (async () => {
      try {
        await seed({});
        await ensure({});
      } catch {
        /* profile may already exist */
      }
    })();
  }, [ensure, seed]);

  if (me === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center text-(--muted)">
        Loading…
      </div>
    );
  }

  if (me === null) {
    return (
      <div className="flex min-h-screen items-center justify-center text-(--muted)">
        Setting up account…
      </div>
    );
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

export function ProtectedRoute({ admin }: { admin?: boolean }) {
  const location = useLocation();
  const me = useQuery(api.profiles.me);

  return (
    <>
      <AuthLoading>
        <div className="flex min-h-screen items-center justify-center text-(--muted)">
          Loading…
        </div>
      </AuthLoading>
      <Unauthenticated>
        <Navigate
          to="/login"
          state={{ from: `${location.pathname}${location.search}` }}
          replace
        />
      </Unauthenticated>
      <Authenticated>
        {admin && me && me.user.role !== "admin" ? (
          <Navigate to="/dashboard" replace />
        ) : (
          <EnsureProfile />
        )}
      </Authenticated>
    </>
  );
}
