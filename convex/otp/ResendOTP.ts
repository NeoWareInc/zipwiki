import { Email } from "@convex-dev/auth/providers/Email";
import { Resend as ResendAPI } from "resend";
import { RandomReader, generateRandomString } from "@oslojs/crypto/random";

/**
 * Passwordless email OTP via Resend (Lane A — Convex deployment env only).
 *
 * Reads `AUTH_RESEND_KEY` / `AUTH_EMAIL` from the Convex runtime `process.env`.
 * Do not load `~/.zipwiki/.env` here. Do not expose these as `VITE_*`.
 * See doc/CONVEX.md “Secret lanes”.
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
    const resend = new ResendAPI(apiKey);
    const { error } = await resend.emails.send({
      from,
      to: [email],
      subject: "Your ZipWiki sign-in code",
      text: `Your ZipWiki sign-in code is ${token}\n\nIt expires in 15 minutes. If you did not request this, you can ignore this email.`,
      html: `<p style="font-family:sans-serif;font-size:16px;line-height:1.5">Your ZipWiki sign-in code is:</p>
<p style="font-family:ui-monospace,monospace;font-size:28px;letter-spacing:0.12em;font-weight:700">${token}</p>
<p style="font-family:sans-serif;font-size:14px;color:#5a6b78">Expires in 15 minutes. If you did not request this, ignore this email.</p>`,
    });
    if (error) {
      throw new Error(JSON.stringify(error));
    }
  },
});
