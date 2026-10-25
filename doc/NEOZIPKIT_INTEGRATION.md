# NeoZipKit integration (prep)

ZipWiki pack currently frames ZIP archives in
[`apps/zipwiki/src/lib/archive/nzip.ts`](../apps/zipwiki/src/lib/archive/nzip.ts)
(`writeZipBuffer` / `buildZip`). A future release should use NeoZipKit /
ZipkitNode for ZIP I/O instead of the hand-rolled writer.

**Direction (important):** ZipWiki does **not** need a ZipWiki-specific module
inside NeoZipKit. Prefer **general ZipkitNode hooks and primitives** so ZipWiki
(and other apps) compose pack behavior on top of the kit. NeoZipKit’s optional
`writeZipWiki*` helpers on `dev` are scaffolding / parity checks only — do not
treat them as the integration target.

**Not done yet:** ZipWiki does not depend on `neozipkit` in package.json.
Parse, OKF, CD order policy, store-by-suffix policy, and full AI
`META-INF/manifest.json` stay in ZipWiki.

## Ownership

| Layer | Owner today | Future |
| --- | --- | --- |
| ZIP local / CD / EOCD, methods 0 / 8 / 93, Zip64 | ZipWiki `nzip.ts` | NeoZipKit ZipkitNode |
| Extra Field `0x014F` (origin) | ZipWiki `origin-extra.ts` (+ kit `OriginExtra`) | Prefer kit builders; ZipWiki still decides *when* to attach |
| Extra Field `0x014E` (SHA-256) | Both (opt-in) | Kit (`useSHA256`) |
| CD order META-INF → `{aiRoot}/` → primaries | ZipWiki pack | **ZipWiki** (pass ordered members into kit) |
| Store-by-suffix (PDF, images, …) | ZipWiki compress | **ZipWiki** (set `method: 0` / level per member) |
| Full AI manifest + parse + OKF | ZipWiki only | ZipWiki only |
| Kit extension hooks (transforms, extra composition) | — | NeoZipKit backlog **E7** |

## Preferred integration shape

Use low-level kit APIs ZipWiki already almost matches:

```ts
import {
  ZipkitNode,
  buildZipBufferSync,
  makeOriginExtra,
} from "neozipkit/node";

// ZipWiki builds members (order, methods, origins) then:
const buf = buildZipBufferSync([
  {
    name: "META-INF/manifest.json",
    data: manifestBytes,
    method: 0,
  },
  {
    name: "wiki/parsed/doc.pdf.md",
    data: parseMd,
    method: 93,
    level: 7,
  },
  {
    name: "doc.pdf",
    data: pdfBytes,
    method: 0,
    additionalExtra: makeOriginExtra({
      uri: "https://example.org/doc.pdf",
      size: pdfBytes.length,
    }),
  },
]);

// or ZipkitNode.writeMembersSync(path, members)
```

Parity targets vs ZipWiki `writeZipBuffer`:

- Default method **93**, level **7** (ZipWiki chooses per member)
- No Unicode-path extra on the buffer path (`emitUnicodePath` off)
- Caller complete Extra Field **`0x014F`** via `additionalExtra` / `makeOriginExtra`
- Optional **`0x014E`** via `useSHA256`

Ask NeoZipKit for **E7 hooks** only where ZipWiki would otherwise fork the
writer (e.g. create/copy entry transforms, cleaner multi-extra composition).

## Suggested ZipWiki migration steps

1. Add a published `neozipkit` dependency to `@zipwiki/zipwiki`; keep `nzip.ts`
   until golden tests pass.
2. Adapter in ZipWiki (e.g. `neozipkit-writer.ts`) that maps pack members onto
   `ZipBufferMember` and calls `buildZipBufferSync` / `writeMembersSync` —
   **not** a hard dependency on kit `writeZipWiki*`.
3. Dual-write or golden ZIP compare (methods, CRC, extras, CD order ZipWiki
   already applied).
4. Point `buildZip` / `writeZipBuffer` at the adapter; delete duplicated
   framing once CI proves compatible.
5. If gaps appear, file NeoZipKit **E7** hooks rather than adding more
   ZipWiki-named APIs to the kit.

## Non-goals

- Moving LlamaParse / LiteParse / OKF into NeoZipKit
- Growing a permanent `neozipkit` ZipWiki product layer
- Requiring `neozip-blockchain` for local pack
- Changing AppNote wire (kit AppNote on `dev` tracks ZipWiki **0.2.0-draft**)

## References

- NeoZipKit backlog: `docs/FUTURE_ENHANCEMENTS.md` (**E7** preferred; **E4a** optional)
- Optional kit scaffolding: `src/node/zipwiki/` (may stay example-only)
- Specs: [ZIPWIKI_APPNOTE.md](./ZIPWIKI_APPNOTE.md), kit `NEOZIP_APPNOTE.md`
