import { useEffect, useState } from "react";
import { MCP_INSTALL_BLOCKS } from "../../../../mcp/src/mcp-clients";
import { DOWNLOAD_PREREQS } from "../../lib/marketing-copy";
import { PageHero, SecondaryCta, Section } from "./MarketingUi";

const BUILDS = [
  {
    id: "darwin-arm64",
    label: "macOS Apple silicon",
    platform: "darwin",
    arch: "arm64",
  },
  {
    id: "darwin-x64",
    label: "macOS Intel",
    platform: "darwin",
    arch: "x64",
  },
  {
    id: "linux-x64",
    label: "Linux x64 (glibc)",
    platform: "linux",
    arch: "x64",
  },
  {
    id: "linux-arm64",
    label: "Linux ARM64 (glibc)",
    platform: "linux",
    arch: "arm64",
  },
  {
    id: "win32-x64",
    label: "Windows x64",
    platform: "win32",
    arch: "x64",
  },
] as const;

type ReleaseIndex = { version?: string; files?: string[] };

function ScriptBlock({
  value,
  label,
  className = "mt-3",
}: {
  value: string;
  label: string;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <pre className="overflow-x-auto rounded-md bg-(--paper) py-2 pr-12 pl-3 text-xs leading-relaxed text-(--ink)">
        {value}
      </pre>
      <div className="absolute top-1.5 right-1.5">
        <CopyIconButton value={value} label={label} />
      </div>
    </div>
  );
}

function CopyIconButton({ value, label }: { value: string; label: string }) {
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
      title={copied ? "Copied" : label}
      aria-label={copied ? "Copied" : label}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-(--muted) hover:bg-(--surface) hover:text-(--ink)"
    >
      {copied ? <CheckIcon /> : <ClipboardIcon />}
    </button>
  );
}

function ClipboardIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function tarballName(version: string, platform: string, arch: string): string {
  return `zipwiki-${version}-${platform}-${arch}.tgz`;
}

function isDevHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === "dev.zipwiki.ai" ||
    host === "localhost" ||
    host === "127.0.0.1" ||
    /^zipwiki-web(?:[.-][a-z0-9-]+)?\.vercel\.app$/.test(host)
  );
}

