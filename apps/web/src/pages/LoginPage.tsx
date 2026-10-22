import { FormEvent, useEffect, useRef, useState } from "react";
import {
  Link,
  Navigate,
  useNavigate,
  useSearchParams,
  useLocation,
} from "react-router-dom";
import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import {
  AuthCard,
  AuthDivider,
  AuthErrorBanner,
  AuthField,
  AuthSwitchLink,
  FormError,
  GoogleSignInButton,
  authInputClassName,
  authPrimaryButtonClassName,
} from "../components/AuthChrome";
import {
  parseBetaAccessError,
  useBetaAccessStatus,
} from "../components/BetaAccessGate";
import { AuthBusy, takeAuthNext, useAuthSettling } from "../components/AuthSession";
import { parseAuthEmailLinkParams } from "../lib/authEmailLink";

const KNOWN_CODES = new Set([
  "use_google_sign_in",
  "oauth_state",
  "google_failed",
  "email_unverified",
  "access_denied",
  "account_disabled",
]);

type Step = "email" | "code";

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn, signOut } = useAuthActions();
  const ensure = useMutation(api.profiles.ensureProfileAndAccount);
  const access = useBetaAccessStatus();
  const [params, setParams] = useSearchParams();
  const linkParams = parseAuthEmailLinkParams(params);
  const [step, setStep] = useState<Step>(() =>
    linkParams ? "code" : "email",
  );
  const [email, setEmail] = useState(
    () => linkParams?.email ?? params.get("email")?.trim() ?? "",
  );
  const [code, setCode] = useState(() => linkParams?.code ?? "");
  const [error, setError] = useState(params.get("error") ?? "");
  const [pending, setPending] = useState(false);
  const [gateNotice, setGateNotice] = useState<{
    title: string;
    message: string;
  } | null>(null);
  const linkVerifyStarted = useRef(false);

  const { settling, isAuthenticated } = useAuthSettling();
  const from =
    (location.state as { from?: string } | null)?.from || "/dashboard";
  const safeFrom = from.startsWith("/") ? from : "/dashboard";
  const cliLogin = safeFrom.startsWith("/cli/device");

  async function finishSignIn() {
    sessionStorage.removeItem("zipwiki.auth.next");
    try {
      await ensure({});
      navigate(safeFrom);
    } catch (err) {
      const gate = parseBetaAccessError(err);
      if (gate) {
        setGateNotice({ title: gate.title, message: gate.message });
        void signOut();
        return;
      }
      throw err;
    }
  }

  async function verifyWithCode(nextEmail: string, nextCode: string) {
    setError("");
    setPending(true);
    try {
      await signIn("resend-otp", {
        email: nextEmail.trim(),
        code: nextCode.trim(),
      });
      await finishSignIn();
    } catch (err) {
      const gate = parseBetaAccessError(err);
      if (gate) {
        setGateNotice({ title: gate.title, message: gate.message });
      } else {
        setError(
          err instanceof Error ? err.message : "Invalid or expired code — try again",
        );
      }
    } finally {
      setPending(false);
    }
  }

  useEffect(() => {
    if (!linkParams || linkVerifyStarted.current) return;
    linkVerifyStarted.current = true;
    const next = new URLSearchParams(params);
    next.delete("code");
    setParams(next, { replace: true });
    void verifyWithCode(linkParams.email, linkParams.code);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot from initial URL
  }, []);

  async function onSendCode(e: FormEvent) {
    e.preventDefault();
    setError("");
    setPending(true);
    try {
      await signIn("resend-otp", { email: email.trim() });
      setStep("code");
      setCode("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send sign-in code");
    } finally {
      setPending(false);
    }
  }

  async function onVerifyCode(e: FormEvent) {
    e.preventDefault();
    await verifyWithCode(email, code);
  }

  if (settling) return <AuthBusy label="Finishing sign-in…" />;
  if (isAuthenticated && !gateNotice) {
    const next =
      (location.state as { from?: string } | null)?.from || takeAuthNext();
    return <Navigate to={next.startsWith("/") ? next : "/dashboard"} replace />;
  }
  if (linkParams && pending && !gateNotice && !error) {
    return <AuthBusy label="Signing you in…" />;
  }

  const signupAction =
    access?.mode === "invite"
      ? "Request Invite"
      : access && !access.canJoin
        ? "Join the waitlist"
        : "Create an account";

  return (
    <>
      <AuthCard
        title="Sign in to ZipWiki"
        subtitle={
          step === "email"
            ? cliLogin
              ? "Sign in as the account this CLI should use. We'll send a one-time code."
              : access?.mode === "invite"
                ? "Invite-only development site. Sign in with an invited email."
                : "Enter your email — we'll send a one-time code (and a sign-in link)."
            : `Enter the code we sent to ${email.trim()}, or use the link in that email.`
        }
        footer={
          access ? (
            <AuthSwitchLink
              to="/signup"
              prompt="New here?"
              action={signupAction}
            />
          ) : null
        }
      >
        {gateNotice ? (
          <div className="mb-4 rounded-lg border border-(--border) bg-(--paper) p-4 text-left">
            <p className="text-sm font-semibold text-(--ink)">{gateNotice.title}</p>
            <p className="mt-1 text-sm leading-relaxed text-(--muted)">
              {gateNotice.message}
            </p>
            <p className="mt-3 text-sm">
              <Link
                to="/signup"
                className="font-medium text-(--accent) hover:underline"
              >
                Request Invite
              </Link>
            </p>
          </div>
        ) : null}
        {step === "email" ? (
          <form onSubmit={onSendCode} className="space-y-4">
            {KNOWN_CODES.has(error) ? (
              <AuthErrorBanner code={error} />
            ) : (
              <FormError message={error} />
            )}
            <AuthField id="login-email" label="Email">
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={authInputClassName()}
                required
              />
            </AuthField>
            <button
              type="submit"
              disabled={pending || !email.trim()}
              className={authPrimaryButtonClassName()}
            >
              {pending ? "Sending…" : "Send sign-in code"}
            </button>
            <AuthDivider label="or" />
            <GoogleSignInButton
              label="Continue with Google"
              returnPath={safeFrom}
            />
          </form>
        ) : (
          <form onSubmit={onVerifyCode} className="space-y-4">
            <FormError message={error} />
            <AuthField id="login-code" label="Verification code">
              <input
                id="login-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="8-digit code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
                className={`${authInputClassName()} tracking-[0.2em]`}
                required
                minLength={8}
                maxLength={8}
                autoFocus
              />
            </AuthField>
            <button
              type="submit"
              disabled={pending || code.trim().length < 8}
              className={authPrimaryButtonClassName()}
            >
              {pending ? "Verifying…" : "Verify email"}
            </button>
            <div className="flex flex-col items-center gap-2 text-sm">
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setError("");
                  setPending(true);
                  void signIn("resend-otp", { email: email.trim() })
                    .then(() => setError(""))
                    .catch((err) =>
                      setError(
                        err instanceof Error
                          ? err.message
                          : "Could not resend code",
                      ),
                    )
                    .finally(() => setPending(false));
                }}
                className="font-medium text-(--accent) hover:underline disabled:opacity-60"
              >
                Resend code
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setStep("email");
                  setCode("");
                  setError("");
                }}
                className="text-(--muted) hover:text-(--ink) hover:underline"
              >
                Use a different email
              </button>
            </div>
            <AuthDivider label="or" />
            <GoogleSignInButton
              label="Continue with Google"
              returnPath={safeFrom}
            />
          </form>
        )}
      </AuthCard>
    </>
  );
}
