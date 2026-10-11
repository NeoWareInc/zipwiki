# ZipWiki — AI-native archive features

**Audience:** website, pitch, and product docs that need a clear “why ZipWiki” story.  
**Not:** wire-format detail (see [doc/ZIPWIKI_APPNOTE.md](../doc/ZIPWIKI_APPNOTE.md), [doc/ZIPACCESS.md](../doc/ZIPACCESS.md)).

ZipWiki turns ordinary documents into a **portable `.zipwiki` package** that AI systems can **catalog, search, and read selectively**—without unpacking the whole archive or dumping every file into the model context.

---

## The problem with “just a ZIP”

Traditional archives are storage-first:

| Classic ZIP | What agents need |
| --- | --- |
| Opaque binary members | Skimmable descriptions and structure |
| Find by filename only | Find by meaning / topic / clause |
| Extract everything to use anything | Stream only the next useful slice |
| Originals always inflate the package | Compact extracted markdown + optional remote originals |

ZipWiki keeps ZIP as the **distribution unit**, then adds an **AI knowledge layer inside the same file**.

---

## What “parsed” means

In ZipWiki, **parsed** is not a vague processing step—it is the **text documentation extracted from each source file into markdown (`.md`)** and stored under `wiki/parsed/`.

| Source | Parsed result |
| --- | --- |
| PDF, Office, scan, EPUB, … | Layout-aware markdown: sections, tables, OCR text where needed |
| Path in the package | `wiki/parsed/<document>.md` (paired with the primary, or with an origin when the original is omitted) |

That markdown is **fast to stream, compact to store, and easy for models to read**—so agents consume evidence from `.md` first instead of chewing through binary PDFs or Word packages. The speedup is extreme: the model gets the words and structure it needs without paying for full-document binary decode or dumping every original into context.

Tool names like `read_parsed` mean “read that extracted markdown,” not “re-run a parser.”

---

## Core idea

**Pack once → extract compact AI-ready markdown + index inside the ZIP → agents open, search, and read only what they need.**

1. **Extract** source text into markdown (and assets when needed) under `wiki/parsed/`.
2. **Index / organize** with Open Knowledge Format (OKF) cards and an index under `wiki/okf/`.
3. **Summarize** the package with `ai.digest` so a catalog or UI can show what the archive *is*.
4. **Optionally omit** bulky originals, keeping Extra Field `0x014F` origin links + CRC for later fetch.
5. **Query in place** via CLI or MCP: `open` → `search` / `query` → `read_okf` → `read_parsed` (extract only when a filesystem path is required).

That is archival **optimized for understanding**, not only for backup.

---

## Differentiating capabilities (today)

### 1. Extracted markdown for AI (the parsed layer)

Every supported primary can ship **text documentation as markdown** beside (or instead of) the original:

- Words and structure from PDFs, Office, images (OCR), EPUB, and more—ready for LLMs without a separate conversion at query time  
- Tables and sections as markdown—compact and model-native  
- Stable pairing: `wiki/parsed/<document>.md` ↔ primary (or omitted primary + origin)

Agents and products consume **this extracted markdown first**. Models move dramatically faster when they read `.md` evidence instead of raw binary blobs.

### 2. Knowledge index inside the archive (OKF)

ZipWiki embeds an **Open Knowledge Format** tree in the package:

- Per-document **concept cards** (title, description, type, tags, key facts)  
- A package **`wiki/okf/index.md`** listing those concepts  
- Search that **prefers OKF**, then falls back to the extracted markdown when needed  

This is **indexing as content**, stored with the data—not a separate sidecar database that drifts out of sync when you copy the file.

### 3. Selective access (no full extract required)

The intended open sequence is deliberately narrow:

1. `open` — catalog + digest + next-read hints  
2. `search` / `query` — ranked hits with read hints  
3. `read_okf` — short concept cards before loading long markdown  
4. `read_parsed` / `read` — stream verified markdown (or other entry bodies), size-capped  
5. `origin` (`fetch`) — pull an omitted original and verify CRC when fidelity matters  
6. `extract` — only when something truly needs a path on disk  

MCP tools follow the same contract. The package stays the unit of truth on local disk or a mounted drive.