export default function InstallPage() {
  const [version, setVersion] = useState("0.1.0");
  const [published, setPublished] = useState<Set<string>>(new Set());
  const [siteOrigin, setSiteOrigin] = useState("https://zipwiki.ai");
  const [devHost, setDevHost] = useState(false);
  /** Production: /releases. Dev rehearsal host: /dev-releases (never on zipwiki.ai). */
  const [releasesBase, setReleasesBase] = useState("/releases");

  useEffect(() => {
    const origin = window.location.origin.replace(/\/$/, "");
    const isDev = isDevHost(window.location.hostname);
    const base = isDev ? "/dev-releases" : "/releases";
    setSiteOrigin(origin);
    setDevHost(isDev);
    setReleasesBase(base);

    let cancelled = false;
    void fetch(`${base}/index.json`)
      .then((response) => (response.ok ? response.json() : null))
      .then((body: ReleaseIndex | null) => {
        if (cancelled || !body) return;
        if (typeof body.version === "string" && body.version.trim()) {
          setVersion(body.version.trim());
        }
        if (Array.isArray(body.files)) {
          setPublished(
            new Set(
              body.files.filter(
                (name): name is string => typeof name === "string",
              ),
            ),
          );
        }
      })
      .catch(() => {
        /* keep defaults when the index is missing */
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
          lead="One package includes the zipwiki command, LiteParse, and the zipwiki-mcp server. Download the release tarball for your OS, or install it globally with npm from this site."
        />
        {devHost ? (
          <p className="mt-4 max-w-3xl rounded-lg border border-(--border) bg-(--paper) p-4 text-sm text-(--muted)">
            Dev rehearsal host — install commands use{" "}
            <code className="text-xs">{siteOrigin}/dev-releases/</code> so the
            tarball comes from this site, not production{" "}
            <code className="text-xs">/releases/</code>.
          </p>
        ) : null}
        <div className="mt-8 flex flex-wrap gap-3">
          <SecondaryCta to="/how-it-works">See how it works</SecondaryCta>
        </div>
      </Section>

      <section className="border-t border-(--line) bg-(--surface)/50">
        <Section>
          <h2 className="font-display text-3xl font-semibold text-(--ink)">
            What you need
          </h2>
          <ul className="mt-4 max-w-3xl space-y-4">
            {DOWNLOAD_PREREQS.map((prereq) => (
              <li key={prereq.title}>
                <p className="text-(--muted)">
                  <span className="font-medium text-(--ink)">{prereq.title}</span>
                  {" — "}
                  {prereq.blurb}
                </p>
                <details className="mt-2 group">
                  <summary className="cursor-pointer list-none text-sm font-medium text-(--accent) underline-offset-4 hover:underline [&::-webkit-details-marker]:hidden">
                    <span className="inline-flex items-center gap-1.5">
                      How to install
                      <span
                        aria-hidden="true"
                        className="transition-transform group-open:rotate-90"
                      >
                        ›
                      </span>
                    </span>
                  </summary>
                  <div className="mt-3 space-y-4 border-l border-(--border) pl-4">
                    {prereq.docsHref && prereq.docsLabel ? (
                      <p className="text-sm text-(--muted)">
                        Download an installer from{" "}
                        <a
                          href={prereq.docsHref}
                          className="underline-offset-4 hover:underline"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {prereq.docsLabel}
                        </a>
                        , or use a package manager:
                      </p>
                    ) : null}
                    {prereq.installs.map((install) => (
                      <div key={install.label}>
                        <p className="text-sm font-medium text-(--ink)">
                          {install.label}
                        </p>
                        <ScriptBlock
                          value={install.command}
                          label={`Copy ${install.label} command`}
                          className="mt-2"
                        />
                      </div>
                    ))}
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </Section>
      </section>

      <Section>
        <h2 className="font-display text-3xl font-semibold text-(--ink)">
          Download
        </h2>
        <p className="mt-3 max-w-3xl text-(--muted)">
          Choose the zipwiki-bundle build for this computer. Each file is version{" "}
          {version} and includes the matching LiteParse native library. After
          download, install with{" "}
          <code className="text-sm">npm i -g ./zipwiki-….tgz</code>, or use the
          one-liner below (npm fetches the same file from this site).
        </p>
        <div className="mt-8 grid gap-4">
          {BUILDS.map((build) => {
            const file = tarballName(version, build.platform, build.arch);
            const href = `${releasesBase}/${file}`;
            const command = `npm i -g ${siteOrigin}${href}`;
            const ready = published.has(file);
            return (
              <article
                key={build.id}
                className="rounded-xl border border-(--border) bg-(--surface) p-5 shadow-soft"
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
                    <span className="text-sm text-(--muted)">
                      Not published yet
                    </span>
                  )}
                </div>
                {ready ? (
                  <ScriptBlock
                    value={command}
                    label={`Copy ${build.label} install command`}
                  />
                ) : (
                  <p className="mt-3 text-sm text-(--muted)">
                    No install URL until this platform’s tarball is published.
                  </p>
                )}
              </article>
            );
          })}
        </div>
        <p className="mt-6 text-sm text-(--muted)">
          LiteParse, Tesseract, and PDFium notices:{" "}
          <a
            href={`${releasesBase}/THIRD_PARTY_NOTICES`}
            className="underline-offset-4 hover:underline"
          >
            THIRD_PARTY_NOTICES
          </a>
          . Linux builds need glibc (Debian/Ubuntu/RHEL). Alpine musl is not
          published on this page yet.
        </p>
      </Section>

      <section className="border-t border-(--line) bg-(--surface)/50">
        <Section>
          <h2 className="font-display text-3xl font-semibold text-(--ink)">
            After install
          </h2>
          <ScriptBlock
            className="mt-4"
            value={"zipwiki --help\nzipwiki login"}
            label="Copy post-install commands"
          />
          <p className="mt-4 max-w-3xl text-(--muted)">
            <code className="text-xs">zipwiki login</code> is for hosted
            questions. Packing with LiteParse stays on this machine and does not
            need an account.
          </p>
          <div id="agents" className="mt-10 space-y-10">
            <div>
              <h3 className="font-display text-2xl font-semibold text-(--ink)">
                Connect zipwiki-mcp
              </h3>
              <p className="mt-3 max-w-3xl text-(--muted)">
                After <code className="text-xs">zipwiki-mcp</code> is on your
                PATH, add it to the agent you use. Most agents share one JSON
                file. Visual Studio Code, Codex, Zed, Continue, Goose, and
                OpenCode use their own shape.
              </p>
            </div>
            {MCP_INSTALL_BLOCKS.map((block) => (
              <div key={block.id}>
                <h3 className="font-display text-xl font-semibold text-(--ink)">
                  {block.title}
                </h3>
                <ul className="mt-3 max-w-3xl space-y-2 text-sm text-(--muted)">
                  {block.places.map((place) => (
                    <li key={place.name}>
                      <span className="font-medium text-(--ink)">
                        {place.name}.
                      </span>{" "}
                      {place.path}
                    </li>
                  ))}
                </ul>
                {block.note ? (
                  <p className="mt-3 max-w-3xl text-sm text-(--muted)">
                    {block.note}
                  </p>
                ) : null}
                <ScriptBlock
                  value={block.config}
                  label={`Copy ${block.title} config`}
                />
              </div>
            ))}
          </div>
        </Section>
      </section>
    </main>
  );
}
