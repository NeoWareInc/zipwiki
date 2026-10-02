# Querying a `.zipwiki` Knowledge Archive

Commands for **inspecting, searching, reading, and extracting** an existing
`.zipwiki` (or legacy `.nzip`). These do **not** require a ZipWiki account.

Create / pack commands are out of scope here — see [CLI.md](CLI.md).
Agent tools that wrap the same library: [MCP.md](MCP.md), [ZIPACCESS.md](ZIPACCESS.md).

Default package when a path is omitted: `wiki.zipwiki` in the current directory.

```bash
pnpm zipwiki -- <command> …          # from this repo
# or, after install:
zipwiki <command> …
```

---

## Fast evaluation shortcuts

Use this order when you want to know what is inside an archive with minimal reading:

| Step | Command | What you learn |
| --- | --- | --- |
| 1 | `open` / `catalog` | Document count, OKF presence, one row per document (title, type, parsed?, original?, next-read hint) |
| 2 | `search "<query>"` | Ranked OKF hits + snippets + read hints (falls back to parsed text if OKF misses) |
| 3 | `read --okf <stem>` | Short concept card for one document |
| 4 | `read --parsed <name>` | Full parsed markdown only if the OKF card is not enough |
| 5 | `list -s` or `list -m` | Quick entry names, or AI-tree / META-INF paths only |
| 6 | `origin --parsed <name>` | Where the omitted original lives (`0x014F`); add `--fetch` to download + CRC-check |
| 7 | `extract` / `read --path` | Disk path or raw entry body when a tool needs a file |

Prefer **streamed `read`** over **`extract`**. Extract only when something on disk must open the file.

---

## Command reference

### `open` — document catalog (start here)

Pretty table: documents, OKF concept count, query skills, and per-document next-read hints.

Skills load automatically: built-in query skill + any `wiki/skills/*.md` in the package.
`--skills` **replaces** the built-in query skill (package skills still append).

```bash
zipwiki open ./knowledge/docs.zipwiki
zipwiki open ./knowledge/docs.zipwiki -j          # full JSON catalog (includes skills)
zipwiki open ./knowledge/docs.zipwiki --skills ./my-query.md
```

| Flag | Effect |
| --- | --- |
| `-j, --json` | Full catalog object (rows, counts, digests, skills) |
| `--skills <path>` | Replace built-in query skill with a file or directory of markdown |

Same output as `catalog` and `list --catalog`.

---

### `catalog` — alias of `open`

```bash
zipwiki catalog ./knowledge/docs.zipwiki
zipwiki catalog ./knowledge/docs.zipwiki -j
```

---

### `search` — find concepts / passages

OKF cards first (title, tags, description, type, body). Parsed markdown only when no OKF card matches.

```bash
zipwiki search ./knowledge/docs.zipwiki "homestead exemption"
zipwiki search ./knowledge/docs.zipwiki "lease" --limit 5
zipwiki search ./knowledge/docs.zipwiki "deed" -j
```

| Argument / flag | Effect |
| --- | --- |
| `<package>` | Path to `.zipwiki` |
| `<query>` | Search string |
| `--limit <n>` | Max hits (default 10) |
| `-j, --json` | Structured hits + `readHints` |

Each hit’s **NEXT** / `readHints` tell you the shortest follow-up (`read --okf …`, `read --parsed …`, `origin --fetch …`).

---

### `read` — stream bodies (no disk write)

Three selector styles:

```bash
# OKF concept by stem (basename without extension)
zipwiki read ./knowledge/docs.zipwiki --okf deed

# Parsed markdown for a document
zipwiki read ./knowledge/docs.zipwiki --parsed deed.pdf

# Any entry path(s)
zipwiki read -p ./knowledge/docs.zipwiki --path wiki/okf/index.md
zipwiki read -p ./knowledge/docs.zipwiki --path wiki/okf/deed.md --path wiki/parsed/deed.pdf.md
```

| Flag | Effect |
| --- | --- |
| `-p, --package <path>` | Archive path (default `wiki.zipwiki`) |
| `--okf <stem>` | OKF concept |
| `--parsed <name>` | Parsed document name (e.g. `deed.pdf`) |
| `--entry <path>` | Single archive member |
| `--path <path>` | Entry path (repeatable; comma-separated also ok) |
| `-j, --json` | JSON wrapper for `--okf` / `--parsed` / `--entry` |
| `--as-binary` | Force base64 for entry reads |
| `--origin` | Print Extra Field `0x014F` locator JSON on stderr |
| `--fetch-origin` | Download original and verify CRC-32 |
| `--origin-out <path>` | With `--fetch-origin`, write the original here |
| `--overwrite` | Allow overwriting origin dest |

Use **exactly one** of `--okf`, `--parsed`, or `--entry`. Or use `--path` / positional entry paths without those selectors.

Multi-entry stdout is separated by `===== ZIPWIKI <path> =====` markers.

---

### `read-manifest` — raw `META-INF/manifest.json`

```bash
zipwiki read-manifest -p ./knowledge/docs.zipwiki
```

| Flag | Effect |
| --- | --- |
| `-p, --package <path>` | Archive path (default `wiki.zipwiki`) |

No wrappers — machine-friendly discovery of `ai.primaries`, OKF flags, digests.

