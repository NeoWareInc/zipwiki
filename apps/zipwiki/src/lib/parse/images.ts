import { basename } from "node:path";
import type { ParsedImage } from "./types.js";

/**
 * Point markdown image hrefs at `{primary}.assets/{file}` beside the parse.
 * Leaves an href alone when it already includes that directory.
 */
export function retargetParsedImageHrefs(
  markdown: string,
  primaryName: string,
  images: Array<Pick<ParsedImage, "name" | "hrefs">>,
): string {
  const dir = `${basename(primaryName.replace(/\\/g, "/"))}.assets`;
  let out = markdown;
  for (const image of images) {
    const file = basename(image.name);
    if (!file) continue;
    const dest = `${dir}/${file}`;
    const hrefs = new Set([file, ...(image.hrefs ?? [])]);
    for (const href of hrefs) {
      if (!href || href === dest) continue;
      const from = `](${href})`;
      const to = `](${dest})`;
      if (out.includes(to)) continue;
      out = out.split(from).join(to);
    }
  }
  return out;
}

/** Image bytes from a LiteParse result. Duplicates stay on the first file. */
export function imagesFromLiteParse(raw: unknown): ParsedImage[] {
  const images = (
    raw as {
      images?: Array<{
        id?: string;
        name?: string;
        format?: string;
        bytes?: Buffer;
        duplicateOf?: string;
      }>;
    } | null
  )?.images;
  if (!Array.isArray(images)) return [];
  const out: ParsedImage[] = [];
  for (const image of images) {
    if (image.duplicateOf || !image.bytes?.length) continue;
    const format = image.format || "bin";
    const generated = image.id ? `img_${image.id}.${format}` : "";
    const name = basename(image.name || generated || `img_${out.length}.${format}`);
    const hrefs =
      generated && generated !== name ? [generated] : undefined;
    out.push({
      name,
      bytes: Buffer.from(image.bytes),
      ...(hrefs ? { hrefs } : {}),
    });
  }
  return out;
}
