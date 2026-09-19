import type { ReactNode } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { Link } from "react-router-dom";

const ERROR_MESSAGES: Record<string, string> = {
  oauth_state: "Sign-in expired. Try Google again.",
  email_unverified: "Your Google email must be verified.",
  google_failed: "Google sign-in failed. Try again.",
  access_denied: "Google sign-in was cancelled.",
  use_google_sign_in: "This account uses Google. Continue with Google below.",
};

export function AuthErrorBanner({ code }: { code?: string | null }) {
  if (!code) return null;
  const message = ERROR_MESSAGES[code] ?? code;
  return <p className="text-sm text-red-600">{message}</p>;
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return <p className="text-sm text-red-600">{message}</p>;
}

export function GoogleSignInButton({
  label,
  returnPath,
}: {
  label: string;
  returnPath?: string;
}) {
  const { signIn } = useAuthActions();
  return (
    <button
      type="button"
      onClick={() => {
        const path =
          returnPath?.startsWith("/") ? returnPath : "/dashboard";
        void signIn("google", {
          redirectTo: `${window.location.origin}${path}`,
        });
      }}
      className="flex w-full items-center justify-center gap-2 rounded-md border border-(--border) bg-white px-4 py-2.5 text-sm font-medium text-(--ink) transition-colors hover:bg-(--paper)"
    >
      <GoogleGlyph />
      {label}
    </button>
  );
}

function GoogleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l5.7-5.7C34.2 6.1 29.4 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.5-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 16 19 12 24 12c3.1 0 5.8 1.1 8 3l5.7-5.7C34.2 6.1 29.4 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.3 35.3 26.8 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.6 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-1.1 3.2-3.5 5.7-6.5 7.1l.1.1 6.2 5.2C39.2 37.3 44 31.5 44 24c0-1.3-.1-2.5-.4-3.5z"
      />
    </svg>
  );
}

/** Minimal centered auth shell matching the email-code sign-in pattern. */
export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4 py-12">
      <div className="w-full max-w-[22rem] space-y-6">
        <div className="flex flex-col items-center space-y-3 text-center">
          <Link to="/" aria-label="ZipWiki home">
            <img
              src="/zipwiki-icon.png"
              alt=""
              width={48}
              height={48}
              className="h-12 w-12 rounded-[0.85rem] shadow-sm"
            />
          </Link>
          <div className="space-y-1.5">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-(--ink)">
              {title}
            </h1>
            {subtitle ? (
              <p className="text-sm leading-relaxed text-(--muted)">{subtitle}</p>
            ) : null}
          </div>
        </div>
        {children}
        {footer ? (
          <div className="text-center text-sm text-(--muted)">{footer}</div>
        ) : null}
        <AuthLegalNotice />
      </div>
    </div>
  );
}

export function AuthLegalNotice() {
  return (
    <p className="text-center text-xs leading-relaxed text-(--muted)">
      By continuing you agree to our{" "}
      <Link to="/terms" className="underline underline-offset-2 hover:text-(--ink)">
        Terms of Service
      </Link>{" "}
      and{" "}
      <Link
        to="/privacy"
        className="underline underline-offset-2 hover:text-(--ink)"
      >
        Privacy Policy
      </Link>
      .
    </p>
  );
}

export function AuthDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 text-xs text-(--muted)">
      <div className="h-px flex-1 bg-(--border)" />
      <span>{label}</span>
      <div className="h-px flex-1 bg-(--border)" />
    </div>
  );
}

export function AuthField({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5 text-left">
      <label htmlFor={id} className="block text-sm text-(--muted)">
        {label}
      </label>
      {children}
    </div>
  );
}

export function authInputClassName() {
  return "w-full rounded-md border border-(--ink)/25 bg-white px-3 py-2.5 text-sm text-(--ink) outline-none placeholder:text-(--muted)/70 focus:border-(--ink)/55";
}

export function authPrimaryButtonClassName() {
  return "w-full rounded-md bg-(--ink) py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-60";
}

export function AuthSwitchLink({
  to,
  prompt,
  action,
}: {
  to: string;
  prompt: string;
  action: string;
}) {
  return (
    <p>
      {prompt}{" "}
      <Link to={to} className="font-medium text-(--accent) hover:underline">
        {action}
      </Link>
    </p>
  );
}
