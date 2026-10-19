/**
 * Startup header for the zipwiki CLI. Printed on stderr so command
 * results on stdout stay intact. Quiet flags suppress it.
 */
import { readZipwikiPackageVersion } from "../config/update-check.js";

/** Date shown beside the version. Change it when the version changes. */
export const ZIPWIKI_VERSION_DATE = "2026-10-19";

/** Version shown to users, with the beta label. Package version stays numeric. */
export function formatZipwikiVersion(version: string): string {
  return /\bbeta\b/i.test(version) ? version : `${version} beta`;
}

export function formatZipwikiBanner(
  version: string,
  date = ZIPWIKI_VERSION_DATE,
  product = "ZipWiki",
): string {
  const label = formatZipwikiVersion(version);
  return `${product} Version: ${label} (${date})\nCopyright © 2026 by NeoWare Inc, All rights reserved.\n`;
}

/** Two-line title for the interactive menu frame. */
export function formatZipwikiMenuIntro(version?: string): string {
  const shown = version && version.length > 0 ? version : readZipwikiPackageVersion();
  const [versionLine, copyrightLine] = formatZipwikiBanner(shown).trimEnd().split("\n");
  return `${versionLine}\n│  ${copyrightLine}`;
}

export function cliQuietRequested(argv: string[]): boolean {
  return argv.some((arg) => arg === "-q" || arg === "--quiet");
}

export function printZipwikiBanner(
  argv: string[] = process.argv,
  log: (line: string) => void = console.error,
  version?: string,
  product = "ZipWiki",
): void {
  if (cliQuietRequested(argv)) return;
  const shown = version && version.length > 0 ? version : readZipwikiPackageVersion();
  log(formatZipwikiBanner(shown, ZIPWIKI_VERSION_DATE, product).trimEnd());
}
