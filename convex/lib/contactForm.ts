/** Public inbox for the marketing contact form. */
export const CONTACT_INBOX = "hello@zipwiki.ai";

export const CONTACT_WINDOW_MS = 60 * 60 * 1000;
export const CONTACT_MAX_PER_EMAIL = 3;
export const CONTACT_MAX_PER_HOUR = 20;

const LIMITS = {
  name: 120,
  email: 200,
  subject: 200,
  message: 5000,
} as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ContactFields = {
  name: string;
  email: string;
  subject: string;
  message: string;
};

export function normalizeContact(input: {
  name: string;
  email: string;
  subject: string;
  message: string;
}): { ok: true; value: ContactFields } | { ok: false; error: string } {
  const name = collapse(input.name);
  const email = collapse(input.email).toLowerCase();
  const subject = collapse(input.subject);
  const message = input.message.replace(/\r\n/g, "\n").trim();
  if (!name) return { ok: false, error: "Enter your name." };
  if (name.length > LIMITS.name) return { ok: false, error: "Name is too long." };
  if (!EMAIL_RE.test(email) || email.length > LIMITS.email) {
    return { ok: false, error: "Enter a valid email." };
  }
  if (!subject) return { ok: false, error: "Enter a subject." };
  if (subject.length > LIMITS.subject) {
    return { ok: false, error: "Subject is too long." };
  }
  if (!message) return { ok: false, error: "Enter a message." };
  if (message.length > LIMITS.message) {
    return { ok: false, error: "Message is too long." };
  }
  return { ok: true, value: { name, email, subject, message } };
}

/** True when this sender or the site has already sent too many messages. */
export function contactRateLimited(args: {
  emailTimes: number[];
  recentTimes: number[];
  now: number;
}): string | null {
  const cutoff = args.now - CONTACT_WINDOW_MS;
  const fromEmail = args.emailTimes.filter((time) => time > cutoff).length;
  if (fromEmail >= CONTACT_MAX_PER_EMAIL) {
    return "Too many messages from this email. Please wait an hour and try again.";
  }
  const recent = args.recentTimes.filter((time) => time > cutoff).length;
  if (recent >= CONTACT_MAX_PER_HOUR) {
    return `Too many messages right now. Please wait and try again, or email ${CONTACT_INBOX}.`;
  }
  return null;
}

export function contactPlainText(fields: ContactFields): string {
  return [
    `Name: ${fields.name}`,
    `Email: ${fields.email}`,
    `Subject: ${fields.subject}`,
    "",
    fields.message,
  ].join("\n");
}

export function contactHtml(fields: ContactFields): string {
  return `<div style="font-family:sans-serif;max-width:600px">
<h2 style="color:#333">New ZipWiki contact</h2>
<p><strong>Name:</strong> ${escapeHtml(fields.name)}</p>
<p><strong>Email:</strong> ${escapeHtml(fields.email)}</p>
<p><strong>Subject:</strong> ${escapeHtml(fields.subject)}</p>
<div style="margin-top:16px;padding:16px;border:1px solid #ddd;border-radius:8px">
<p style="white-space:pre-wrap;line-height:1.6">${escapeHtml(fields.message)}</p>
</div>
</div>`;
}

function collapse(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
