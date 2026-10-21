import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import {
  BetaAccessClosedPage,
  parseBetaAccessError,
  useBetaAccessStatus,
} from "../components/BetaAccessGate";
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
import { AuthBusy } from "../components/AuthSession";

type Step = "email" | "code";

export default function SignupPage() {
  const navigate = useNavigate();
  const { signIn } = useAuthActions();
  const ensure = useMutation(api.profiles.ensureProfileAndAccount);
  const createKey = useMutation(api.apiKeys.createMine);
  const access = useBetaAccessStatus();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [denied, setDenied] = useState<{
    title: string;
    message: string;
  } | null>(null);

  async function afterAuth() {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await ensure({});
        lastErr = undefined;
        break;
      } catch (err) {
        lastErr = err;
        const gate = parseBetaAccessError(err);
        if (gate) throw err;
        const msg = err instanceof Error ? err.message : "";
        if (!msg.includes("Not authenticated") || attempt === 2) throw err;
        await new Promise((r) => setTimeout(r, 150 * (attempt + 1)));
      }
    }
    if (lastErr) throw lastErr;
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
      const result = await signIn("resend-otp", {
        email: email.trim(),
        code: code.trim(),
      });
      if (!result.signingIn) {
        setError("Could not verify that code. Request a new one and try again.");
        return;
      }
      await afterAuth();
    } catch (err) {
      const gate = parseBetaAccessError(err);
      if (gate) {
        setDenied({ title: gate.title, message: gate.message });
      } else {
        setError(
          err instanceof Error ? err.message : "Invalid or expired code — try again",
        );
      }
    } finally {
      setPending(false);
    }
  }

  if (access === undefined) {
    return <AuthBusy label="Checking beta access…" />;
  }

  if (!access.canJoin || denied) {
    return (
      <BetaAccessClosedPage
        status={{
          ...access,
          canJoin: false,
          title: denied?.title ?? access.title,
          message: denied?.message ?? access.message,
          requestEnabled: true,
        }}
      />
    );
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
          The CLI connects with <code className="text-xs">zipwiki login</code>.
          Next, finish pack preferences on Settings.
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
          ? "During beta development, a limited number of account seats are available. Enter your email — we'll send a one-time code."
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
          <GoogleSignInButton label="Continue with Google" returnPath="/signup" />
          <p className="text-center text-xs text-(--muted)">
            Prefer the CLI first?{" "}
            <Link to="/install" className="text-(--accent) hover:underline">
              Install ZipWiki
            </Link>
          </p>
        </form>
      ) : (
        <form onSubmit={onVerifyCode} className="space-y-4">
          <FormError message={error} />
          <AuthField id="signup-code" label="Verification code">
            <input
              id="signup-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className={authInputClassName()}
              required
            />
          </AuthField>
          <button
            type="submit"
            disabled={pending || !code.trim()}
            className={authPrimaryButtonClassName()}
          >
            {pending ? "Creating…" : "Create account"}
          </button>
          <button
            type="button"
            className="w-full text-sm text-(--muted) hover:text-(--ink)"
            onClick={() => {
              setStep("email");
              setCode("");
              setError("");
            }}
          >
            Use a different email
          </button>
        </form>
      )}
    </AuthCard>
  );
}
