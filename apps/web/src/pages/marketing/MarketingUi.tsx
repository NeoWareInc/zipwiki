import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type {
  AgentPrompt,
  FlowTone,
  IllustratedFlowCopy,
} from "../../lib/marketing-copy";

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
          className="rounded-xl border border-(--border) bg-(--surface)/80 p-6 shadow-soft"
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
    <div className="rounded-xl border border-(--border) bg-(--surface)/80 p-5 shadow-soft">
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

const FLOW_BADGE: Record<FlowTone, string> = {
  query: "bg-[#0f6e6a] text-white dark:bg-[#2bb5ae] dark:text-[#0f161c]",
  extract: "bg-[#b45309] text-white dark:bg-[#f59e0b] dark:text-[#1a1206]",
  pack: "bg-[#1f3a44] text-white dark:bg-[#c5d2d8] dark:text-[#15202b]",
};

const FLOW_KICKER: Record<FlowTone, string> = {
  query: "text-(--accent)",
  extract: "text-(--usage-okf)",
  pack: "text-(--usage-query)",
};

const FLOW_COLS: Record<number, string> = {
  3: "md:grid-cols-3",
  4: "md:grid-cols-2 lg:grid-cols-4",
  5: "md:grid-cols-3 lg:grid-cols-5",
};

/**
 * Illustrated workflow: a wide scene image with numbered markers, then the
 * matching numbered steps as real text (readable on phones, indexable).
 * On narrow screens the image scrolls sideways instead of shrinking to
 * an unreadable strip.
 */
export function IllustratedFlow({
  flow,
  headingLevel = 2,
  showHeader = true,
}: {
  flow: IllustratedFlowCopy;
  headingLevel?: 2 | 3;
  showHeader?: boolean;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const StepHeading = headingLevel === 2 ? "h3" : "h4";
  const headingSize = headingLevel === 2 ? "text-3xl" : "text-2xl";
  return (
    <div>
      {showHeader && (
        <div className="max-w-3xl">
          <p
            className={`text-xs font-semibold tracking-wide uppercase ${FLOW_KICKER[flow.tone]}`}
          >
            {flow.kicker}
          </p>
          <Heading
            className={`mt-2 font-display font-semibold tracking-tight text-(--ink) ${headingSize}`}
          >
            {flow.title}
          </Heading>
          <p className="mt-3 leading-relaxed text-(--muted)">{flow.lead}</p>
        </div>
      )}
      <figure className="-mx-6 mt-8 overflow-x-auto px-6 pb-2 md:mx-0 md:overflow-visible md:px-0">
        <img
          src={flow.image.src}
          alt={flow.image.alt}
          width={flow.image.width}
          height={flow.image.height}
          loading="lazy"
          decoding="async"
          className="block h-auto w-full min-w-[720px] rounded-2xl shadow-soft ring-1 ring-(--line) md:min-w-0"
        />
      </figure>
      <ol
        className={`mt-8 grid gap-6 ${FLOW_COLS[flow.steps.length] ?? "md:grid-cols-2"}`}
      >
        {flow.steps.map((step, i) => (
          <li key={step.title} className="flex gap-3">
            <span
              aria-hidden="true"
              className={`mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${FLOW_BADGE[step.tone ?? flow.tone]}`}
            >
              {i + 1}
            </span>
            <div className="space-y-1">
              <StepHeading className="font-display text-lg font-semibold text-(--ink)">
                <span className="sr-only">Step {i + 1}: </span>
                {step.title}
              </StepHeading>
              <p className="text-sm leading-relaxed text-(--muted)">
                {step.body}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
