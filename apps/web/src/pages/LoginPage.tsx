import { FormEvent, useState } from "react";
import {
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
import { AuthBusy, takeAuthNext, useAuthSettling } from "../components/AuthSession";

const KNOWN_CODES = new Set([
  "use_google_sign_in",
  "oauth_state",
  "google_failed",
  "email_unverified",
  "access_denied",
]);

type Step = "email" | "code";

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn } = useAuthActions();
  const ensure = useMutation(api.profiles.ensureProfileAndAccount);
  const seed = useMutation(api.plans.seedPlansIfEmpty);
  const [params] = useSearchParams();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState(params.get("error") ?? "");
  const [pending, setPending] = useState(false);

  const { settling, isAuthenticated } = useAuthSettling();
  const from =
    (location.state as { from?: string } | null)?.from || "/dashboard";
  const safeFrom = from.startsWith("/") ? from : "/dashboard";

  async function finishSignIn() {
    sessionStorage.removeItem("zipwiki.auth.next");
    await seed({});
    await ensure({});
    navigate(safeFrom);
  }

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
    setError("");
    setPending(true);
    try {
      await signIn("resend-otp", {
        email: email.trim(),
        code: code.trim(),
      });
      await finishSignIn();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Invalid or expired code — try again",
      );
    } finally {
      setPending(false);
    }
  }

  if (settling) return <AuthBusy label="Finishing sign-in…" />;
  if (isAuthenticated) {
    const next =
      (location.state as { from?: string } | null)?.from || takeAuthNext();
    return <Navigate to={next.startsWith("/") ? next : "/dashboard"} replace />;
  }

  return (
    <>
      <AuthCard
        title="Sign in to ZipWiki"
        subtitle={
          step === "email"
            ? "Enter your email — we'll send a one-time code."
            : `Enter the code we sent to ${email.trim()}.`
        }
        footer={
          <AuthSwitchLink
            to="/signup"
            prompt="New here?"
            action="Create an account"
          />
        }
      >
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
