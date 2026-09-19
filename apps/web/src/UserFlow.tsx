const FILES = [
  "Ch_2025-001.pdf",
  "Ch_2025-042.pdf",
  "Ch_2024-168.pdf",
] as const;

const LOOP = [
  { step: "Catalog", detail: "What’s inside the package" },
  { step: "Search", detail: "“homestead exemption”" },
  { step: "Read", detail: "OKF first, then parsed" },
  { step: "Origin", detail: "laws.flrules.org/2025/1" },
] as const;

export default function UserFlow() {
  return (
    <figure
      className="anim-rise anim-rise-delay-4 w-full"
      aria-label="ZipWiki loop on the Florida session-laws sample"
    >
      <div className="rounded-2xl border border-(--border) bg-white/80 p-5 shadow-soft sm:p-7">
        <p className="text-xs font-semibold tracking-wide text-(--accent) uppercase">
          Sample — Florida session laws
        </p>
        <p className="mt-1 text-sm text-(--muted)">
          Pack the PDFs. Query the{" "}
          <code className="text-[0.9em]">.zipwiki</code>. Fetch the official
          original only if you need it.
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          {FILES.map((name) => (
            <span
              key={name}
              className="inline-flex items-center rounded-md border border-(--border) bg-(--paper) px-2.5 py-1 font-mono text-xs text-(--ink)"
            >
              {name}
            </span>
          ))}
        </div>

        <p className="mt-4 text-center text-xs font-semibold tracking-wide text-(--accent) uppercase">
          Pack · LiteParse + OKF
        </p>

        <div className="mt-3 rounded-xl border border-(--line) bg-(--paper) px-4 py-4 sm:px-5">
          <p className="font-display text-lg font-semibold text-(--ink)">
            florida-laws.zipwiki
          </p>
          <p className="mt-1 font-mono text-xs text-(--muted)">
            ./knowledge/florida-laws.zipwiki
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-(--ink)">
              wiki/okf/
            </span>
            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-(--ink)">
              wiki/parsed/
            </span>
            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-(--ink)">
              origin 0x014F
            </span>
          </div>
        </div>

        <ol className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {LOOP.map((item, i) => (
            <li
              key={item.step}
              className="rounded-xl border border-(--border) bg-white px-3 py-3"
            >
              <p className="text-[0.65rem] font-semibold tracking-wide text-(--accent) uppercase">
                {String(i + 1).padStart(2, "0")} {item.step}
              </p>
              <p className="mt-1 text-sm leading-snug text-(--ink)">{item.detail}</p>
            </li>
          ))}
        </ol>
      </div>
    </figure>
  );
}
