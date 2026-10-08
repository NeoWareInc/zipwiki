import { useEffect, useState } from "react";
import { PageHero, Section } from "./MarketingUi";

const VERSION = "0.1.0";
const SITE = "https://zipwiki.ai";

const BUILDS = [
  {
    id: "darwin-arm64",
    label: "macOS Apple silicon",
    file: `zipwiki-${VERSION}-darwin-arm64.tgz`,
  },
  {
    id: "darwin-x64",
    label: "macOS Intel",
    file: `zipwiki-${VERSION}-darwin-x64.tgz`,
  },
  {
    id: "linux-x64",
    label: "Linux x64",
    file: `zipwiki-${VERSION}-linux-x64.tgz`,
  },
  {
    id: "win32-x64",
    label: "Windows x64",
    file: `zipwiki-${VERSION}-win32-x64.tgz`,
  },
] as const;

type ReleaseIndex = { version?: string; files?: string[] };

export default function InstallPage() {
  const [published, setPublished] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    void fetch("/releases/index.json")
      .then((response) => (response.ok ? response.json() : null))
      .then((body: ReleaseIndex | null) => {
        if (cancelled || !body || !Array.isArray(body.files)) return;
        setPublished(new Set(body.files));
      })
      .catch(() => {
        // The commands stay visible when the index is missing.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main>
      <Section>
        <PageHero
          kicker="Install"
          title="Install ZipWiki on this machine"
          lead="One package includes the zipwiki command, LiteParse, and the zipwiki-mcp server. It is not on the public npm registry. Node installs the file from this site."
        />
      </Section>

      <section className="border-t border-(--line) bg-white/50">
        <Section>
          <h2 className="font-display text-3xl font-semibold text-(--ink)">
            What you need
          </h2>
          <ul className="mt-4 max-w-3xl list-disc space-y-2 pl-5 text-(--muted)">
            <li>Node.js 22.13 or newer.</li>
            <li>
              LibreOffice, if you pack Word, Excel, or PowerPoint. PDF and text
              files do not need it.
            </li>
          </ul>
        </Section>
      </section>

      <Section>
        <h2 className="font-display text-3xl font-semibold text-(--ink)">
          Download
        </h2>
        <p className="mt-3 max-w-3xl text-(--muted)">
          Choose the build for this computer. Each file is version {VERSION}.
        </p>
        <div className="mt-8 grid gap-4">
          {BUILDS.map((build) => {
            const href = `/releases/${build.file}`;
            const command = `npm i -g ${SITE}${href}`;
            const ready = published.has(build.file);
            return (
              <article
                key={build.id}
                className="rounded-xl border border-(--border) bg-white p-5 shadow-soft"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="font-display text-xl font-semibold text-(--ink)">
                    {build.label}
                  </h3>
                  {ready ? (
                    <a
                      href={href}
                      className="rounded-md bg-(--accent) px-3 py-1.5 text-sm font-semibold text-white hover:bg-(--accent-bright)"
                    >
                      Download
                    </a>
                  ) : (
                    <span className="text-sm text-(--muted)">Not published yet</span>
                  )}
                </div>
                <pre className="mt-3 overflow-x-auto rounded-md bg-(--paper) px-3 py-2 text-xs leading-relaxed text-(--ink)">
                  {command}
                </pre>
              </article>
            );
          })}
        </div>
        <p className="mt-6 text-sm text-(--muted)">
          LiteParse, Tesseract, and PDFium notices:{" "}
          <a href="/releases/THIRD_PARTY_NOTICES" className="link-package">
            THIRD_PARTY_NOTICES
          </a>
          .
        </p>
      </Section>

      <section className="border-t border-(--line) bg-white/50">
        <Section>
          <h2 className="font-display text-3xl font-semibold text-(--ink)">
            After install
          </h2>
          <pre className="mt-4 overflow-x-auto rounded-md bg-(--paper) px-3 py-2 text-xs leading-relaxed text-(--ink)">
            {`zipwiki --help
zipwiki login`}
          </pre>
          <p className="mt-4 max-w-3xl text-(--muted)">
            <code className="text-xs">zipwiki login</code> is for hosted
            questions. Packing with LiteParse stays on this machine and does not
            need an account.
          </p>
          <p className="mt-6 max-w-3xl text-(--muted)">
            Claude or Cursor, once <code className="text-xs">zipwiki-mcp</code>{" "}
            is on your PATH:
          </p>
          <pre className="mt-3 overflow-x-auto rounded-md bg-(--paper) px-3 py-2 text-xs leading-relaxed text-(--ink)">
            {`{
  "mcpServers": {
    "zipwiki": {
      "command": "zipwiki-mcp"
    }
  }
}`}
          </pre>
        </Section>
      </section>
    </main>
  );
}
