import { Navigate, useSearchParams } from "react-router-dom";
import { useConvexAuth } from "@convex-dev/auth/react";

const NEXT_KEY = "zipwiki.auth.next";

export function rememberAuthNext(path: string) {
  if (
    path.startsWith("/") &&
    path !== "/login" &&
    path !== "/signup" &&
    path !== "/signed-in"
  ) {
    sessionStorage.setItem(NEXT_KEY, path);
  }
}

export function takeAuthNext(): string {
  const next = sessionStorage.getItem(NEXT_KEY);
  sessionStorage.removeItem(NEXT_KEY);
  return next?.startsWith("/") ? next : "/dashboard";
}

export function AuthBusy({ label }: { label: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center text-(--muted)">
      {label}
    </div>
  );
}

/** True while Convex Auth is exchanging ?code= or still hydrating tokens. */
export function useAuthSettling() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const [params] = useSearchParams();
  return {
    isLoading,
    isAuthenticated,
    settling: isLoading || params.has("code"),
  };
}

export function AuthCallbackPage() {
  const { settling, isAuthenticated } = useAuthSettling();
  if (settling) return <AuthBusy label="Finishing sign-in…" />;
  if (isAuthenticated) return <Navigate to={takeAuthNext()} replace />;
  return <Navigate to="/login?error=google_failed" replace />;
}
