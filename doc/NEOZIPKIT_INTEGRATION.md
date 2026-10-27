# NeoZipKit integration (current)

ZipWiki **0.3.0** uses **NeoZipKit 1.6.0** for all NeoZip / APPNOTE wire I/O and
**neozip-blockchain 2.0.0** for Token Service timestamps and NFT binding.
ZipWiki still owns AI content and pack policy.

Canonical wire spec: NeoZip Application Note **0.3.0-draft** in NeoZipKit
([`packages/neozipkit/NEOZIP_APPNOTE.md`](../../neozipkit/packages/neozipkit/NEOZIP_APPNOTE.md);
synced copies under [format/NEOZIP_APPNOTE.md](./format/NEOZIP_APPNOTE.md) and
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
| Merkle v1/v0 | NeoZipKit; ZipWiki records results in pack / stamp |
| `TS-SUBMIT` / `TIMESTAMP` / `TOKEN` sidecars | neozip-blockchain (`stampArchive`, `upgradeTimestamp`, `mint*`, `verifyArchive`) |

There is **no** ZipWiki product module inside NeoZipKit. Kit `writeZipWiki*`
helpers were removed in 1.6.0; ZipWiki composes general primitives.

## Code map

| Concern | ZipWiki | Kit / blockchain |
| --- | --- | --- |
| Pack write | [`neozipkit-writer.ts`](../apps/zipwiki/src/lib/archive/neozipkit-writer.ts) → `buildZipBufferSync` | `neozipkit/node` |
| List / inflate / verify | [`zip-list.ts`](../apps/zipwiki/src/lib/archive/zip-list.ts), [`integrity.ts`](../apps/zipwiki/src/lib/archive/integrity.ts) | `ZipReaderNode` |
| Update / enrich rewrite | [`rewrite.ts`](../apps/zipwiki/src/lib/archive/rewrite.ts) | `readRaw` + precompressed / atomic write; drops proof sidecars when content changes |
| Chain CLI / MCP | [`lib/chain/`](../apps/zipwiki/src/lib/chain/) | `neozip-blockchain/archive` |
| Web Knowledge / Query | [`apps/web/src/lib/nzip/`](../apps/web/src/lib/nzip/) | `ZipReaderBrowser` via `neozipkit/browser` |

## Dependencies (dev)

During integration, workspace packages use `file:` links to the sibling
NeoZipKit repo:

- `@zipwiki/zipwiki` → `neozipkit`, `neozip-blockchain`
- `@zipwiki/web` → `neozipkit`

Release packages should pin published `neozipkit@^1.6.0` and
`neozip-blockchain@^2.0.0` after those versions are on npm.

Local pack does **not** require blockchain credentials. Stamp / mint need a
verified Token Service email and (for mint) a wallet key from the environment
only — never the OS keychain, never secrets inside the `.zipwiki`.

## Agent open sequence

1. Pack (or open an existing package)
2. `open` / catalog (includes `blockchain` status when sidecars exist)
3. Optional `verify` (offline by default) when proofs matter
4. `search` / `query` / OKF reads
5. `read_parsed` / `origin` (`fetch`) / `extract` as needed

MCP `stamp` / `upgrade` / `mint` use the same table → human yes →
`confirm:true` + `humanApproved:true` pattern as `pack`.

## Non-goals (unchanged)

- Moving LlamaParse / LiteParse / OKF generation into NeoZipKit
- Growing a permanent ZipWiki layer inside the kit
- Requiring `neozip-blockchain` for local pack
- OpenTimestamps (removed from neozip-blockchain 2.0.0)

## References

- NeoZipKit AppNote 0.3.0-draft, `WHATS_NEW` 1.6.0, `docs/FUTURE_ENHANCEMENTS.md`
- [ZIPWIKI_APPNOTE.md](./ZIPWIKI_APPNOTE.md), [CLI.md](./CLI.md), [MCP.md](./MCP.md)
- Golden fixtures: `apps/zipwiki/src/lib/archive/__fixtures__/`
