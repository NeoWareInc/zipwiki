# CTXPKG vs ZipWiki — strategic comparison

| | |
| :---- | :---- |
| **Document date** | 2026-09-23 |
| **CTXPKG** | [ctxpkg.org](https://ctxpkg.org/) — open standard for portable agent context (v2 draft) |
| **ZipWiki** | This product — portable document memory in `.zipwiki` packages |
| **Status** | Internal strategy note (not a product commitment) |

This note compares [CTXPKG](https://ctxpkg.org/) to ZipWiki’s current capabilities and phases, flags ideas that could help **today’s** product, and recommends whether CTXPKG belongs inside ZipWiki or as a separate future effort.

Related ZipWiki docs: [ZIPWIKI_APPNOTE.md](./ZIPWIKI_APPNOTE.md), [OKF_SPEC.md](./OKF_SPEC.md), [ZIPACCESS.md](./ZIPACCESS.md), [PHASES.md](../PHASES.md).

---

## 1. Executive verdict

**Complementary layers — not the same product.**

| | ZipWiki | CTXPKG |
| :---- | :---- | :---- |
| **Core question** | “What do these *files* say, and can my agent find evidence?” | “What is *true* about this system after sessions — and can I verify it?” |
| **Unit of value** | Document corpus (PDFs, Office, etc.) → parsed text + OKF skims | Session-produced knowledge graph (facts, decisions, gotchas + edges) |
| **File** | `.zipwiki` (ZIP / NeoZip profile) | `.ctxpkg` (JSON: manifest + `context_graph`) |
| **Primary job** | Pack, catalog, search, read real documents for agents | Seal, merge, and distribute declarative agent context |

Do **not** replace `.zipwiki` with `.ctxpkg` as ZipWiki’s wire format. Treat CTXPKG as inspiration for integrity/provenance UX, and optionally later as an **export/bridge** or a **separate NeoWare project** if session-graph + registry becomes its own product.

---

## 2. Capability matrix

| Dimension | ZipWiki (today / planned) | CTXPKG (v2 draft) |
| :---- | :---- | :---- |
| **Package shape** | ZIP archive: `META-INF/manifest.json`, `wiki/parsed/`, optional `wiki/okf/`, optional origin Extra Field `0x014F` | Single readable JSON file: `manifest` + `content.context_graph` |
| **Knowledge model** | Document-centric: full (or best-effort) parses + OKF markdown skims (YAML frontmatter). Search prefers OKF, then parsed text | Graph-native: typed nodes (`fact`, `gotcha`, …) and edges (`elaborates`, …). No full document bodies as the primary payload |
| **Integrity** | ZIP CRC-32; NeoZip Extra Fields / SHA-256 when present; verified reads in zipaccess | Cryptographic seals (content hashes + signature). Failed seal → reject package before load |
| **Signing** | NeoZip L1–L3 / sidecars (optional, integrity-oriented); not ZipWiki’s main marketing story | Normative ed25519-style package signatures in the standard |
| **Merge** | `zipwiki update` (add/del/update files in one archive). No formal “disagreement” graph | Deterministic multi-package merge; conflicts recorded openly, not silently overwritten |
| **Distribution** | File copy, backup, unzip; product portal / API later. No public package registry | Open registry protocol; public registry (ctxpkg.com) with signed publish, secret scanning, verified publishers |
| **Agent access** | MCP + CLI: pack → open → search → read → origin ([AGENTS.md](../AGENTS.md)) | Tools that speak CTXPKG; sits beside MCP/skills as the “declarative knowledge” layer |
| **Provenance** | Origin URIs on entries; OKF producer profile; parse engine metadata | Manifest `provenance` (tool + version); seals as trust gate |
| **Conformance** | NeoZip levels + ZipWiki AI conventions; OKF v0.2 as open markdown knowledge | Three levels (L1 quick implement → L3 trust strengthen/fade over time) |
| **Product surface** | Plugin, pack/query engine, hosted parse/OKF credits, dashboard | Spec + lean-ctx reference + registry + `@ctxpkg/verify` — a standard, not a document SaaS |

Stack framing from CTXPKG (useful for ZipWiki positioning):

| Layer | Standard | Question |
| :---- | :---- | :---- |
| Tool invocation | MCP | How do I call this tool? |
| Procedural know-how | Agent Skills | How do I perform this task? |
| Agent communication | A2A | How do agents talk? |
| Declarative knowledge | CTXPKG | What is true — and can I verify it? |
| **Document evidence** | **ZipWiki** | **What did the source files say, with paths and CRC?** |

ZipWiki fills a fifth row CTXPKG’s table does not claim: **grounded document evidence in a portable archive**.

---

## 3. Overlap

Both care about:

1. **Surviving the session** — knowledge that is not trapped in chat history.
2. **A portable file** agents (and humans) can keep, copy, and open elsewhere.
3. **Discovery before dump** — ZipWiki: OKF before full parse; CTXPKG: structured nodes before unstructured prose.
4. **Integrity** — ZipWiki: CRC / optional NeoZip digests; CTXPKG: seals as a hard gate.
5. **Sitting next to MCP** — neither replaces tool protocols; both feed agents with durable context.

Marketing resonance is real: “give your AI a portable memory” and “agent knowledge deserves a file format” are cousins. The **payload and trust model** diverge sharply (documents vs session graph; ZIP corpus vs signed JSON graph).

---

## 4. Ideas for the current ZipWiki version

These are **incremental** improvements inspired by CTXPKG — compatible with today’s `.zipwiki` + OKF direction. They do **not** require adopting CTXPKG as the package format.

### Nice for current product (near-term)

| Idea | Why | Notes |
| :---- | :---- | :---- |
| **Stronger package attestation UX** | CTXPKG makes “verify before load” the default story | Surface zipaccess verify results more loudly (CRC / SHA / origin fetch). Optional NeoZip signing where already in the parent format — product copy can stress “sealed archive” without a new extension |
| **Richer OKF provenance / trust fields** | OKF v0.2 already aims at provenance, trust, freshness, lifecycle | Align ZipWiki OKF producer with those frontmatter fields so skims answer “who wrote this and from what?” — closer to CTXPKG’s trust questions without a graph rewrite |
| **Optional “session lessons” as OKF-like markdown** | Agents learn gotchas during pack/query that aren’t in the PDF | Allow a small `wiki/okf/` or sidecar set for *agent-authored* notes (facts/gotchas), still searchable like OKF — **not** a full edge graph |
| **Light share / publish path** | CTXPKG’s registry shows demand for named, installable context | If product needs share/backup: signed upload of `.zipwiki` to user storage or a private catalog — not a public open registry in v1 |
| **Clearer positioning next to MCP/skills** | CTXPKG’s layer table is crisp | Keep marketing: Skills = how; MCP = tools; ZipWiki = evidence from your files |

### Explicitly **not** near-term for ZipWiki

- Replacing ZIP with JSON graph packages  
- Deterministic multi-graph merge with conflict edges as the primary update model  
- Public conformance levels L1–L3 as ZipWiki’s shipping format  
- Depending on ctxpkg.com as distribution  

---

## 5. Future direction (separate or bridge)

```text
Today:     Documents ──pack──► .zipwiki (parsed + OKF) ──MCP──► Agent
Future A:  Same, plus optional export of OKF/facts ──► .ctxpkg (interop)
Future B:  Separate product: session graph + registry (CTXPKG-native)
```

| Path | When it makes sense |
| :---- | :---- |
| **A — Export / bridge** | Customers want ZipWiki evidence *and* CTXPKG ecosystem tools. Implement `zipwiki export-ctxpkg` (or similar) that maps OKF titles/keyFacts → nodes; originals stay in `.zipwiki`. ZipWiki remains source of truth for documents |
| **B — Separate NeoWare project** | The business is “governed context supply chain” (registry, merge, seals, policy engines) more than document packing. Build or adopt CTXPKG tooling as its own line; ZipWiki stays document SaaS |
| **C — Absorb CTXPKG as core** | **Not recommended.** Would discard ZIP interop, unzip story, Extra Field origins, and the parse/OKF loop that differentiate ZipWiki |

---

## 6. Recommendation

1. **Keep ZipWiki’s core:** pack real files → portable `.zipwiki` → catalog / search / read via MCP. That is not what CTXPKG standardizes.
2. **Steal the sharp ideas for the current version:** verify-before-trust messaging, OKF provenance/trust fields, optional agent lesson notes, clearer MCP/skills/ZipWiki layering.
3. **Do not merge formats.** CTXPKG has use **adjacent** to ZipWiki (interop bridge later), or as a **completely different project** if NeoWare wants a registry/graph product. It is not a drop-in replacement for `.zipwiki`.
4. **Watch the draft.** CTXPKG v2 is still draft; lean-ctx and the public registry will move. Revisit a bridge only when a customer or partner needs CTXPKG install/merge specifically.

---

## 7. Sources

- [CTXPKG — The Open Standard for Portable Agent Context](https://ctxpkg.org/)
- ZipWiki packaging: [ZIPWIKI_APPNOTE.md](./ZIPWIKI_APPNOTE.md)
- OKF: [OKF_SPEC.md](./OKF_SPEC.md)
- Access loop: [ZIPACCESS.md](./ZIPACCESS.md), [AGENTS.md](../AGENTS.md)
- Product phases: [PHASES.md](../PHASES.md)
