/**
 * Fetch slices of https://github.com/xberg-io/test_documents into
 * ~/Documents/xberg-test-documents for ZipWiki archive scripts.
 *
 * WordPerfect fixtures are git-tracked (not the GCS bucket). Ground truth
 * under ground_truth/wordperfect/ is also git-tracked and is downloaded for
 * later parse-accuracy checks (not packed as primaries).
 */
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const XBERG_REPO = "xberg-io/test_documents";
export const XBERG_DEFAULT_ROOT = join(
  homedir(),
  "Documents",
  "xberg-test-documents",
);

const GITHUB_API = "https://api.github.com";
const RAW = "https://raw.githubusercontent.com";

/** @typedef {{ name: string, path: string, size: number, download_url: string | null, type: string }} GhEntry */

/**
 * @param {string} path
 * @param {string} [ref]
 * @returns {Promise<GhEntry[]>}
 */
export async function listGithubDir(path, ref = "main") {
  const url = `${GITHUB_API}/repos/${XBERG_REPO}/contents/${path}?ref=${encodeURIComponent(ref)}`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "zipwiki-xberg-fetch",
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub list ${path}: HTTP ${res.status}`);
  }
  const data = await res.json();
  if (!Array.isArray(data)) {
    throw new Error(`GitHub list ${path}: expected directory listing`);
  }
  return data;
}

/** @returns {Promise<string>} full commit sha for main (or ref) */
export async function resolveRefSha(ref = "main") {
  const url = `${GITHUB_API}/repos/${XBERG_REPO}/commits/${encodeURIComponent(ref)}`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "zipwiki-xberg-fetch",
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub commit ${ref}: HTTP ${res.status}`);
  }
  const data = await res.json();
  if (typeof data.sha !== "string") {
    throw new Error(`GitHub commit ${ref}: missing sha`);
  }
  return data.sha;
}

/**
 * @param {string} repoPath
 * @param {string} destAbs
 * @param {string} sha
 */
export async function downloadRawFile(repoPath, destAbs, sha) {
  mkdirSync(dirname(destAbs), { recursive: true });
  const url = `${RAW}/${XBERG_REPO}/${sha}/${repoPath.split("/").map(encodeURIComponent).join("/")}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "zipwiki-xberg-fetch" },
  });
  if (!res.ok || !res.body) {
    throw new Error(`download ${repoPath}: HTTP ${res.status}`);
  }
  await pipeline(Readable.fromWeb(res.body), createWriteStream(destAbs));
}

export function githubBlobUrl(repoPath, sha) {
  return `https://github.com/${XBERG_REPO}/blob/${sha}/${repoPath}`;
}

/**
 * Fetch WordPerfect documents + ground truth.
 * @param {{ root?: string, ref?: string, force?: boolean }} [opts]
 */
export async function fetchWordPerfectSlice(opts = {}) {
  const root = opts.root ?? XBERG_DEFAULT_ROOT;
  const ref = opts.ref ?? "main";
  const force = opts.force === true;
  const sha = await resolveRefSha(ref);
  const docsDir = join(root, "wordperfect");
  const gtDir = join(root, "ground_truth", "wordperfect");
  mkdirSync(docsDir, { recursive: true });
  mkdirSync(gtDir, { recursive: true });

  const docEntries = (await listGithubDir("wordperfect", sha)).filter(
    (e) =>
      e.type === "file" &&
      /\.(wp|wpd)$/i.test(e.name) &&
      !e.name.startsWith("README"),
  );
  const gtEntries = (await listGithubDir("ground_truth/wordperfect", sha)).filter(
    (e) => e.type === "file",
  );

  /** @type {Array<{ name: string, path: string, uri: string, bytes: number }>} */
  const origins = [];
  let downloaded = 0;
  let skipped = 0;

  for (const entry of docEntries) {
    const dest = join(docsDir, entry.name);
    const uri = githubBlobUrl(entry.path, sha);
    origins.push({
      name: entry.name,
      path: entry.path,
      uri,
      bytes: entry.size,
    });
    if (
      !force &&
      existsSync(dest) &&
      statSync(dest).size === entry.size
    ) {
      skipped += 1;
      continue;
    }
    await downloadRawFile(entry.path, dest, sha);
    downloaded += 1;
  }

  for (const entry of gtEntries) {
    const dest = join(gtDir, entry.name);
    if (
      !force &&
      existsSync(dest) &&
      statSync(dest).size === entry.size
    ) {
      skipped += 1;
      continue;
    }
    await downloadRawFile(entry.path, dest, sha);
    downloaded += 1;
  }

  // Copy PROVENANCE for local attribution (not packed).
  const provenance = (await listGithubDir("wordperfect", sha)).find(
    (e) => e.name === "PROVENANCE.md",
  );
  if (provenance) {
    await downloadRawFile(provenance.path, join(docsDir, "PROVENANCE.md"), sha);
  }

  const originsMd = [
    "# xberg WordPerfect samples: origins",
    "",
    `**Source repo:** https://github.com/${XBERG_REPO}`,
    `**Commit:** \`${sha}\``,
    `**Slice:** \`wordperfect/*.wp\`, \`wordperfect/*.wpd\``,
    `**Ground truth (local only):** \`ground_truth/wordperfect/\` (${gtEntries.length} files)`,
    "",
    "Licenses are per-file (Apache-2.0 / MPL-2.0 / CC0); see `wordperfect/PROVENANCE.md`.",
    "",
    "## Files",
    "| Local name | Repo path | GitHub (pinned) | Size (bytes) |",
    "|---|---|---|---|",
    ...origins.map(
      (o) =>
        `| \`${o.name}\` | \`${o.path}\` | [link](${o.uri}) | ${o.bytes.toLocaleString("en-US")} |`,
    ),
    "",
  ].join("\n");
  writeFileSync(join(docsDir, "README-ORIGINS.md"), originsMd);

  writeFileSync(
    join(root, ".xberg-pin.json"),
    `${JSON.stringify(
      {
        repo: XBERG_REPO,
        ref,
        sha,
        fetchedAt: new Date().toISOString(),
        wordperfectDocs: origins.map((o) => o.name),
        groundTruthCount: gtEntries.length,
      },
      null,
      2,
    )}\n`,
  );

  return {
    root,
    sha,
    docsDir,
    gtDir,
    docs: origins,
    groundTruthCount: gtEntries.length,
    downloaded,
    skipped,
  };
}