### 4. Compression through understanding

When originals are omitted (`sourceIncluded: false`):

- The portable package is often a **small fraction** of the source corpus (extracted markdown + manifest; originals omitted)  
- For bloated document files, that text knowledge typically compresses **upwards of 99%**—about **1/100th** the original document size  
- Origin URIs keep a path back to the authoritative file  
- Integrity remains ZIP CRC (and origin CRC when fetching)  

Example positioning from real packs: large PDF corpora shrink dramatically once the archive carries **extracted markdown** instead of every PDF byte—and models answer from that text far faster than from the binaries.

### 5. Package-level AI digest

`ai.digest` is a short, model- or index-derived summary of the whole package (document count + what it contains). Websites, dashboards, and agents can show **what’s in the box** before any deep read.

### 6. Agent-native surface

ZipWiki is built for the pack → open → search → read loop:

- Local CLI and **stdio MCP** (`open`, `search`, `query`, `read_*`, `origin`, `pack`, `okf_enrich`)  
- Hosted parse / AI OKF where credits apply; local LiteParse + host-LLM enrichment when offline or quota-limited  
- No requirement to upload the whole `.zipwiki` to use query tools on a machine that can see the file  

---

## What to emphasize on the website

Lead with outcomes, not ZIP trivia. Use this section on the home page (the Product page at `/`—not “Create / Query / Keep it local” pillars):

**Portable document memory with an embedded AI index**  
Not another cloud drive. Not generic RAG. ZipWiki keeps a portable archive as the distribution unit, then adds extracted markdown and an OKF index inside the same file.

1. **AI can navigate the archive** — Indexed concepts and package digests—not a blind file list.  
2. **Models read markdown, not binaries** — Parsed means extracted markdown text from each source—fast, compact, and easy for AI. Extreme speedup vs feeding PDFs or Office files to the model.  
3. **Read the slice, not the dump** — OKF cards first, then compact extracted markdown, then originals only if needed.  
4. **One portable file** — Share, sync, and back up like a ZIP. Open with ZipWiki, MCP, or the CLI.  
5. **Smaller when it matters** — Omit bulky originals; keep origin links and checksums. Text knowledge from bloated documents often shrinks upwards of 99%—about 1/100th the original size.  
6. **Evidence stays grounded** — Answers cite the OKF index and extracted markdown inside the package—not a hosted black box.

Reserve `wiki/` path details for How it works. The Product page is the front page (`/`). Primary nav: Product (`/`) and How it works, plus MCP, CLI, Download, Pricing, and Roadmap.

---

## Product surfaces

The same `.zipwiki` contract shows up in three places: agents (MCP), developers and power users (CLI), and humans on the web (portal + marketing site). Message them as **one knowledge file, three ways in**—not three separate products.

### MCP server / plugin

**Job:** Let coding agents use a local `.zipwiki` the way they use tools—without uploading the archive or exploding it onto disk.

| | |
| --- | --- |
| **Transport (v1)** | Stdio MCP (`zipwiki-mcp`) on the machine that holds the file (Cursor, Claude Code/Desktop, etc.) |
| **Config** | Project or user `mcp.json` pointing at the server binary / `node …/stdio.js` |
| **Default package** | Tool arg `package`, or `wiki.zipwiki` in the server cwd |

**Tools map to the open sequence:** `open`, `list`, `search`, `query`, `ask`, `read_okf_index`, `read_okf`, `read_parsed`, `read_entry`, `read`, `read_manifest`, `origin`, `extract`, plus create/update: `pack`, `update`, `okf_enrich`.

**Why it matters for positioning**

- Agents **search the index first**, then pull capped slices of extracted markdown—context stays small and models stay fast.  
- **Pack and enrich** stay on-device; optional hosted parse/OKF/ask when the user is logged in and has credits.  
- Fits the “plugin” story: install MCP + CLI skills once; every chat can open the same portable memory.

Hosted HTTP `/mcp` is a later path for agents with no local filesystem—not the v1 create/query story.

### CLI (`zipwiki`)

**Job:** Create and query packages from a terminal—the same engine MCP uses.

