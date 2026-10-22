import { Email } from "@convex-dev/auth/providers/Email";
import { Resend as ResendAPI } from "resend";
import { RandomReader, generateRandomString } from "@oslojs/crypto/random";

/**
 * Passwordless email OTP via Resend (Lane A — Convex deployment env only).
 *
 * Reads `AUTH_RESEND_KEY` / `AUTH_EMAIL` from the Convex runtime `process.env`.
 * Do not load `~/.zipwiki/.env` here. Do not expose these as `VITE_*`.
 * See doc/CONVEX.md “Secret lanes”.
 *
 * Email includes the digits and a one-click link to
 * `{SITE_URL}/login?email=…&code=…` (same one-time token).
 */
export const ResendOTP = Email({
  id: "resend-otp",
  apiKey: process.env.AUTH_RESEND_KEY,
  maxAge: 60 * 15, // 15 minutes
  async generateVerificationToken() {
    const random: RandomReader = {
      read(bytes) {
        crypto.getRandomValues(bytes);
      },
    };
    return generateRandomString(random, "0123456789", 8);
  },
  async sendVerificationRequest({ identifier: email, provider, token }) {
    const apiKey = provider.apiKey;
    if (!apiKey) {
      throw new Error(
        "AUTH_RESEND_KEY is not set on the Convex deployment — cannot send sign-in codes.",
      );
    }
    const from =
      process.env.AUTH_EMAIL?.trim() || "ZipWiki <onboarding@resend.dev>";
    const origin = (
      process.env.SITE_URL?.trim() ||
      process.env.WEB_ORIGIN?.split(",")[0]?.trim() ||
      "https://www.zipwiki.ai"
    ).replace(/\/+$/, "");
    const loginUrl = `${origin}/login?email=${encodeURIComponent(email)}&code=${encodeURIComponent(token)}`;

    const resend = new ResendAPI(apiKey);
    const { error } = await resend.emails.send({
      from,
      to: [email],
      subject: "Your ZipWiki sign-in code",
      text: [
        `Your ZipWiki sign-in code is ${token}`,
        "",
        `Or sign in with this link (uses the same one-time code):`,
        loginUrl,
        "",
        `It expires in 15 minutes. If you did not request this, you can ignore this email.`,
      ].join("\n"),
      html: `<p style="font-family:sans-serif;font-size:16px;line-height:1.5">Your ZipWiki sign-in code is:</p>
<p style="font-family:ui-monospace,monospace;font-size:28px;letter-spacing:0.12em;font-weight:700">${token}</p>
<p style="font-family:sans-serif;font-size:14px;margin:20px 0 8px;font-weight:600">Or sign in with one click</p>
<p style="margin:0 0 8px">
  <a href="${loginUrl}" style="display:inline-block;background:#0f172a;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-family:sans-serif">Sign in to ZipWiki</a>
</p>
<p style="font-family:sans-serif;font-size:12px;color:#94a3b8;word-break:break-all;margin:0 0 16px">${loginUrl}</p>
<p style="font-family:sans-serif;font-size:13px;color:#991b1b;line-height:1.5;margin:0 0 12px;padding:10px 12px;background:#fef2f2;border-radius:6px"><strong>One-time code:</strong> the digits and the button use the same code. Use only one — the first success consumes it.</p>
<p style="font-family:sans-serif;font-size:14px;color:#5a6b78">Expires in 15 minutes. If you did not request this, ignore this email.</p>`,
    });
    if (error) {
      throw new Error(JSON.stringify(error));
    }
  },
});
