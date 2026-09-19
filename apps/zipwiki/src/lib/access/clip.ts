/** Clip UTF-8 / binary buffers for agent context budgets. */

import { isUtf8 } from "node:buffer";

export const DEFAULT_MAX_BYTES = 160_000;

export function clipUtf8(
  buf: Buffer,
  maxBytes: number,
  offset = 0,
): {
  text: string;
  truncated: boolean;
  totalBytes: number;
} {
  const totalBytes = buf.length;
  const start = Math.max(0, offset);
  const slice = buf.subarray(start, start + maxBytes);
  const text = slice.toString("utf8");
  const truncated = start + slice.length < totalBytes;
  return { text, truncated, totalBytes };
}

export function clipBytes(
  buf: Buffer,
  maxBytes: number,
  offset = 0,
): {
  slice: Buffer;
  truncated: boolean;
  totalBytes: number;
} {
  const totalBytes = buf.length;
  const start = Math.max(0, offset);
  const slice = buf.subarray(start, start + maxBytes);
  const truncated = start + slice.length < totalBytes;
  return { slice, truncated, totalBytes };
}

/** True when the buffer is valid UTF-8 (suitable for text streaming). */
export function bufferLooksUtf8(buf: Buffer): boolean {
  return isUtf8(buf);
}
