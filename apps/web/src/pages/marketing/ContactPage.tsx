import { useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAction } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "@convex/_generated/api";
import { authInputClassName } from "../../components/AuthChrome";
import { Section } from "./MarketingUi";

const CONTACT_EMAIL = "hello@zipwiki.ai";

export default function ContactPage() {
  const submit = useAction(api.mail.submitContact);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setStatus("idle");
    setError("");
    try {
      await submit({ name, email, subject, message });
      setStatus("success");
      setName("");
      setEmail("");
      setSubject("");
      setMessage("");
    } catch (err) {
      setStatus("error");
      setError(
        err instanceof ConvexError && typeof err.data === "string"
          ? err.data
          : `Could not send your message. Email ${CONTACT_EMAIL} instead.`,
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <main>
      <Section>
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="font-display text-4xl font-semibold tracking-tight text-(--ink) md:text-5xl">
            Contact Us
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-(--muted)">
            We're here to help with questions about ZipWiki packages, the CLI,
            MCP, and hosted parse.
          </p>
        </div>

        <div className="mt-12 grid items-start gap-12 lg:grid-cols-2">
          <div className="space-y-8">
            <div>
              <h2 className="font-display text-3xl font-semibold text-(--ink)">
                Get in Touch
              </h2>
              <p className="mt-3 text-lg leading-relaxed text-(--muted)">
                We're committed to answering questions about creating and
                querying portable <code className="text-sm">.zipwiki</code>{" "}
                packages.
              </p>
            </div>

            <div className="flex items-start gap-4">
              <EnvelopeIcon />
              <div>
                <h3 className="font-display text-lg font-semibold text-(--ink)">
                  Email Support
                </h3>
                <p className="mt-1">
                  <a
                    href={`mailto:${CONTACT_EMAIL}`}
                    className="font-medium text-(--accent) hover:underline"
                  >
                    {CONTACT_EMAIL}
                  </a>
                </p>
                <p className="mt-1 text-sm text-(--muted)">
                  We typically respond within 24 hours.
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-(--accent)/25 bg-(--accent)/8 p-6">
              <h3 className="font-display text-lg font-semibold text-(--ink)">
                Before You Contact Us
              </h3>
              <ul className="mt-4 space-y-2 text-sm leading-relaxed text-(--ink)/90">
                <li>
                  • Check{" "}
                  <Link to="/how-it-works" className="text-(--accent) hover:underline">
                    How it works
                  </Link>{" "}
                  for how a package is built and queried
                </li>
                <li>
                  • Review our{" "}
                  <Link to="/privacy" className="text-(--accent) hover:underline">
                    Privacy Policy
                  </Link>{" "}
                  and{" "}
                  <Link to="/terms" className="text-(--accent) hover:underline">
                    Terms of Service
                  </Link>
                </li>
                <li>
                  • See{" "}
                  <Link to="/mcp" className="text-(--accent) hover:underline">
                    MCP & CLI
                  </Link>{" "}
                  if you are connecting an agent
                </li>
              </ul>
            </div>
          </div>

          <div className="rounded-xl border border-(--border) bg-white/80 p-6 shadow-soft">
            <div className="flex items-center gap-2">
              <EnvelopeIcon />
              <h2 className="font-display text-2xl font-semibold text-(--ink)">
                Contact Us
              </h2>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-(--muted)">
              Send a message and we will reply to the email you enter.
            </p>

            <form onSubmit={(event) => void onSubmit(event)} className="mt-6 space-y-5">
              <Field id="contact-name" label="Name *">
                <input
                  id="contact-name"
                  name="name"
                  type="text"
                  required
                  autoComplete="name"
                  placeholder="Your full name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className={authInputClassName()}
                />
              </Field>
              <Field id="contact-email" label="Email *">
                <input
                  id="contact-email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="your.email@example.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className={authInputClassName()}
                />
              </Field>
              <Field id="contact-subject" label="Subject *">
                <input
                  id="contact-subject"
                  name="subject"
                  type="text"
                  required
                  placeholder="What's this about?"
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  className={authInputClassName()}
                />
              </Field>
              <Field id="contact-message" label="Message *">
                <textarea
                  id="contact-message"
                  name="message"
                  required
                  rows={6}
                  placeholder="Tell us more about your inquiry..."
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  className={`${authInputClassName()} resize-y`}
                />
              </Field>
              <button
                type="submit"
                disabled={pending}
                className="w-full rounded-md bg-(--accent) px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-(--accent-bright) disabled:opacity-60"
              >
                {pending ? "Sending…" : "Send Message"}
              </button>
              {status === "success" && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                  Thank you. Your message has been sent.
                </div>
              )}
              {status === "error" && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                  {error}
                </div>
              )}
            </form>
          </div>
        </div>
      </Section>
    </main>
  );
}

function Field({
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
      <label htmlFor={id} className="block text-sm font-medium text-(--ink)">
        {label}
      </label>
      {children}
    </div>
  );
}

function EnvelopeIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className="mt-0.5 shrink-0 text-(--accent)"
    >
      <path
        d="M4 6.5h16v11H4v-11Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M4 7l8 6.5L20 7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
