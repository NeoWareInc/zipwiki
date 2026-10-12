# First beta checklist

Product: **ZipWiki** · File: **`.zipwiki`** · Runtime: **TypeScript** (Phase 3)

A box is done only when a new user can do it on the **production** path below.
A green dev site, a local `pnpm zipwiki`, or a Fly dev app does not check the box.

Rust CLI is Phase 4 and is not part of this beta.

| Surface | Production | Dev (rehearsal only) |
| --- | --- | --- |
| Website | `https://zipwiki.ai` (`main` → Vercel production) | `https://zipwiki-web-dev.vercel.app` (`dev` branch) |
| API | `https://api.zipwiki.ai` (`zipwiki-api-prod`) | `https://zipwiki-api-dev.fly.dev` |
| Accounts, credits, keys | Convex `festive-hare-381` | Convex `dashing-cod-224` |
| Payments | Stripe live | Stripe test |
| Install | `npm i -g https://zipwiki.ai/releases/…tgz` | same file on the dev host, for rehearsal |

Related: [PHASES.md](../PHASES.md), [COMPLETE.md](COMPLETE.md), [CLI.md](CLI.md), [MCP.md](MCP.md), [HOSTED-API.md](HOSTED-API.md), [DISTRIBUTION.md](DISTRIBUTION.md), [CONVEX.md](CONVEX.md).

## 1. Release cut

- [ ] Write the beta scope in one paragraph: what a user can install, which OS/CPU builds exist, and what still waits (Rust, extra platforms).
- [ ] Pick the version customers see (`zipwiki --version`, `latest.json`, and the tarball name are the same version).
- [ ] Tag that version and keep the git tree that built the tarball.
- [ ] Decide the support address (`hello@zipwiki.ai` or another) and put it on the site, in the package README, and in error text that tells people where to write.
- [ ] Write a rollback: previous tarball URL, previous Fly image, previous Convex deploy, and who can promote `main`.

## 2. Environments and secrets

- [ ] Production website deploy comes from `main`. Pushing `dev` updates `zipwiki-web-dev.vercel.app` only.
- [ ] `pnpm deploy:fly:prod` is what updates the API users call. `pnpm deploy:fly:dev` does not.
- [ ] `pnpm convex:deploy` is production Convex (`festive-hare-381`). `npx convex dev --once` is the dev deployment only.
- [ ] Fly prod secrets are set and are not the dev keys: `ANTHROPIC_API_KEY`, `LLAMA_CLOUD_API_KEY`, `CONVEX_SITE_URL`, `ZIPWIKI_WORKER_SECRET`.
- [ ] Stripe live keys, webhook secret, and price/credit settings point at production Convex. Test-mode webhooks are not attached to the live site.
- [ ] Admin allowlist (`admin` emails / passkey) is the real operators, not a personal dev account left over from setup.
- [ ] No `.env`, API key, or Stripe secret is in git. `~/.zipwiki` is the only place a user key lives.
- [ ] `ZIPWIKI_API_URL` baked into the installed CLI and into the website client config is the production API.

## 3. zipwiki CLI

Install and identity:

- [ ] `npm i -g` of the published tarball puts `zipwiki` and `zipwiki-mcp` on `PATH`.
- [ ] `zipwiki --version` matches `latest.json`.
- [ ] `zipwiki --help` lists pack, update, open, search, query, ask, read, origin, extract, login, and settings.
- [ ] First run prints nothing when already current. A newer `latest.json` prints one stderr line and continues. `ZIPWIKI_NO_UPDATE_CHECK=1` and `--quiet` stay silent. Failures to reach the manifest stay silent.
- [ ] `zipwiki login` completes the device flow in the browser and stores the key under `~/.zipwiki`. `zipwiki auth` shows the signed-in account. Logout or a bad key fails with a sentence a person can act on.

Pack and update:

- [ ] `zipwiki pack` of a local PDF with `--parser liteparse --no-ai-okf` needs no account and writes a `.zipwiki` another machine can open.
- [ ] Hosted pack (`ZipWiki OKF`, and LlamaParse when selected) debits production credits and records the model, tokens, and file name.
- [ ] Out of credits: parse falls back to LiteParse; OKF falls back with a clear message and does not call Claude.
- [ ] `--include-original` stores the source bytes. `--omit-original` stores parsed markdown plus Extra Field `0x014F` and does not pretend a private folder URL is a public file.
- [ ] OKF profiles used in beta (`auto`, and `book` / `legislation` / `invoice` if advertised) match the cards that land in the package.
- [ ] `zipwiki update` adds, replaces, and deletes documents, refreshes `ai.digest`, and leaves untouched members intact.
- [ ] The package does not contain `wiki/search.json`, `wiki/okf/log.md`, or `wiki/okf/topics/pdf.md`.

Query:

