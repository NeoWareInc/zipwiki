# NeoZipKit integration (current)

ZipWiki **0.3.0** uses **NeoZipKit 1.6.0** for all NeoZip / APPNOTE wire I/O
(pack, query, update rewrite, web Knowledge / Query).

**Token Service / NFT binding is deferred.** ZipWiki does **not** depend on
`neozip-blockchain` until stamp / mint / verify are product-ready. Packages that
already carry `META-INF/TS-SUBMIT.NZIP`, `TIMESTAMP.NZIP`, or `TOKEN.NZIP` (for
example from `neozip` CLI) remain readable; content updates drop those sidecars
because the Merkle root would no longer match.

Canonical wire spec: NeoZip Application Note **0.3.0-draft** in NeoZipKit
(synced under [format/NEOZIP_APPNOTE.md](./format/NEOZIP_APPNOTE.md) and
[`public-specs/`](../public-specs/NEOZIP_APPNOTE.md)). ZipWiki’s own note is a
**profile** on top of that: [ZIPWIKI_APPNOTE.md](./ZIPWIKI_APPNOTE.md).

## Ownership

| Layer | Owner |
| --- | --- |
| ZIP local / CD / EOCD, methods 0 / 8 / 93, Zip64 | NeoZipKit (`buildZipBufferSync`, `ZipReaderNode`, `ZipReaderBrowser`, `rewriteZip`) |
| Extra Field `0x014E` (SHA-256) | NeoZipKit (`useSHA256` / verify on read) |
| Extra Field `0x014F` (origin TLV) | NeoZipKit builders/parsers; ZipWiki decides *when* to attach |
| Manifest envelope (`format` / `specVersion` / `createdAt` / `profiles`) | NeoZipKit (`createManifest`, `serializeManifest`, `readManifest`, `updateManifest`) |
| Manifest `ai` block, parse, OKF, omit-original policy | **ZipWiki only** |
| CD order META-INF → `{aiRoot}/` → primaries | **ZipWiki** (ordered members into the kit writer) |
| Store-by-suffix (PDF, images, …) | **ZipWiki** (`method: 0` / level per member) |
| Merkle helpers | NeoZipKit (available); ZipWiki pack does not stamp / bind yet |
| `TS-SUBMIT` / `TIMESTAMP` / `TOKEN` create / verify | **Deferred** (`neozip-blockchain` not a ZipWiki dependency) |

There is **no** ZipWiki product module inside NeoZipKit. Kit `writeZipWiki*`
helpers were removed in 1.6.0; ZipWiki composes general primitives.

## Code map

| Concern | ZipWiki | Kit |
| --- | --- | --- |
| Pack write | [`neozipkit-writer.ts`](../apps/zipwiki/src/lib/archive/neozipkit-writer.ts) → `buildZipBufferSync` | `neozipkit/node` |
| List / inflate / verify | [`zip-list.ts`](../apps/zipwiki/src/lib/archive/zip-list.ts), [`integrity.ts`](../apps/zipwiki/src/lib/archive/integrity.ts) | `ZipReaderNode` |
| Update / enrich rewrite | [`rewrite.ts`](../apps/zipwiki/src/lib/archive/rewrite.ts) | `readRaw` + precompressed / atomic write; drops proof sidecars when content changes |
| Web Knowledge / Query | [`apps/web/src/lib/nzip/`](../apps/web/src/lib/nzip/) | `ZipReaderBrowser` via `neozipkit/browser` |

## Dependencies (dev)

- `@zipwiki/zipwiki` / `@zipwiki/web` → `neozipkit` (`file:../neozipkit/packages/neozipkit` until published `^1.6.0`)

Local pack does **not** need login or blockchain credentials.

## Agent open sequence

1. Pack (or open an existing package)
2. `open` / catalog
3. `search` / `query` / OKF reads
4. `read_parsed` / `origin` (`fetch`) / `extract` as needed

## Non-goals

- Moving LlamaParse / LiteParse / OKF generation into NeoZipKit
- Growing a permanent ZipWiki layer inside the kit
- Shipping Token Service stamp / mint in ZipWiki before product support is ready

## References

- NeoZipKit AppNote 0.3.0-draft, `WHATS_NEW` 1.6.0
- [ZIPWIKI_APPNOTE.md](./ZIPWIKI_APPNOTE.md), [CLI.md](./CLI.md), [MCP.md](./MCP.md)
- Golden fixtures: `apps/zipwiki/src/lib/archive/__fixtures__/`
