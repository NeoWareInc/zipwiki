import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import {
  AuthCard,
  AuthDivider,
  AuthField,
  AuthSwitchLink,
  FormError,
  GoogleSignInButton,
  authInputClassName,
  authPrimaryButtonClassName,
} from "../components/AuthChrome";

type Step = "email" | "code";

export default function SignupPage() {
  const navigate = useNavigate();
  const { signIn } = useAuthActions();
  const ensure = useMutation(api.profiles.ensureProfileAndAccount);
  const seed = useMutation(api.plans.seedPlansIfEmpty);
  const createKey = useMutation(api.apiKeys.createMine);
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function afterAuth() {
    await seed({});
    await ensure({});
    const key = await createKey({ name: "Default" });
    setApiKey(key.apiKey);
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
      await afterAuth();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Invalid or expired code — try again",
      );
    } finally {
      setPending(false);
    }
  }

  if (apiKey) {
    return (
      <AuthCard
        title="Account created"
        subtitle="Copy your API key now — it won't be shown again."
        footer={
          <button
            type="button"
            onClick={() => navigate("/dashboard/settings?onboarding=1")}
            className="font-medium text-(--accent) hover:underline"
          >
            Continue to settings
          </button>
        }
      >
        <p className="text-sm text-(--muted)">
          Use it with <code className="text-xs">zipwiki auth import</code> or
          device login. Next, finish pack preferences on Settings.
        </p>
        <code className="block rounded-md border border-(--border) bg-(--paper) p-3 text-xs break-all">
          {apiKey}
        </code>
        <button
          type="button"
          onClick={() => navigate("/dashboard/settings?onboarding=1")}
          className={authPrimaryButtonClassName()}
        >
          Continue to settings
        </button>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Create your ZipWiki account"
      subtitle={
        step === "email"
          ? "Enter your email — we'll send a one-time code to verify it."
          : `Enter the code we sent to ${email.trim()}.`
      }
      footer={
        <AuthSwitchLink to="/login" prompt="Already have an account?" action="Sign in" />
      }
    >
      {step === "email" ? (
        <form onSubmit={onSendCode} className="space-y-4">
          <FormError message={error} />
          <AuthField id="signup-email" label="Email">
            <input
              id="signup-email"
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
            returnPath="/dashboard/settings?onboarding=1"
          />
        </form>
      ) : (
        <form onSubmit={onVerifyCode} className="space-y-4">
          <FormError message={error} />
          <AuthField id="signup-code" label="Verification code">
            <input
              id="signup-code"
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
            returnPath="/dashboard/settings?onboarding=1"
          />
        </form>
      )}
    </AuthCard>
  );
}
