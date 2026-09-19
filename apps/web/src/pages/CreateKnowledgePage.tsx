import { useState } from "react";
import { Link } from "react-router-dom";
import {
  CREATE_PROMPTS,
  QUERY_PROMPTS,
  type ZipWikiPrompt,
} from "../lib/create-kb-prompts";

export default function CreateKnowledgePage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-semibold">Create ZipWiki</h1>
        <p className="mt-1 text-sm text-(--muted)">
          Copy a single prompt into any agent with ZipWiki MCP. Creation and
          query run on this machine — not in the browser. Then open a{" "}
          <code className="text-xs">.nzip</code> on{" "}
          <Link
            to="/dashboard/knowledge"
            className="text-(--accent) hover:underline"
          >
            Knowledge
          </Link>
          .
        </p>
      </div>

      <section className="space-y-3 rounded-xl border border-(--border) bg-white p-5 shadow-soft">
        <h2 className="font-display text-lg font-semibold">How to run</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-(--ink)">
          <li>
            Enable ZipWiki MCP (
            <code className="text-xs">zipwiki-mcp</code>).
          </li>
          <li>Copy one prompt below into your agent.</li>
          <li>Approve the tool call when asked.</li>
        </ol>
        <p className="text-xs text-(--muted)">
          Create prompts always include AI OKF via the agent (
          <code className="text-xs">okf_enrich</code>). Debug CLI runs from
          the monorepo root (
          <code className="text-xs">pnpm zipwiki -- … --no-ai-okf</code>
          ) — enrich with MCP afterward.
        </p>
      </section>

      <PromptSection title="Create" prompts={CREATE_PROMPTS} />
      <PromptSection title="Query" prompts={QUERY_PROMPTS} />
    </div>
  );
}

function PromptSection({
  title,
  prompts,
}: {
  title: string;
  prompts: ZipWikiPrompt[];
}) {
  return (
    <section className="space-y-4">
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      <div className="grid gap-4">
        {prompts.map((p) => (
          <PromptCard key={p.id} prompt={p} />
        ))}
      </div>
    </section>
  );
}

function PromptCard({ prompt }: { prompt: ZipWikiPrompt }) {
  return (
    <article className="space-y-3 rounded-xl border border-(--border) bg-white p-5 shadow-soft">
      <div className="min-w-0 space-y-1">
        <h3 className="font-display text-base font-semibold">{prompt.title}</h3>
        <p className="text-sm text-(--muted)">{prompt.description}</p>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-medium text-(--muted)">Prompt</span>
          <CopyButton value={prompt.prompt} label="Copy prompt" />
        </div>
        <pre className="overflow-auto rounded-lg border border-(--border) bg-(--paper) p-3 text-xs leading-relaxed whitespace-pre-wrap text-(--ink)">
          {prompt.prompt}
        </pre>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-medium text-(--muted)">Debug CLI</span>
          <CopyButton value={prompt.debugCli} label="Copy command" />
        </div>
        <pre className="overflow-auto rounded-lg border border-dashed border-(--border) bg-(--paper) p-3 text-xs leading-relaxed whitespace-pre-wrap text-(--muted)">
          {prompt.debugCli}
        </pre>
      </div>
    </article>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="shrink-0 rounded-md border border-(--border) bg-white px-3 py-1.5 text-xs font-semibold text-(--ink) hover:bg-(--paper)"
    >
      {copied ? "Copied" : label}
    </button>
  );
}