- [ ] `open` shows the catalog, digest, and whether each document has parsed text and original bytes.
- [ ] `search` and `query` hit OKF first, then parsed markdown.
- [ ] `ask` with no question prompts on a TTY, sends evidence to the hosted answer route, and cites paths inside the package. No passages and no OKF hits does not call the model.
- [ ] Credit errors from `ask` use the same sentences as the website.
- [ ] `read` streams an entry and checks CRC-32. `origin --fetch` downloads an omitted original and checks the stored CRC. `extract` is only required when a filesystem path is required.
- [ ] `zipwiki settings pull` matches `/dashboard/settings` for the signed-in account (parser, OKF, omit-original).

## 4. zipwiki-mcp

- [ ] `zipwiki-mcp` speaks stdio MCP (`initialize` returns server name `zipwiki` and the beta version).
- [ ] Tools match the CLI open sequence: `open`, `search` or `query`, `read_okf_index`, `read_okf`, `read_parsed`, `read`, `origin`, `extract`, plus `pack`, `update`, `ask`, `list`, `read_entry`, `read_manifest`, `okf_enrich`.
- [ ] Progress and the update check never write to stdout. Tool errors come back as tool results.
- [ ] `ask` does not prompt (no TTY). It refuses an empty question and does not call the model when the package has no evidence.
- [ ] Cursor and Claude both start with the published `mcp.json` snippet (`command`: `zipwiki-mcp`).
- [ ] A cold agent can pack a local PDF with `--no-ai-okf`, then `open` → `search` → `read_okf` → `read_parsed` without dumping the whole archive.
- [ ] Hosted `pack` / `okf_enrich` / `ask` from MCP debit the same production account as the CLI.

## 5. Package contents

- [ ] `META-INF/manifest.json` lists primaries, parser, OKF presence, and `ai.digest` when concepts exist.
- [ ] `ai.digest` is at most 1000 characters, starts with the document count, and was written from the whole `wiki/okf/index.md` (every `# Files` bullet), not from the first names in alphabetical order.
- [ ] A package with more than one subject (two patients, two books) names each repeated subject in that digest.
- [ ] Parsed markdown is what models read. Originals are present only when the pack asked for them.
- [ ] Stock `unzip` can list the archive. Compression is zstd by default; deflate still opens in older tools when requested.
- [ ] `THIRD_PARTY_NOTICES` in the tarball names LiteParse, Tesseract, and PDFium with their license texts.

## 6. Distribution and the install page

- [ ] Every `npm i -g https://zipwiki.ai/releases/<file>.tgz` command on `/install` downloads a real gzip tarball (`1f 8b`), not the website HTML.
- [ ] `apps/web/public/releases/index.json` lists only files that are in that directory, and the production deploy contains those files. The web build fails when the list and the files disagree.
- [ ] `/releases/` is not rewritten to `index.html`.
- [ ] Copy icons on the install scripts copy the command that is on screen.
- [ ] Platforms that are not published say so and do not offer an `npm i -g` URL. Beta is explicit if it is macOS Apple silicon only.
- [ ] `latest.json` `version` equals the installed CLI, and `url` points at a page that exists (`/install` or a real release note).
- [ ] Node `>= 22.13` is stated on `/install` and enforced by the package `engines` field.
- [ ] LibreOffice is documented as a system requirement for Office files and is not bundled. EasyOCR and PaddleOCR are not implied.
- [ ] A second machine (not the build machine) installs from the public URL and runs `zipwiki --help`.

## 7. Hosted API

- [ ] `GET /health` on production returns success, and the docs describe the routes that actually exist: `/api/parse`, `/api/okf/enrich`, `/api/okf/digest`, `/api/query/answer`, `/api/settings`, `/api/client-config`, usage and telemetry.
- [ ] [HOSTED-API.md](HOSTED-API.md) matches that list (it still omits digest and ask).
- [ ] Production Fly is running the image that contains those routes, with enough memory for a real PDF parse (the Phase 1b note of 256MB is not the beta size until a large PDF succeeds).
- [ ] `api.zipwiki.ai` and `api-dev.zipwiki.ai` have certificates and DNS. Clients do not depend on `*.fly.dev` hostnames.
- [ ] Parse, OKF enrich, package digest, and ask each debit one credit on success and do not debit on vendor failure.
- [ ] Haiku 5.5 (and any other allowed model) is on both allowlists (`convex/lib/credits.ts` and `apps/server/src/gateway/anthropic.ts`). A saved older model id does not 400.
- [ ] Package digest reads the full OKF index the client sends and returns a summary; an empty Claude reply is visible in logs and the CLI keeps a digest that still names every group.
- [ ] Fly build context does not upload `knowledge/`, `.pack/`, or the website tarball (`.dockerignore`).
- [ ] `pnpm check:fly` is clean for prod.

## 8. Website