---

### `list` — ZIP member inventory

```bash
zipwiki list ./knowledge/docs.zipwiki              # Info-ZIP style listing
zipwiki list ./knowledge/docs.zipwiki -s           # names only
zipwiki list ./knowledge/docs.zipwiki -v           # method + sizes
zipwiki list ./knowledge/docs.zipwiki -m           # META-INF / wiki only
zipwiki list ./knowledge/docs.zipwiki -c           # same as open/catalog
zipwiki list ./knowledge/docs.zipwiki -j
```

| Flag | Effect |
| --- | --- |
| `-s, --short` | Names only |
| `-v, --verbose` | Method and sizes |
| `-m, --metadata` | Only META-INF / wiki (AI tree) paths |
| `-c, --catalog` | Document catalog (same as `open`) |
| `-j, --json` / `--format json` | JSON |
| `-q, --quiet` | Quiet |

---

### `origin` — original locator (`0x014F`)

For packages that omit original bytes (`--omit-original` at pack time).

```bash
zipwiki origin ./knowledge/docs.zipwiki --parsed deed.pdf
zipwiki origin ./knowledge/docs.zipwiki --parsed deed.pdf --fetch -o ./deed.pdf
zipwiki origin -p ./knowledge/docs.zipwiki --path wiki/parsed/deed.pdf.md --fetch
```

| Flag | Effect |
| --- | --- |
| `-p, --package <path>` | Archive path |
| `--parsed <name>` | Document / parse name |
| `--path <entry>` | Parsed or document entry path |
| `--fetch` | Download `originUri` and verify CRC-32 |
| `-o, --output <path>` | Write downloaded original |
| `--overwrite` | Overwrite dest |

Without `--fetch`, prints locator JSON (URI, CRC/size/mtime/sha256 when present).

---

### `extract` — write verified members to disk

```bash
# Full archive
zipwiki extract ./knowledge/docs.zipwiki ./out -o

# One entry (JSON result)
zipwiki extract ./knowledge/docs.zipwiki ./out --path wiki/parsed/deed.pdf.md -o

# Entry + download omitted original next to it
zipwiki extract ./knowledge/docs.zipwiki ./out \
  --path wiki/parsed/deed.pdf.md --fetch-origin -o
```

| Flag | Effect |
| --- | --- |
| `-o, --overwrite` | Overwrite existing files |
| `-n, --never` | Never overwrite |
| `-d, --exdir <dir>` | Extract directory |
| `-j, --junk-paths` | Flatten paths |
| `--path <entry>` | Extract one entry (repeatable); prints JSON |
| `--fetch-origin` | Also download `0x014F` originals and CRC-check |
| `-v` / `-q` | Verbose / quiet |

Inflate always checks ZIP CRC-32; Extra Field `0x014E` SHA-256 when present. Failures do not write.

Default extract dest when using the library/MCP without a path: `~/.zipwiki/extract/<package-stem>/`.

---

### `test` — integrity check

Inflate every entry and verify CRCs (no content dump).

```bash
zipwiki test ./knowledge/docs.zipwiki
zipwiki test ./knowledge/docs.zipwiki -v
```

---

## Suggested “what’s in this archive?” recipes

**Overview only**

```bash
zipwiki open ./knowledge/docs.zipwiki
```

**Names of every ZIP member**

```bash
zipwiki list ./knowledge/docs.zipwiki -s
```

**AI tree only (OKF + parsed + manifest)**

```bash
zipwiki list ./knowledge/docs.zipwiki -m
```

**Topic / keyword skim**

```bash
zipwiki search ./knowledge/docs.zipwiki "indemnification" --limit 10
```

**One document: concept then evidence**

```bash
zipwiki read ./knowledge/docs.zipwiki --okf property-deed
zipwiki read ./knowledge/docs.zipwiki --parsed property-deed.pdf
```

**OKF index (all concepts)**

```bash
zipwiki read -p ./knowledge/docs.zipwiki --path wiki/okf/index.md
```

**Recover an omitted original**

```bash
zipwiki origin ./knowledge/docs.zipwiki --parsed Ch_2025-001.pdf --fetch \
  -o ./Ch_2025-001.pdf --overwrite
```

---

## MCP equivalents (agents)

Same zipaccess library; tools are short verbs on the `zipwiki` MCP server:

| CLI | MCP tool(s) |
| --- | --- |
| `open` / `catalog` | `open` |
| `list` | `list` |
| `search` | `search`, `query` (query also returns capped bodies) |
| `read --okf` | `read_okf` / `read` |
| `read --parsed` | `read_parsed` / `read` |
| `read --path` / `--entry` | `read_entry` / `read` |
| `read-manifest` | `read_manifest` |
| `origin` | `origin` |
| `extract` | `extract` |

Pass `package` on each tool, or place `wiki.zipwiki` in the MCP cwd.

Open sequence for agents: **open → search → read_okf → read_parsed → origin (fetch) → extract only if needed**.

---

## Related

- Pack / update: [CLI.md](CLI.md)
- Library contract: [ZIPACCESS.md](ZIPACCESS.md)
- MCP tools: [MCP.md](MCP.md)
- Wire format: [ZIPWIKI_APPNOTE.md](ZIPWIKI_APPNOTE.md)
