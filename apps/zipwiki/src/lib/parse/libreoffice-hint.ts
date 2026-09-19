/** Append ZipWiki install hints when LiteParse fails Office conversion. */

const OFFICE_HINT_RE =
  /libreoffice|soffice|office|docx|xlsx|pptx|odt|ods|odp|convert/i;

export const LIBREOFFICE_INSTALL_HINT =
  "Office formats (DOCX/XLSX/PPTX, …) need LibreOffice (`soffice` on PATH). " +
  "Install: macOS `brew install --cask libreoffice`; " +
  "Linux `sudo apt install libreoffice`; " +
  "see https://developers.llamaindex.ai/liteparse/guides/multi-format/";

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
