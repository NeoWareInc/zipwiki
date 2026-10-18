# Search enhancements (proposals)

| | |
| :---- | :---- |
| **Document date** | 2026-10-18 |
| **Status** | Internal design note — not a product commitment |
| **Audience** | People planning retrieval work on ZipWiki search / OKF |
| **Prompt** | Review of [The AI Second Brain Stack](https://medium.com/@pankaj_pandey/the-ai-second-brain-stack-how-to-build-a-knowledge-layer-agents-can-actually-trust-e2bc6c9876ff) (Pankaj Pandey, Medium, 9 Oct 2026) |

Three proposed search upgrades. They stay inside the existing portable-package
model: derived layers remain rebuildable, originals stay immutable, and agent
tools stay narrow (`open` → `search` / `query` → `read_*`).

Related: [FEATURES.md](./FEATURES.md) · [QUERY.md](./QUERY.md) ·
[OKF_SPEC.md](./OKF_SPEC.md) · [OKF_ZIPWIKI_VS_SPEC.md](./OKF_ZIPWIKI_VS_SPEC.md) ·
[ZIPACCESS.md](./ZIPACCESS.md)

---

## How search works today

Verified against
[`apps/zipwiki/src/lib/access/search.ts`](../apps/zipwiki/src/lib/access/search.ts)
and
[`apps/zipwiki/src/lib/okf/search-index.ts`](../apps/zipwiki/src/lib/okf/search-index.ts)
(October 2026). The website Query page
([`apps/web/src/lib/nzip/query.ts`](../apps/web/src/lib/nzip/query.ts))
duplicates the same scorer.

**Ranking is lexical substring-hit counting.** There is no BM25, IDF, field-length
normalization, whole-word matching, embedding index, or reranker.

1. The query is lowercased and split on non-alphanumerics.
   Tokens shorter than two characters are dropped (`tokenizeSearchQuery`).
2. Each token scores a field if the field text *contains* that substring
   (`hay.includes(t)`). So `law` also matches `laws` and `flawed`.
3. Hits are the sum of those per-token field weights, then sorted by score
   (path as a tie-break). Limit defaults to 10 (max 25).

OKF concept-card weights (when the card markdown is scored):

| Field | Weight |
| --- | ---: |
| `title` | 4 |
| `tags` | 3 |
| `description` | 2 |
| `type` | 1.5 |
| body (`# Key facts` / `# Contents`) | 0.5 |

**Default scope is OKF cards.** Parsed markdown is a fallback when no card
matches (`evidence: true`), or when the caller asks for `in=parsed` /
`in=okf,parsed`. The fallback scans at most 80 `wiki/parsed/*.md` files, the
first 64,000 characters of each, weight 1, then multiplies the score by 0.6.

New packages do **not** write `wiki/search.json`. If an older archive still has
that leftover catalog, search may rank its rows first with a slightly different
weight set (`title` 4, `tags` 3, `description` 2, `type` 1.5, `path` 1 — no
body). The next pack/update deletes `search.json`. Without it, `wiki/okf/index.md`
is only a *candidate filter* (title 4, description 2, path 1); surviving rows
are rescored from the concept markdown.

Search hits return `score`, `kind`, `path`, `title`, `snippet`, `sources`
(resource paths), and `readHints`. They do **not** return lifecycle or trust
fields.

This is enough for keyword lookup on short cards. It is not “search by meaning”
in the embedding sense, and it over-rewards long fields and common substrings.

---

## Fit with the article

The Second Brain piece argues for a knowledge layer agents can trust:
immutable sources, derived indexes that can be rebuilt, lexical retrieval
before vectors, and a small tool surface. ZipWiki already matches that core.

| Article principle | ZipWiki today |
| --- | --- |
| Immutable originals | Primaries (or Extra Field `0x014F` origin + CRC when omitted) |
| Rebuildable derived layer | `wiki/parsed/` + `wiki/okf/` restamped on pack / update / `okf_enrich` |
| Lexical-first retrieval | The scorer above — lexical, but crude |
| Narrow agent tools | MCP / CLI: `open`, `search`, `query`, `read_*`, `origin` |
| Hybrid lexical + embeddings | Listed as a future direction in [FEATURES.md](./FEATURES.md), not shipped |

The gaps below are where the article still applies: better lexical ranking
with a retrieval eval before vectors; OKF trust/freshness fields that search
can expose; and lightweight cross-document structure without a graph database.

zipwiki.ai currently says agents need to “search by meaning”
([`apps/web/src/lib/marketing-copy.ts`](../apps/web/src/lib/marketing-copy.ts),
`CLASSIC_ZIP_PROBLEM`). [FEATURES.md](./FEATURES.md) uses the same phrase
(“Find by meaning / topic / clause”). The marketing OKF blurb also says OKF
“is not a vector database.” Proposal 1 either earns the “meaning” claim or
the copy should change.

---

## 1. Stronger lexical ranking before adding vectors

### Problem / motivation

Substring counting treats every token as equally rare and every field as a bag
of characters. Long descriptions and common words (`florida`, `chapter`,
`patient`) can outrank a precise title hit. Partial-word matches add noise.
There is no retrieval eval separate from `ask` / hosted answer generation, so
we cannot tell a ranking miss from a generation miss.

[FEATURES.md](./FEATURES.md) already lists **hybrid lexical + embedding
indexes** as a future direction. Adding vectors first would not tell us
whether the current scorer is the bottleneck.

### Proposal

Replace per-field substring-hit counting with per-field **BM25** (IDF, term
frequency with saturation, field-length normalization) and **whole-word /
token** matching on the same fields and weights we already use.

Build a small **retrieval eval set**: query → expected document (or concept
path) pairs from the sample packs
[`knowledge/florida-laws-2025.zipwiki`](../knowledge/florida-laws-2025.zipwiki),
[`knowledge/charles-dickens.zipwiki`](../knowledge/charles-dickens.zipwiki),
and [`knowledge/medical-pdfs.zipwiki`](../knowledge/medical-pdfs.zipwiki).
Score ranking only (`nDCG@k`, `MRR`, `recall@k`) — not answer prose.

Add embeddings (optional package members, or rebuilt on open, as FEATURES
sketches) **only after** the eval shows semantic misses that BM25 cannot
fix: paraphrases, synonyms, “what is this corpus about?” questions with no
shared tokens.

Until then, either justify “search by meaning” as “search the semantic fields
an LLM wrote at pack time” or change the marketing/FEATURES wording to
“search the index” / “search by topic and clause.”

### Implementation notes

- Shared tokenizer + scorer live in
  [`apps/zipwiki/src/lib/okf/search-index.ts`](../apps/zipwiki/src/lib/okf/search-index.ts)
  (`tokenizeSearchQuery`, `scoreWikiSearchDoc`) and
  [`apps/zipwiki/src/lib/access/search.ts`](../apps/zipwiki/src/lib/access/search.ts)
  (`scoreField`, `hitFromOkfMarkdown`). Keep one implementation; the web
  Query page currently copies the logic in
  [`apps/web/src/lib/nzip/query.ts`](../apps/web/src/lib/nzip/query.ts).
- IDF is cheap at pack scale (253 Florida cards, 67 Dickens, ~60 medical).
  Compute document frequencies over the in-memory card set when the package
  is opened; no need to revive `wiki/search.json`.
- Tokenize query and fields the same way (whole tokens, not `includes`).
  Keep the existing field weights as BM25 field boosts unless the eval says
  otherwise.
- Tests that pin today’s behavior:
  [`apps/zipwiki/src/lib/access/access.test.ts`](../apps/zipwiki/src/lib/access/access.test.ts)
  (`searchPackage ranks OKF lease hit`, parsed-fallback `conveying`).
- Eval fixtures can live under `knowledge/` or a new `evals/retrieval/`
  tree and call `searchPackage` only — not `ask`.

### How to measure success

- Eval queries where BM25 should beat substring counting (common-word
  queries, short exact titles, legislative chapter numbers, character names).
- Report `nDCG@10`, `MRR`, `recall@5` on the three sample packs, versus the
  current scorer as baseline.
- Count residual failures that look semantic (no shared tokens with the
  expected card). Only that count justifies embeddings.
- Re-read zipwiki.ai / FEATURES copy after the numbers land.

### Open questions

- One BM25 parameter set for all OKF profiles (`auto`, `book`,
  `legislation`, `invoice`), or per-profile tunings?
- Should parsed-markdown fallback use the same BM25 (with a lower field
  boost) instead of `weight 1 × 0.6`?
- Phrase queries vs. bag-of-tokens (`"homestead exemption"` as a unit)?
- Do we keep leftover `wiki/search.json` scoring for old packs, or always
  rescan cards?

---

## 2. Trust and freshness fields search can use

### Problem / motivation

Agents cannot tell a current card from a stale or deprecated one. Search
returns a snippet and source paths, not currency. Medical and session-law
packs go out of date; Dickens does not. The model then has to guess.

OKF v0.2 already defines the fields. ZipWiki’s producer profile mostly
leaves them blank.

| Field | Spec | ZipWiki today |
| --- | --- | --- |
| `generated.at` | ISO 8601, when the *card* last changed | **Always emitted** (code-owned) |
| `status` | `draft` \| `stable` \| `deprecated` (absent ⇒ stable) | Not emitted. Parser accepts and validates. Repair **deletes** it |
| `stale_after` | `YYYY-MM-DD`; stale when `today >= stale_after` | Not emitted. Parser accepts a string. Repair **deletes** it |
| `verified` | List or mapping of `{ by, at }` → trust tier | Never emitted; LLM is told not to invent it. No typed parser field |
| `sources[].last_modified` | Source recency (`YYYY-MM-DD`), distinct from `generated.at` | Not emitted. Sources parser keeps `resource` / `id` / `description` only |

See [OKF_SPEC.md](./OKF_SPEC.md) §5 and
[OKF_ZIPWIKI_VS_SPEC.md](./OKF_ZIPWIKI_VS_SPEC.md) §4.3–§4.4.

### Proposal

Write the spec-permitted fields on concept cards, then let search use them:

- **`stale_after`** — pack or profile sets an absolute date when the
  source class expires (session laws, clinical notes). Optional; omit for
  stable literature.
- **`status`** — `deprecated` when a later chapter supersedes one, or a
  card is kept only for history. Absent still means `stable`.
- **Source version / captured-at** — prefer `sources[].last_modified` for
  the primary’s own date, and/or a captured-at stamp from origin Extra
  Field `0x014F` `mtime` / pack time. Do not overload `generated.at`; that
  is when the *card* was written, and we already emit it.
- **`verified`** (optional) — only when a real actor confirmed the card
  (`human:…` or `process:…`). Absence stays **unverified**, which is valid
  OKF.

Search should **down-rank** stale (`today >= stale_after`) and
`status: deprecated` cards rather than hide them, and **return the fields
on each hit** so agents can judge currency without a second read.

### Implementation notes

- Emitter:
  [`apps/zipwiki/src/lib/okf/yaml.ts`](../apps/zipwiki/src/lib/okf/yaml.ts)
  (`buildDocumentFrontmatter`) and
  [`apps/zipwiki/src/lib/okf/generate.ts`](../apps/zipwiki/src/lib/okf/generate.ts)
  (LLM prompt currently forbids inventing `verified`, `status`,
  `stale_after`). Code should own these stamps, same as `generated` /
  `sources`.
- Parser / repair:
  [`apps/zipwiki/src/lib/okf/frontmatter.ts`](../apps/zipwiki/src/lib/okf/frontmatter.ts).
  `OkfFrontmatterFields` already has `status` and `stale_after`.
  `repairOkfFrontmatter` deletes both today — stop doing that once we emit
  them. Add typed `verified` and `sources[].last_modified` if we persist
  them.
- Rank + payload:
  [`apps/zipwiki/src/lib/access/search.ts`](../apps/zipwiki/src/lib/access/search.ts)
  (`SearchHit`, `hitFromOkfMarkdown`). Mirror any hit-shape change in
  [`apps/web/src/lib/nzip/query.ts`](../apps/web/src/lib/nzip/query.ts) and
  the MCP/CLI JSON (`-j`).
- Profile hooks: legislation packs (`--okf-profile legislation`, Florida
  2025) are the natural first `stale_after` / superseded-`status` case;
  medical PDFs for captured-at / `verified`; Dickens can omit freshness.

### How to measure success

- Pack a fixture card with `stale_after` in the past and
  `status: deprecated`; the same query still returns it, below a fresh
  sibling, with those fields present on the JSON hit.
- Absent fields do not change today’s ranking (backward compatible).
- `zipwiki search … -j` / MCP `search` include `status`, `stale_after`,
  `generated.at`, and trust tier (or raw `verified`) when set.
- Repair no longer strips valid `status` / `stale_after` from an otherwise
  well-formed card.

### Open questions

- Who sets `stale_after` — pack flag, per-profile default, origin `mtime`
  plus a TTL, or the enriching model (with code still owning the stamp)?
- Down-rank multiplier vs. a hard score floor? Show stale hits at all
  when a fresh card exists?
- Is `verified` worth emitting in v1 if the only actor is
  `process:zipwiki-okf-fallback` (that is just `generated` again)?
- Should `open` / catalog rows grow the same fields, or only `search` /
  `query` hits?

---

## 3. Cross-document links as a lightweight graph

### Problem / motivation

Each concept card describes one primary. Shared tags already produce a
capped set of [`wiki/okf/topics/{tag}.md`](../apps/zipwiki/src/lib/okf/render.ts)
pages (`TOPIC_PAGE_CAP` = 8; the file-type tag `pdf` is skipped). That is
grouping, not a graph: ZipWiki does **not** generate cross-concept markdown
links ([OKF_ZIPWIKI_VS_SPEC.md](./OKF_ZIPWIKI_VS_SPEC.md) §3.1). There are
no entity cards. `search` cannot answer “how do these documents relate?” or
“what is this whole pack about?” except by ranking individual cards.

[FEATURES.md](./FEATURES.md) already points at **multi-level OKF**
(entities, citations, cross-doc links) and topic graphs stored *inside*
the package. Microsoft GraphRAG’s local / global split is a useful analogy:
neighborhood questions vs. corpus-wide questions. We do not need a graph
database to get a cheap version of that.

### Proposal

1. **Links as the graph.** When enriching, write OKF §6 markdown links
   between related document cards and (new) entity cards — people, works,
   statutes, jurisdictions — using bundle-relative `/…` hrefs. Topic pages
   can keep listing members; entity cards hold the identity and point at
   the documents. Surrounding prose names the relationship (OKF does not
   type the edge).
2. **A corpus-wide search mode** for questions that span many documents.
   Read `ai.digest` (already on `open` / catalog via
   [`apps/zipwiki/src/lib/access/catalog.ts`](../apps/zipwiki/src/lib/access/catalog.ts))
   and `wiki/okf/index.md` (`# Files` + `# Topics`) before walking every
   card. Local mode stays “this query → ranked cards → `read_okf` /
   `read_parsed`.” Global mode is “this query → digest + index (+ topic
   pages) → a short map of the corpus.” Same ZIP, no sidecar graph store.

`search` / `query` can grow a `mode=local|global` (or MCP keeps `search`
local and a thin `overview` uses digest + index). Agents already have
`open` and `read` on `wiki/okf/index.md`; the gap is making that a first-
class retrieval path with read hints.

### Implementation notes

- Link emission: OKF enrich in
  [`apps/zipwiki/src/lib/okf/generate.ts`](../apps/zipwiki/src/lib/okf/generate.ts)
  / render in
  [`apps/zipwiki/src/lib/okf/render.ts`](../apps/zipwiki/src/lib/okf/render.ts).
  Spec form: [OKF_SPEC.md](./OKF_SPEC.md) §6. Consumers must tolerate
  broken links.
- Topic pages already rebuilt in
  [`apps/zipwiki/src/lib/okf/bundle.ts`](../apps/zipwiki/src/lib/okf/bundle.ts).
  Entity cards would be extra concept files (not `index.md` / `log.md`),
  listed from `index.md` or a new `# Entities` section.
- Digest synthesis:
  [`apps/zipwiki/src/lib/okf/package-digest.ts`](../apps/zipwiki/src/lib/okf/package-digest.ts)
  (local join of descriptions) and
  [`apps/zipwiki/src/lib/okf/package-digest-ai.ts`](../apps/zipwiki/src/lib/okf/package-digest-ai.ts)
  (one model call, capped). Search does not read the digest today.
- `parseIndexHrefs` in `search.ts` already parses index bullets. Global
  mode can score the digest + index (+ topics) as a single hit with
  `readHints` pointing at `read --path wiki/okf/index.md` and selected
  topic/entity cards.
- Sample-pack fits: Dickens (works ↔ characters), Florida (chapter ↔
  topic / jurisdiction), medical (patient ↔ encounter notes).

### How to measure success

- Enrichment on a small fixture pack emits at least one resolvable
  cross-card link; `read_okf` shows it; a broken href does not fail
  validate.
- Global-mode queries such as “what is in this archive?” and “which
  documents concern homestead / hospice / *Bleak House*?” return digest +
  index (and topic) hits **without** scanning every parsed file.
- Local-mode ranking on the proposal 1 eval set does not regress.
- Package size stays markdown-only — no graph DB, no required embedding
  member.

### Open questions

- Are entity cards first-class OKF concepts (`type: Entity` or a
  document-oriented type), or only topic pages with richer bodies?
- Does global mode become `search --mode global`, a new `overview`
  command, or just documented use of `open` + `read` on `index.md`?
- How many auto-links per card before the skim becomes noise?
- Do we type edges in prose only (OKF §6), or add a ZipWiki-owned
  frontmatter list later?

---

## References

- Pankaj Pandey, [The AI Second Brain Stack: How to Build a Knowledge Layer Agents Can Actually Trust](https://medium.com/@pankaj_pandey/the-ai-second-brain-stack-how-to-build-a-knowledge-layer-agents-can-actually-trust-e2bc6c9876ff), Medium, 9 October 2026.
- [apps/zipwiki/src/lib/access/search.ts](https://github.com/NeoWareInc/zipwiki/blob/main/apps/zipwiki/src/lib/access/search.ts) — package search, field weights, parsed fallback.
- [apps/zipwiki/src/lib/okf/search-index.ts](https://github.com/NeoWareInc/zipwiki/blob/main/apps/zipwiki/src/lib/okf/search-index.ts) — tokenizer and leftover `wiki/search.json` scorer.
- [apps/web/src/lib/nzip/query.ts](https://github.com/NeoWareInc/zipwiki/blob/main/apps/web/src/lib/nzip/query.ts) — website Query page (same lexical ranking).
- [apps/web/src/lib/marketing-copy.ts](https://github.com/NeoWareInc/zipwiki/blob/main/apps/web/src/lib/marketing-copy.ts) — zipwiki.ai “search by meaning” copy.
- [apps/zipwiki/src/lib/okf/frontmatter.ts](https://github.com/NeoWareInc/zipwiki/blob/main/apps/zipwiki/src/lib/okf/frontmatter.ts) — OKF parse / validate / repair (`status`, `stale_after` deleted on repair).
- [apps/zipwiki/src/lib/okf/generate.ts](https://github.com/NeoWareInc/zipwiki/blob/main/apps/zipwiki/src/lib/okf/generate.ts) — enrich prompt; code-owned stamps.
- [apps/zipwiki/src/lib/okf/yaml.ts](https://github.com/NeoWareInc/zipwiki/blob/main/apps/zipwiki/src/lib/okf/yaml.ts) — frontmatter emitter (`generated.at`, no lifecycle fields).
- [apps/zipwiki/src/lib/okf/render.ts](https://github.com/NeoWareInc/zipwiki/blob/main/apps/zipwiki/src/lib/okf/render.ts) — `index.md` and topic pages.
- [apps/zipwiki/src/lib/okf/package-digest.ts](https://github.com/NeoWareInc/zipwiki/blob/main/apps/zipwiki/src/lib/okf/package-digest.ts) — `ai.digest` from OKF descriptions.
- [apps/zipwiki/src/lib/access/catalog.ts](https://github.com/NeoWareInc/zipwiki/blob/main/apps/zipwiki/src/lib/access/catalog.ts) — `open` catalog exposes `digest`.
- [doc/FEATURES.md](https://github.com/NeoWareInc/zipwiki/blob/main/doc/FEATURES.md) — hybrid lexical + embedding indexes; multi-level OKF.
- [doc/OKF_SPEC.md](https://github.com/NeoWareInc/zipwiki/blob/main/doc/OKF_SPEC.md) — `verified`, `status`, `stale_after`, `sources[].last_modified`, §6 links.
- [doc/OKF_ZIPWIKI_VS_SPEC.md](https://github.com/NeoWareInc/zipwiki/blob/main/doc/OKF_ZIPWIKI_VS_SPEC.md) — what ZipWiki emits today.
- [doc/QUERY.md](https://github.com/NeoWareInc/zipwiki/blob/main/doc/QUERY.md) — CLI search / query / ask.
- [knowledge/README.md](https://github.com/NeoWareInc/zipwiki/blob/main/knowledge/README.md) — Florida laws, Dickens, medical PDF sample packs.