| Mode | Commands (representative) |
| --- | --- |
| **Create** | `pack`, `update`, stage/phase workflows; LiteParse locally; optional LlamaParse / AI OKF |
| **Query** | `open` / `catalog`, `search`, `query`, `read`, `read-manifest`, `origin`, `extract`, `test` |
| **Account** | `login` / settings sync to `~/.zipwiki` for hosted credits and pack preferences |

**Why it matters for positioning**

- **Local-first:** pack and query without an account (LiteParse + skip or later `okf_enrich`).  
- **Scriptable:** CI, sample corpora, and power users get the full selective-read loop.  
- **Parity with MCP:** anything the agent can do, the CLI can demonstrate and automate.  
- Future **Rust CLI** (Phase 4) is a faster native binary for supported OSes; TypeScript remains the everywhere runtime for MCP and web-adjacent hosts.

### Web portal & site

**Job:** Explain the product, convert waitlist/signups, and give account holders a place for settings, usage, and human-friendly query—not replace the portable file.

| Surface | Role |
| --- | --- |
| **Marketing (zipwiki.ai)** | Story pages: product, how it works, pricing, roadmap—lead with AI-native archive outcomes above |
| **Auth & plans** | Login, billing, credits for hosted parse / OKF / ask |
| **Dashboard** | Pack/parse/OKF preferences, API/usage visibility, account settings synced with the CLI |
| **Query UX** | Ask questions over a package the way the site Query flow does (local passages + optional hosted answer)—complementary to MCP, not a substitute for agent tools |

**Why it matters for positioning**

- The portal is **control plane + human Q&A**, not “upload everything to our cloud forever.”  
- Credits buy **hosted intelligence** (parse/OKF/ask); the `.zipwiki` remains yours to copy and open offline.  
- Website copy should send technical users to **CLI + MCP**, and buyers to **portable memory + selective AI access**.

### How the three fit together

```text
Documents ──pack (CLI / MCP)──► .zipwiki
                                   │
          ┌────────────────────────┼────────────────────────┐
          ▼                        ▼                        ▼
     MCP / agents              CLI scripts              Web portal
   search → read_*           open / search / read     digest, settings,
   pack / okf_enrich         origin / extract         Query / credits
```

Same file, same open sequence, different operators.

---

## Future capabilities (direction, not commitments)

As models and codecs improve, ZipWiki’s shape is ready for deeper AI-native archival:

| Direction | Why it fits |
| --- | --- |
| **Richer indexing** | Multi-level OKF (entities, citations, cross-doc links), better digests, topic graphs still stored *inside* the package |
| **Smarter search** | Hybrid lexical + embedding indexes shipped as optional members, or rebuilt on open without re-parsing sources |
| **AI-aware compression** | Semantic dedup, shared phrase dictionaries across extracted markdown, learned codecs for markdown/OKF payloads while keeping ZIP interoperability |
| **Adaptive fidelity** | Tiered packages: index-only → markdown+index → markdown+index+originals, chosen per corpus and bandwidth |
| **Continuous enrichment** | `okf_enrich` / update pipelines that refresh cards when models improve, without rewriting every primary |
| **Verified selective sync** | Fetch only origin members that search proved necessary; keep CRC/URI contracts |

These stay aligned with the same promise: **the archive remains self-describing for AI**, and consumers never need a private server just to *understand* what they already hold.

---

## One-line pitch

**ZipWiki is a ZIP you can think with—source text extracted to compact markdown for models, indexed for search, readable by the slice, portable as a single file.**

---

## Spec pointers

| Topic | Document |
| --- | --- |
| Package layout, omit-original, digest | [doc/ZIPWIKI_APPNOTE.md](../doc/ZIPWIKI_APPNOTE.md) |
| Open / search / read contract | [doc/ZIPACCESS.md](../doc/ZIPACCESS.md) |
| OKF markdown knowledge | [doc/OKF_SPEC.md](../doc/OKF_SPEC.md) |
| Agent MCP tools | [doc/MCP.md](../doc/MCP.md) |
| CLI pack & query | [doc/CLI.md](../doc/CLI.md) |
| Phases (plugin, portal, Rust CLI) | [PHASES.md](../PHASES.md) |
