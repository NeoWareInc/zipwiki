import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Directory that contains `eng.traineddata` for LiteParse's local OCR.
 * LiteParse/tesseract-rs otherwise may resolve a broken path
 * (e.g. `/Users/runner/.../tessdata/tessdata/`).
 */
export function resolveTessdataPath(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const candidates: string[] = [];

  const fromEnv = env.TESSDATA_PREFIX?.trim();
  if (fromEnv) {
    candidates.push(fromEnv);
    candidates.push(join(fromEnv, "tessdata"));
  }

  // Vendored next to the package (apps/zipwiki/eng.traineddata).
  const here = dirname(fileURLToPath(import.meta.url));
  candidates.push(join(here, "..", "..", ".."));
  candidates.push(join(here, "..", ".."));

  candidates.push(
    join(homedir(), "Library/Application Support/tesseract-rs/tessdata"),
  );
  candidates.push(join(homedir(), ".tessdata"));
  candidates.push("/opt/homebrew/share/tessdata");
  candidates.push("/usr/local/share/tessdata");
  candidates.push("/usr/share/tesseract-ocr/5/tessdata");
  candidates.push("/usr/share/tessdata");

  for (const dir of candidates) {
    if (existsSync(join(dir, "eng.traineddata"))) return dir;
  }
  return undefined;
}
