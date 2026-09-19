/**
 * Collection structured.pack helpers (NEOZIP_APPNOTE §2.2a).
 *
 * Codec "raw": repeated [u32be payloadLength | utf8 markdown].
 */

export type StructuredPackSlice = {
  /** Byte offset of the unit start (at the u32be) within the pack. */
  offset: number;
  /** Full unit size (4 + payloadLength). */
  length: number;
  /** Markdown byte length (payloadLength). */
  uncompressedLength: number;
};

export type StructuredPackMemberInput = {
  markdown: string;
};

export type StructuredPackBuildResult = {
  pack: Buffer;
  members: StructuredPackSlice[];
};

/**
 * Build a STORED-ready structured.pack from member markdown strings.
 * Order of `members` is preserved and must match descriptor.members[].
 */
export function buildStructuredPack(
  members: StructuredPackMemberInput[],
): StructuredPackBuildResult {
  const parts: Buffer[] = [];
  const slices: StructuredPackSlice[] = [];
  let offset = 0;

  for (const member of members) {
    const payload = Buffer.from(member.markdown, "utf-8");
    if (payload.length > 0xffff_ffff) {
      throw new Error("structured pack member exceeds u32 length");
    }
    const header = Buffer.alloc(4);
    header.writeUInt32BE(payload.length, 0);
    const unitLength = 4 + payload.length;
    slices.push({
      offset,
      length: unitLength,
      uncompressedLength: payload.length,
    });
    parts.push(header, payload);
    offset += unitLength;
  }

  return { pack: Buffer.concat(parts), members: slices };
}

/**
 * Extract UTF-8 markdown for one member from a raw structured.pack buffer.
 * Does not scan other members — uses the descriptor offset/length only.
 */
export function readStructuredPackMember(
  pack: Buffer,
  offset: number,
  length: number,
): string {
  if (offset < 0 || length < 4 || offset + length > pack.length) {
    throw new Error(
      `structured pack slice out of range: offset=${offset} length=${length} pack=${pack.length}`,
    );
  }
  const payloadLength = pack.readUInt32BE(offset);
  if (4 + payloadLength !== length) {
    throw new Error(
      `structured pack unit length mismatch: header=${payloadLength} expectedPayload=${length - 4}`,
    );
  }
  return pack.subarray(offset + 4, offset + 4 + payloadLength).toString("utf-8");
}
