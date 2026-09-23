import { Link } from "react-router-dom";
import { PromptSection } from "../components/ZipWikiPrompts";
import { CREATE_PROMPTS } from "../lib/create-kb-prompts";

export default function CreateKnowledgePage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-semibold">Create ZipWiki</h1>
        <p className="mt-1 text-sm text-(--muted)">
          Copy a prompt into any agent with ZipWiki MCP. Packing runs on this
          machine — not in the browser. Then open the{" "}
          <code className="text-xs">.zipwiki</code> on{" "}
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
          Create prompts pack with your account parser, then enrich OKF with
          the agent LLM (<code className="text-xs">okf_enrich</code>). The
          debug command does the same pack from the monorepo root, using that
          parser and AI OKF — it does not force LiteParse or skip OKF.
        </p>
      </section>

      <PromptSection title="Create" prompts={CREATE_PROMPTS} />
    </div>
  );
}
