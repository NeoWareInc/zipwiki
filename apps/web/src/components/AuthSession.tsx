import { useEffect, useRef, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { useAuthActions, useConvexAuth } from "@convex-dev/auth/react";

const NEXT_KEY = "zipwiki.auth.next";

function describeCallbackError(fromConvex: string | null): string {
  if (
    fromConvex?.includes("server responded with an error in the response body")
  ) {
    return "Google rejected the token exchange. AUTH_GOOGLE_SECRET on dashing-cod-224 is not a Google Web client secret (those start with GOCSPX-). In Google Cloud → APIs & Services → Credentials, open the Web client 557822079588-2mf0d7qugmiobuui7rkhcl11hkgal0rm, copy Client secret, then: npx convex env set AUTH_GOOGLE_SECRET 'GOCSPX-…'";
  }
  if (fromConvex) return `Convex OAuth callback failed: ${fromConvex}`;
  return "Google came back without a Convex code. In Google Cloud the Web client redirect URI must be exactly https://dashing-cod-224.convex.site/api/auth/callback/google";
}

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

export function useAuthSettling() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  return { isLoading, isAuthenticated, settling: isLoading };
}

export function AuthCallbackPage() {
  const { signIn } = useAuthActions();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const [params] = useSearchParams();
  const code = params.get("code");
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current || isAuthenticated) return;
    if (!code) {
      const fromConvex = params.get("error");
      setError(describeCallbackError(fromConvex));
      return;
    }
    started.current = true;
    void (async () => {
      try {
        const result = await signIn(undefined, { code });
        if (!result.signingIn) {
          setError(
            "Convex rejected the one-time code (already used, or the verifier in this browser tab is missing). Start again from /login and do not refresh the return URL.",
          );
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Sign-in failed");
      }
    })();
  }, [code, isAuthenticated, signIn]);

  if (isAuthenticated) return <Navigate to={takeAuthNext()} replace />;
  if (error) {
    return (
      <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-3 px-4 text-sm">
        <p className="font-medium text-red-600">Google sign-in did not complete</p>
        <p className="text-(--ink)">{error}</p>
        <a href="/login" className="text-(--accent) underline">
          Back to login
        </a>
      </div>
    );
  }
  if (isLoading || code) return <AuthBusy label="Finishing sign-in…" />;
  return <AuthBusy label="Finishing sign-in…" />;
}
