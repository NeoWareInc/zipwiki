/**
 * esbuild/Vite inject target — makes bare `Buffer` resolve in browser modules.
 * NeoZipKit's browser-esm bundle references `Buffer` without a lexical import;
 * `globalThis.Buffer = …` alone is not enough under ESM.
 */
export { Buffer } from "buffer";
