/** Append ZipWiki install hints when LiteParse fails Office conversion. */

const OFFICE_HINT_RE =
  /libreoffice|soffice|office|docx|xlsx|pptx|odt|ods|odp|convert/i;

/** LiteParse / platform messages that mean LibreOffice is not available. */
const LIBREOFFICE_MISSING_RE =
  /libreoffice is not installed|soffice (?:is )?(?:not (?:installed|found)|missing)|please install libreoffice/i;

export const LIBREOFFICE_INSTALL_HINT =
  "Office formats (DOCX/XLSX/PPTX, …) need LibreOffice (`soffice` on PATH). " +
  "Install: macOS `brew install --cask libreoffice`; " +
  "Linux `sudo apt install libreoffice`; " +
  "see https://developers.llamaindex.ai/liteparse/guides/multi-format/";

export function isLibreOfficeMissingError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return LIBREOFFICE_MISSING_RE.test(msg);
}

export function withLibreOfficeHint(message: string): string {
  if (!OFFICE_HINT_RE.test(message)) return message;
  if (/brew install --cask libreoffice/i.test(message)) return message;
  return `${message}\n${LIBREOFFICE_INSTALL_HINT}`;
}

export function annotateParseError(err: unknown): Error {
  const msg = err instanceof Error ? err.message : String(err);
  const annotated = withLibreOfficeHint(msg);
  if (annotated === msg && err instanceof Error) return err;
  return new Error(annotated);
}

/** Platform package-manager install for LibreOffice, when we can detect one. */
export function libreOfficeInstallCommand(
  platform = process.platform,
): { command: string; args: string[]; label: string } | null {
  if (platform === "darwin") {
    return {
      command: "brew",
      args: ["install", "--cask", "libreoffice"],
      label: "brew install --cask libreoffice",
    };
  }
  if (platform === "linux") {
    return {
      command: "sudo",
      args: ["apt-get", "install", "-y", "libreoffice"],
      label: "sudo apt-get install -y libreoffice",
    };
  }
  if (platform === "win32") {
    return {
      command: "choco",
      args: ["install", "libreoffice-fresh", "-y"],
      label: "choco install libreoffice-fresh -y",
    };
  }
  return null;
}
