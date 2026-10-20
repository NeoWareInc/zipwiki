import { useEffect, useId, useRef, useState, type ReactNode } from "react";
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
  items: ReadonlyArray<{
    title: string;
    body: string;
    ask?: string;
    art?: string;
  }>;
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
          className="overflow-hidden rounded-xl border border-(--border) bg-(--surface)/80 p-6 shadow-soft"
        >
          {"art" in item && item.art && (
            <ThemedImage
              src={item.art}
              alt=""
              width={240}
              height={140}
              className="-mx-6 -mt-6 mb-5 block h-auto w-[calc(100%+3rem)] max-w-none"
            />
          )}
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
        <ThemedImage
          src={flow.image.src}
          alt={flow.image.alt}
          width={flow.image.width}
          height={flow.image.height}
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

/** "/x/name.svg" → "/x/name-dark.svg" */
export function darkVariant(src: string) {
  return src.replace(/\.svg$/, "-dark.svg");
}

/**
 * Renders the day illustration in light mode and its night version in dark
 * mode. Both are lazy, so the hidden one is never downloaded.
 */
export function ThemedImage({
  src,
  alt,
  width,
  height,
  className = "",
  eager = false,
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
  eager?: boolean;
}) {
  const common = {
    alt,
    width,
    height,
    loading: eager ? ("eager" as const) : ("lazy" as const),
    decoding: "async" as const,
  };
  return (
    <>
      <img {...common} src={src} className={`${className} dark:hidden`} />
      <img
        {...common}
        src={darkVariant(src)}
        className={`${className} hidden dark:block`}
      />
    </>
  );
}

/** Big headline numbers on a bright band. */
export function StatBand({
  stats,
}: {
  stats: ReadonlyArray<{ value: string; label: string; note: string }>;
}) {
  return (
    <dl className="grid gap-px overflow-hidden rounded-2xl bg-(--line) shadow-soft ring-1 ring-(--line) md:grid-cols-3">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="bg-linear-to-br from-(--hero-glow) to-(--surface) p-7"
        >
          <dt className="sr-only">{stat.label}</dt>
          <dd>
            <span className="block font-display text-5xl font-semibold tracking-tight text-(--accent)">
              {stat.value}
            </span>
            <span className="mt-2 block font-semibold text-(--ink)">
              {stat.label}
            </span>
            <span className="mt-2 block text-sm leading-relaxed text-(--muted)">
              {stat.note}
            </span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Sticky "On this page" menu that sits under the site header and
 * highlights the section currently in view.
 */
export function OnThisPage({
  sections,
}: {
  sections: ReadonlyArray<{ id: string; label: string }>;
}) {
  const [active, setActive] = useState<string>(sections[0]?.id ?? "");
  const navRef = useRef<HTMLElement>(null);

  // Active = the last section whose top has scrolled up under the menu.
  // Seven getBoundingClientRect calls per scroll event is cheap, so no
  // requestAnimationFrame throttle (rAF also pauses in background tabs).
  useEffect(() => {
    function update() {
      const line = (navRef.current?.getBoundingClientRect().bottom ?? 0) + 24;
      let current = sections[0]?.id ?? "";
      for (const s of sections) {
        const el = document.getElementById(s.id);
        if (el && el.getBoundingClientRect().top <= line) current = s.id;
      }
      // The last section is often too short to reach the menu line.
      const atBottom =
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 4;
      if (atBottom && sections.length) current = sections[sections.length - 1].id;
      setActive(current);
    }
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [sections]);

  // Keep the active pill visible when the menu scrolls sideways on phones.
  useEffect(() => {
    const pill = navRef.current?.querySelector<HTMLElement>(
      `[data-section="${active}"]`,
    );
    pill?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active]);

  return (
    <nav
      ref={navRef}
      aria-label="On this page"
      className="sticky top-[var(--site-header-h,4.5rem)] z-10 border-y border-(--line)/70 bg-(--paper)/90 backdrop-blur-md"
    >
      <div className="mx-auto flex max-w-6xl items-center gap-2 overflow-x-auto px-6 py-2.5 [scrollbar-width:none]">
        <span className="mr-1 shrink-0 text-xs font-semibold tracking-wide text-(--muted) uppercase">
          On this page
        </span>
        {sections.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            data-section={s.id}
            aria-current={active === s.id ? "true" : undefined}
            className={`shrink-0 rounded-full px-3 py-1 text-sm font-medium transition-colors ${
              active === s.id
                ? "bg-(--accent) text-white dark:text-(--paper)"
                : "text-(--ink) hover:bg-(--paper-deep)"
            }`}
          >
            {s.label}
          </a>
        ))}
      </div>
    </nav>
  );
}

/** Tabbed card for several related code examples. */
export function CodeTabs({
  tabs,
}: {
  tabs: ReadonlyArray<{ label: string; caption: string; code: string }>;
}) {
  const [index, setIndex] = useState(0);
  const baseId = useId();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function onKeyDown(e: React.KeyboardEvent) {
    const last = tabs.length - 1;
    let next = index;
    if (e.key === "ArrowRight") next = index === last ? 0 : index + 1;
    else if (e.key === "ArrowLeft") next = index === 0 ? last : index - 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = last;
    else return;
    e.preventDefault();
    setIndex(next);
    tabRefs.current[next]?.focus();
  }

  const tab = tabs[index];
  return (
    <div className="overflow-hidden rounded-xl border border-(--border) bg-(--paper) shadow-soft">
      <div
        role="tablist"
        aria-label="Origin examples"
        onKeyDown={onKeyDown}
        className="flex gap-1 overflow-x-auto border-b border-(--line) bg-(--surface) px-2 pt-2"
      >
        {tabs.map((t, i) => (
          <button
            key={t.label}
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${baseId}-tab-${i}`}
            aria-selected={i === index}
            aria-controls={`${baseId}-panel`}
            tabIndex={i === index ? 0 : -1}
            onClick={() => setIndex(i)}
            className={`shrink-0 rounded-t-lg border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              i === index
                ? "border-(--accent) bg-(--paper) text-(--ink)"
                : "border-transparent text-(--muted) hover:text-(--ink)"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${baseId}-panel`}
        aria-labelledby={`${baseId}-tab-${index}`}
        className="p-5"
      >
        <p className="text-xs font-semibold tracking-wide text-(--accent) uppercase">
          {tab.caption}
        </p>
        <pre className="mt-3 overflow-x-auto text-xs leading-relaxed text-(--ink)">
          {tab.code}
        </pre>
      </div>
    </div>
  );
}