- [ ] Production `/` shows the beta headline and subheading, and the Classic ZIP / agent comparison under it.
- [ ] A visitor can reach Install, How it works, CLI, MCP, Pricing, Roadmap, Terms, and Privacy without guessing URLs. Nav today is only Product and How it works; confirm the rest are linked from the pages a beta user sees.
- [ ] Pricing copy matches the ledger: 100 credits per dollar, what a credit buys (hosted parse, hosted OKF, ask), and the LlamaParse tiers that are actually offered.
- [ ] Waitlist and sales mail links reach a mailbox that is read.
- [ ] Terms and privacy name ZipWiki, what is stored (account, keys, credit ledger, document bytes only on the user’s machine unless they upload for hosted parse), and Stripe.
- [ ] `/install` on **zipwiki.ai** (not only the dev host) offers a working download or a working `npm i -g` URL.
- [ ] Mobile and desktop both show the install commands and the two-line header without a third wrapped line.
- [ ] No beta CTA points at a page that redirects away or 404s (`/product`, `/download`, `/plugin` may redirect; the destination must be the intended page).

## 9. Portal

Account:

- [ ] Sign up, email code or the live auth method, and sign-in work on zipwiki.ai against production Convex.
- [ ] CLI device approval (`/cli/device`, `/cli/setup`) issues a key the production API accepts.
- [ ] Sign out works. A second browser does not stay signed in as the first user.

Knowledge:

- [ ] `/dashboard/knowledge` opens a local or uploaded `.zipwiki`, shows the package overview including `ai.digest`, and can search and ask.
- [ ] Ask on the website and `zipwiki ask` return the same kind of cited answer for the same package and question.
- [ ] Empty, missing-package, and credit-exhausted states are visible and do not spin.

Settings and keys:

- [ ] `/dashboard/settings` saves parser, OKF, and pack options, and `zipwiki settings pull` sees them.
- [ ] `/dashboard/keys` creates a key, shows it once, copies it, and revokes it. A revoked key is rejected by the API.
- [ ] The dashboard home shows credit balance and recent usage that match the ledger.

## 10. Billing

- [ ] A live Stripe Checkout from `/dashboard/billing` adds credits after the webhook. Cancel adds nothing. Refresh shows the new balance without a manual Convex edit.
- [ ] The Stripe customer portal opens for a user who has paid.
- [ ] Auto-reload charges the saved card at the threshold and does not double-charge a single pack.
- [ ] Low-credit email sends once per dip, not once per file.
- [ ] One hosted parse, one OKF card, one package digest, and one ask each appear on the ledger with provider, model, and tokens or pages. The credit math matches the published formula (markup and 100 credits per dollar).
- [ ] Spent credits cannot exceed purchased credits unless the account is marked unlimited.
- [ ] A locked account cannot spend. A disabled account cannot sign in or call the API.
- [ ] Receipts and the billing page agree on dollars and credits.

## 11. Admin

- [ ] `/admin` requires an admin role and a current passkey step-up. A normal customer gets a refusal, not a half-loaded page.
- [ ] Account search finds a user by email. Disable, role change, unlimited credits, and credit lock take effect on the next API call.
- [ ] `/admin/accounts/:id` shows keys, usage, and the credit ledger for that account.
- [ ] `/admin/usage` matches Fly and Convex for a known pack (same file count, same credit count).
- [ ] `/admin/billing` shows vendor float for Anthropic and LlamaParse. Restock and low-float threshold save, and a low float is visible before the vendor key runs dry.
- [ ] Granting credits writes a `grant` ledger row and increases the balance the user sees.
- [ ] Admin actions are attributable (who changed the account).

## 12. Smokes before the tag

Run these as a person who is not the author, on production:

- [ ] Install from `https://zipwiki.ai/install` on a clean macOS Apple silicon machine (and each other OS the beta claims).
- [ ] Pack a small PDF with `--no-ai-okf`. `open` lists it. `search` finds a word from the page. `read` returns markdown.
- [ ] Sign up, buy the smallest credit pack, pack with hosted OKF, and see the balance drop on the website.
- [ ] `zipwiki ask` and the knowledge page answer the same question from that package, with citations.
- [ ] Point Claude or Cursor at `zipwiki-mcp` and run `open` then `search` then `read_okf`.
- [ ] Pack with originals included and with originals omitted. Omitted originals still `origin --fetch` when a real public URL exists; included originals are in the zip.
- [ ] Spend the account to zero and confirm the next hosted call falls back or stops with the documented message.
- [ ] Confirm `https://zipwiki.ai/releases/latest.json` and the tarball URL from a browser and from `npm i -g`.

## 13. After beta (do not block the tag)

- [ ] Rust CLI for macOS arm64, then other machines.
- [ ] `docs.zipwiki.ai` (GitHub `/doc` remains the beta docs host).
- [ ] Linux and Windows tarballs, if beta shipped macOS only.
- [ ] Public npm registry publish, if install stays a tarball URL for beta.
