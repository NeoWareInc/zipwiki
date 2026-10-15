import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { AgentPrompt } from "../../lib/marketing-copy";

export function PageHero({
  kicker,
  title,
  lead,
  titleClassName = "max-w-2xl text-4xl md:text-5xl",
}: {
  kicker?: string;
  title: ReactNode;
  lead: string;
  titleClassName?: string;
}) {
  return (
    <div className="space-y-4">
      {kicker && (
        <p className="text-xs font-semibold tracking-wide text-(--accent) uppercase">
          {kicker}
        </p>
      )}
      <h1
        className={`font-display font-semibold tracking-tight text-(--ink) ${titleClassName}`}
      >
        {title}
      </h1>
      <p className="max-w-2xl text-base leading-relaxed text-(--muted) md:text-lg">
        {lead}
      </p>
    </div>
  );
}

export function FeatureGrid({
  items,
  columns = 3,
}: {
  items: ReadonlyArray<{ title: string; body: string; ask?: string }>;
  columns?: 2 | 3 | 4;
}) {
  const cols =
    columns === 2
      ? "md:grid-cols-2"
      : columns === 4
        ? "md:grid-cols-2 lg:grid-cols-4"
        : "md:grid-cols-3";
  return (
    <div className={`grid gap-6 ${cols}`}>
      {items.map((item) => (
        <div
          key={item.title}
          className="rounded-xl border border-(--border) bg-white/80 p-6 shadow-soft"
        >
          <h2 className="font-display text-xl font-semibold text-(--ink)">
            {item.title}
          </h2>
          {item.ask && (
            <p className="mt-2 text-sm font-medium text-(--accent)">“{item.ask}”</p>
          )}
          <p className="mt-2 text-sm leading-relaxed text-(--muted)">{item.body}</p>
        </div>
      ))}
    </div>
  );
}

export function PromptCard({ item }: { item: AgentPrompt }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(item.prompt);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="rounded-xl border border-(--border) bg-white/80 p-5 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-semibold text-(--ink)">
            {item.title}
          </h3>
          <p className="mt-1 text-sm text-(--muted)">{item.description}</p>
        </div>
        <button
          type="button"
          onClick={() => void copy()}
          className="shrink-0 rounded-md border border-(--border) px-3 py-1.5 text-xs font-semibold text-(--ink) hover:border-(--accent) hover:text-(--accent)"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="mt-3 overflow-x-auto rounded-md bg-(--paper) px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap text-(--ink)">
        {item.prompt}
      </pre>
    </div>
  );
}

export function PrimaryCta({
  to,
  children,
}: {
  to: string;
  children: React.ReactNode;
}) {
  const className =
    "inline-flex items-center justify-center rounded-md bg-(--accent) px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-(--accent-bright)";
  if (to.startsWith("mailto:") || to.startsWith("#") || to.startsWith("http")) {
    return (
      <a href={to} className={className}>
        {children}
      </a>
    );
  }
  return (
    <Link to={to} className={className}>
      {children}
    </Link>
  );
}

export function SecondaryCta({
  to,
  children,
}: {
  to: string;
  children: React.ReactNode;
}) {
  const className =
    "inline-flex items-center justify-center rounded-md px-5 py-2.5 text-sm font-semibold text-(--ink) underline-offset-4 hover:text-(--accent) hover:underline";
  if (to.startsWith("#") || to.startsWith("mailto:") || to.startsWith("http")) {
    return (
      <a href={to} className={className}>
        {children}
      </a>
    );
  }
  return (
    <Link to={to} className={className}>
      {children}
    </Link>
  );
}

export function Section({
  children,
  className = "",
  id,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section
      id={id}
      className={`mx-auto max-w-6xl px-6 py-16 md:py-20 ${className}`}
    >
      {children}
    </section>
  );
}
