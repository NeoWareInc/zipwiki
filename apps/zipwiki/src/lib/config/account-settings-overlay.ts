import type { AccountSettingsBody } from "@zipwiki/api-client";
import type { ZipwikiConfigInput } from "./schema.js";

/** Map account profile → project config overlay (non-secret). */
export function accountSettingsToConfigInput(
  settings: AccountSettingsBody,
): ZipwikiConfigInput {
  const overlay: ZipwikiConfigInput = {};

  const parser: NonNullable<ZipwikiConfigInput["parser"]> = {};
  if (settings.parser.engine) parser.engine = settings.parser.engine;
  if (settings.parser.mode) parser.mode = settings.parser.mode;
  if (settings.parser.liteparse) {
    parser.liteparse = { ...settings.parser.liteparse };
  }
  if (settings.parser.llamaparse) {
    parser.llamaparse = { ...settings.parser.llamaparse };
  }
  if (settings.parser.escalate) {
    parser.escalate = { ...settings.parser.escalate };
  }
  if (Object.keys(parser).length > 0) overlay.parser = parser;

  const okf: NonNullable<ZipwikiConfigInput["okf"]> = {};
  if (settings.okf.useAi !== undefined) okf.useAi = settings.okf.useAi;
  if (settings.okf.provider) okf.provider = settings.okf.provider;
  if (settings.okf.model) okf.model = settings.okf.model;
  if (settings.okfCredential === "local" || settings.okf.useAi === false) {
    okf.useAi = false;
  }
  if (Object.keys(okf).length > 0) overlay.okf = okf;

  const pack: NonNullable<ZipwikiConfigInput["pack"]> = {};
  if (settings.pack.noOcr !== undefined) pack.noOcr = settings.pack.noOcr;
  if (settings.pack.omitOriginalDocuments !== undefined) {
    pack.omitOriginalDocuments = settings.pack.omitOriginalDocuments;
  }
  if (settings.pack.compression) pack.compression = settings.pack.compression;
  if (settings.pack.level !== undefined) pack.level = settings.pack.level;
  if (settings.pack.storeSuffixes) {
    pack.storeSuffixes = [...settings.pack.storeSuffixes];
  }
  if (Object.keys(pack).length > 0) overlay.pack = pack;

  return overlay;
}
