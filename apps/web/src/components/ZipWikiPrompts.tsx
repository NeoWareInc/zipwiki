import { useState } from "react";
import type { ZipWikiPrompt } from "../lib/create-kb-prompts";

export function PromptSection({
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
