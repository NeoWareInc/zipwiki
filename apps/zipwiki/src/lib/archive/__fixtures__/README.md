# Golden `.zipwiki` fixtures

Small archives written by `writeZipBuffer` in `../nzip.ts`, which delegates to
NeoZipKit `buildZipBufferSync` (`../neozipkit-writer.ts`). They were first
captured from the pre-kit ZipWiki writer; the kit writer passed
`compareArchives` (`../golden-compare.ts`) against those bytes unchanged, then
the fixtures were regenerated with the kit as the default path. The only byte
difference is the local/central "version needed" and "version made by" words
(kit: 30 for zstd, 10 for store/deflate; old writer: 63 / 20).

| File | Contents |
| --- | --- |
| `minimal.zipwiki` | manifest, `wiki/parsed/doc.txt.md`, `doc.txt` (zstd), `sample.pdf` (stored) |
| `with-origin.zipwiki` | as above, plus Extra Field `0x014F` on parse members |
| `omit-original.zipwiki` | `sample.pdf` original omitted; its parse member carries `0x014F` |

**Do not hand-edit** the `.zipwiki` files. Regenerate from the repo root:

```sh
pnpm --filter @zipwiki/zipwiki exec tsx src/lib/archive/__fixtures__/generate.ts
```

The generator fixes the manifest `createdAt` and every entry's mtime, so output
is stable across runs and timezones. Regenerate only when the writer
intentionally changes, and review the diff in `golden-compare.test.ts`.

Byte equality also depends on the Node zstd encoder. If a Node upgrade changes
compressed bytes, regenerate; decoded payloads, CRCs, and manifests must not
change.
