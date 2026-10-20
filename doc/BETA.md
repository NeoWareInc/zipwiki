# First beta checklist

Product: **ZipWiki** · File: `.zipwiki` · Runtime: **TypeScript** (Phase 3)

Work in order:

1. **Part A — Dev complete** — finish every checkbox against **local** tooling and the **dev** hosted stack (`https://dev.zipwiki.ai`). A box here is done when it works on that path.
2. **Part B — Prepare production Beta** — cut the release and wire **zipwiki.ai** / production API / Convex / Stripe live.
3. **Part C — Verify production Beta** — prove the same product works on the public production path. Do not check Part C boxes from a green dev site alone.

Rust CLI is Phase 4 and is not part of this beta.

| Surface                 | Dev (finish first)                                                                             | Production Beta                                                      |
| ----------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Website                 | `https://dev.zipwiki.ai` (`dev` branch → Vercel)                                               | `https://zipwiki.ai` (`main` → Vercel production)                    |
| Local site              | `http://localhost:5173` (`pnpm dev:web`)                                                       | —                                                                    |
| API                     | `https://api-dev.zipwiki.ai` (`pnpm deploy:fly:dev`)                                           | `https://api.zipwiki.ai` (`pnpm deploy:fly:prod`)                    |
| Accounts, credits, keys | Convex `dashing-cod-224` (`npx convex dev --once`)                                             | Convex `festive-hare-381` (`pnpm convex:deploy`)                     |
| Payments                | Stripe **test**                                                                                | Stripe **live**                                                      |
| Install rehearsal       | Tarball / `latest.json` under `**/dev-releases/**` on the **dev** host (`pnpm build:dist:dev`) | `npm i -g https://zipwiki.ai/releases/…tgz` (`pnpm build:dist` only) |
| Local CLI               | `pnpm zipwiki -- …` from this repo                                                             | Published global `zipwiki` from the production tarball               |

Related: [PHASES.md](../PHASES.md), [COMPLETE.md](COMPLETE.md), [CLI.md](CLI.md), [MCP.md](MCP.md), [HOSTED-API.md](HOSTED-API.md), [DISTRIBUTION.md](DISTRIBUTION.md), [CONVEX.md](CONVEX.md), [AGENTS.md](../AGENTS.md).

---

# Part A — Dev complete (local + [https://dev.zipwiki.ai](https://dev.zipwiki.ai))

A box in Part A is done when a person can do it on **local** and/or **dev** as written. Do not skip ahead to production until Part A is finished.

## A1. Dev environments and secrets

- [x] `pnpm dev:web` serves the portal against **dev** Convex (`dashing-cod-224`).
- [x] `https://dev.zipwiki.ai` is the hosted website for the `dev` branch (DNS / Vercel custom domain). Localhost and that host both reach the same auth and dashboard flows.
- [x] `npx convex dev --once` (or `convex dev`) updates **dev** Convex only — never treat `pnpm convex:deploy` as the dev push.
- [x] `pnpm deploy:fly:dev` updates the API at `https://api-dev.zipwiki.ai` (not production Fly).
- [x] Dev Fly secrets are set for the **dev** stack: `ANTHROPIC_API_KEY`, `LLAMA_CLOUD_API_KEY`, `CONVEX_SITE_URL` (dev), `ZIPWIKI_WORKER_SECRET`, and `WEB_ORIGIN` / site URLs that include `https://dev.zipwiki.ai` and `http://localhost:5173`.
- [x] Stripe **test** keys, webhook secret, and price/credit settings point at **dev** Convex. Live Stripe is not required for Part A.
- [x] Admin allowlist works for operators on **dev** (email + passkey step-up on `https://dev.zipwiki.ai/admin`).
- [x] No `.env`, API key, or Stripe secret is in git. `~/.zipwiki` is the only place a user key lives.
- [x] Local CLI / login for rehearsal targets the **dev** API (`api-dev.zipwiki.ai` / `ZIPWIKI_API_URL` for that session), not production.

## A2. zipwiki CLI (local + dev API)

Install and identity:

- [x] From this repo, `pnpm zipwiki -- --help` lists pack, update, open, search, query, ask, read, origin, extract, login, and settings.
- [x] `pnpm zipwiki -- login` completes the device flow against **dev** (`dev.zipwiki.ai` / localhost device pages) and stores the key under `~/.zipwiki`. `pnpm zipwiki -- auth` shows the signed-in account. Logout or a bad key fails with a sentence a person can act on.
- [x] First run update-check behavior is acceptable on dev: silent when current; one stderr line when `latest.json` is newer; `ZIPWIKI_NO_UPDATE_CHECK=1` and `--quiet` stay silent; failures to reach the manifest stay silent.

Pack and update:

- [x] `pnpm zipwiki -- pack` of a local PDF with `--parser liteparse --no-ai-okf` needs no account and writes a `.zipwiki` another machine can open.
- [x] Hosted pack against **dev** (`ZipWiki OKF`, and LlamaParse when selected) debits **dev** credits and records the model, tokens, and file name.
- [x] Out of credits on **dev**: parse falls back to LiteParse; OKF falls back with a clear message and does not call Claude.
- [x] `--include-original` stores the source bytes. `--omit-original` stores parsed markdown plus Extra Field `0x014F` and does not pretend a private folder URL is a public file.
- [x] OKF profiles used in beta (`auto`, and `book` / `legislation` / `invoice` if advertised) match the cards that land in the package.
- [x] `pnpm zipwiki -- update` adds, replaces, and deletes documents, refreshes `ai.digest`, and leaves untouched members intact.
- [x] The package does not contain `wiki/search.json`, `wiki/okf/log.md`, or `wiki/okf/topics/pdf.md`.

Query:

- [x] `open` shows the catalog, digest, and whether each document has parsed text and original bytes.
- [x] `search` and `query` hit OKF first, then parsed markdown.
- [x] `ask` with no question prompts on a TTY, sends evidence to the **dev** answer route, and cites paths inside the package. No passages and no OKF hits does not call the model.
- [x] Credit errors from `ask` use the same sentences as the **dev** website.
- [x] `read` streams an entry and checks CRC-32. `origin --fetch` downloads an omitted original and checks the stored CRC. `extract` is only required when a filesystem path is required.
- [x] `pnpm zipwiki -- settings pull` matches `/dashboard/settings` on **dev** for the signed-in account (parser, OKF, omit-original).

## A3. zipwiki-mcp (local)

- [x] `zipwiki-mcp` (from this repo / built package) speaks stdio MCP (`initialize` returns server name `zipwiki`).
- [x] Tools match the CLI open sequence: `open`, `search` or `query`, `read_okf_index`, `read_okf`, `read_parsed`, `read`, `origin`, `extract`, plus `pack`, `update`, `ask`, `list`, `read_entry`, `read_manifest`, `okf_enrich`.
- [x] Progress and the update check never write to stdout. Tool errors come back as tool results.
- [x] `ask` does not prompt (no TTY). It refuses an empty question and does not call the model when the package has no evidence.
- [x] Cursor (or another MCP host) starts with a local `mcp.json` pointing at this checkout’s `zipwiki-mcp`.
- [x] A cold agent can pack a local PDF with `--no-ai-okf`, then `open` → `search` → `read_okf` → `read_parsed` without dumping the whole archive.
- [x] Hosted `pack` / `okf_enrich` / `ask` from MCP debit the same **dev** account as the CLI.

## ~~A4. Package contents~~

- [x] `META-INF/manifest.json` lists primaries, parser, OKF presence, and `ai.digest` when concepts exist.
- [x] `ai.digest` is at most 1000 characters, starts with the document count, and was written from the whole `wiki/okf/index.md` (every `# Files` bullet), not from the first names in alphabetical order.
- [x] A package with more than one subject (two patients, two books) names each repeated subject in that digest.
- [x] Parsed markdown is what models read. Originals are present only when the pack asked for them.
- [x] Stock `unzip` can list the archive. Compression is zstd by default; deflate still opens in older tools when requested.
- [x] `THIRD_PARTY_NOTICES` in the built tarball names LiteParse, Tesseract, and PDFium with their license texts (rehearse with `pnpm build:dist` even before production publish).

## A5. Distribution rehearsal on the dev host

Rehearsal and production use **different directories** so a `dev` merge cannot publish rehearsal tarballs to `zipwiki.ai`:

| Build | Writes | Served on |
| --- | --- | --- |
| `pnpm build:dist:dev` | `apps/web/public/dev-releases/` | `https://dev.zipwiki.ai/dev-releases/…` |
| `pnpm build:dist` | `apps/web/public/releases/` | `https://zipwiki.ai/releases/…` |

Production Vercel builds **delete** `public/dev-releases/` before the web build. The Install page on a dev host fetches `/dev-releases/`; production uses `/releases/`.

- [x] Dev install page (on `https://dev.zipwiki.ai/install`) points at tarballs under `**/dev-releases/**` on the **dev** site. Build with `pnpm build:dist:dev`. Use `pnpm build:dist` only when cutting production (writes `/releases/` only).
- [x] `apps/web/public/dev-releases/index.json` (after `build:dist:dev`) and `apps/web/public/releases/index.json` (after `build:dist`) each list only files that exist in that same directory; the web build fails when a list and its files disagree.
- [x] `/releases/` and `/dev-releases/` are not rewritten to `index.html` on the **dev** deploy.
- [x] Copy icons on the install scripts copy the command that is on screen.
- [x] Platforms that are not published say so and do not offer a fake `npm i -g` URL.
- [x] Node `>= 22.13` is stated on `/install` and enforced by the package `engines` field.
- [x] LibreOffice is documented as a system requirement for Office files and is not bundled. EasyOCR and PaddleOCR are not implied.
- [x] A second machine can install from the **dev** tarball URL (`…/dev-releases/….tgz` or a copied `.tgz`) and run `zipwiki --help` before production publish.

## A6. Hosted API (dev)

- [ ] `GET /health` on `https://api-dev.zipwiki.ai` returns success, and the docs describe the routes that actually exist: `/api/parse`, `/api/okf/enrich`, `/api/okf/digest`, `/api/query/answer`, `/api/settings`, `/api/client-config`, usage and telemetry.
- [ ] [HOSTED-API.md](HOSTED-API.md) matches that list (update the doc if it still omits digest and ask).
- [ ] Dev Fly is running the image that contains those routes, with enough memory for a real PDF parse.
- [ ] `api-dev.zipwiki.ai` has a valid certificate and DNS. Clients may still know `*.fly.dev` for ops, but product paths use the custom host.
- [ ] Parse, OKF enrich, package digest, and ask each debit one credit on success and do not debit on vendor failure (**dev** ledger).
- [ ] Haiku 5.5 (and any other allowed model) is on both allowlists (`convex/lib/credits.ts` and `apps/server/src/gateway/anthropic.ts`). A saved older model id does not 400.
- [ ] Package digest reads the full OKF index the client sends and returns a summary; an empty Claude reply is visible in logs and the CLI keeps a digest that still names every group.
- [ ] Fly build context does not upload `knowledge/`, `.pack/`, or the website tarball (`.dockerignore`).
- [ ] `pnpm check:fly:dev` is clean.

## A7. Website (dev.zipwiki.ai + local)

- [x] `https://dev.zipwiki.ai/` shows the beta headline and subheading, and the Classic ZIP / agent comparison under it (same for local after `pnpm dev:web`).
- [x] A visitor can reach How it works, MCP & CLI, Terms, and Privacy without guessing URLs. Install stays off the nav until Beta opens (`SHOW_INSTALL_IN_NAV` in `marketing-copy.ts`); then it is last in the menu.
- [ ] Waitlist and sales mail links reach a mailbox that is read.
- [x] Terms and privacy name ZipWiki, what is stored (account, keys, credit ledger, document bytes only on the user’s machine unless they upload for hosted parse), and Stripe.
- [x] `/install` on **dev.zipwiki.ai** offers a working download or a working `npm i -g` URL for rehearsal.
- [x] Mobile and desktop both show the install commands and the two-line header without a third wrapped line.
- [x] No beta CTA points at a page that redirects away or 404s (`/product`, `/download`, `/plugin` may redirect; the destination must be the intended page).
- [x] How it works and Knowledge Archive settings education (parse + OKF / ZipWiki LLM) are clear on **dev** before promoting copy to production.

## A8. Portal (dev)

Account:

- [ ] Sign up, email code or the live auth method, and sign-in work on `https://dev.zipwiki.ai` (and localhost) against **dev** Convex.
- [ ] CLI device approval (`/cli/device`, `/cli/setup`) issues a key the **dev** API accepts.
- [ ] Sign out works. A second browser does not stay signed in as the first user.

Knowledge:

- [ ] `/dashboard/knowledge` opens a local or uploaded `.zipwiki`, shows the package overview including `ai.digest`, and can search and ask.
- [ ] Ask on the website and `zipwiki ask` return the same kind of cited answer for the same package and question (**dev**).
- [ ] Empty, missing-package, and credit-exhausted states are visible and do not spin.
- [ ] Create ZipWiki loads account settings by default; page values override for the generated command; “Edit default settings” opens Settings at the top.

Settings and keys:

- [ ] `/dashboard/settings` saves parser, OKF, and pack options, and `zipwiki settings pull` sees them.
- [ ] `/dashboard/keys` is reachable (e.g. from Settings), creates a key, shows it once, copies it, and revokes it. A revoked key is rejected by the **dev** API.
- [ ] The dashboard home shows credit balance and recent usage that match the **dev** ledger.

## A9. Billing (Stripe test on dev)

- [ ] A Stripe **test** Checkout from `/dashboard/billing` on **dev** adds credits after the webhook. Cancel adds nothing. Refresh shows the new balance without a manual Convex edit.
- [ ] The Stripe customer portal opens for a user who has paid (test mode).
- [ ] Auto-reload charges the saved test card at the threshold and does not double-charge a single pack.
- [ ] Low-credit email sends once per dip, not once per file (test/dev mail path).
- [ ] One hosted parse, one OKF card, one package digest, and one ask each appear on the ledger with provider, model, and tokens or pages. The credit math matches the published formula (markup and 100 credits per dollar).
- [ ] Spent credits cannot exceed purchased credits unless the account is marked unlimited.
- [ ] A locked account cannot spend. A disabled account cannot sign in or call the API.
- [ ] Receipts and the billing page agree on dollars and credits (test).

## A10. Admin (dev)

- [x] `/admin` on **dev** requires an admin role and a current passkey step-up. A normal customer gets a refusal, not a half-loaded page.
- [x] Account search finds a user by email. Disable, role change, unlimited credits, credit lock, and **add/subtract credits** take effect on the next API call.
- [x] `/admin/accounts/:id` shows keys, usage, and the credit ledger for that account.
- [ ] `/admin/usage` matches Fly and Convex for a known pack (same file count, same credit count).
- [x] `/admin/billing` shows customer ZipWiki credit balances, auto-reload On/Off, and the platform spend lock, plus links to LlamaCloud / Anthropic billing consoles. Per-account Llama / Claude usage stays on `/admin/usage` only.
- [x] Granting or adjusting credits writes a ledger row and updates the balance the user sees.
- [x] Admin actions are attributable (who changed the account).

## A11. Dev smokes (gate before Part B)

Run these as a person who is not the author, on **local** and/or **dev**:

- [x] Sign up on `https://dev.zipwiki.ai`, finish settings, and connect CLI with `zipwiki login` to **dev**.
- [x] Pack a small PDF with `--no-ai-okf`. `open` lists it. `search` finds a word from the page. `read` returns markdown.
- [x] Buy the smallest **test** credit pack (or grant credits via admin), pack with hosted OKF, and see the balance drop on the **dev** website.
- [x] `zipwiki ask` and the knowledge page answer the same question from that package, with citations.
- [x] Point an AI agent at local `zipwiki-mcp` and run `open` then `search` then `read_okf`.
- [x] Pack with originals included and with originals omitted. Omitted originals still `origin --fetch` when a real public URL exists; included originals are in the zip.
- [x] Spend the **dev** account to zero and confirm the next hosted call falls back or stops with the documented message.
- [x] Confirm the **dev** `/dev-releases/latest.json` (or install page) and a rehearsal tarball URL under `/dev-releases/` from a browser.

**Part A gate:** all boxes above are checked. Only then start Part B.

---

# Part B — Prepare production Beta ([zipwiki.ai](http://zipwiki.ai))

Cut and wire the public Beta. Do not mark Part C done until these are in place.

## B1. Release cut

- [x] Write the beta scope in one paragraph: what a user can install, which OS/CPU builds exist, and what still waits (Rust, extra platforms).
  A beta user installs the TypeScript CLI and stdio MCP (`zipwiki` and `zipwiki-mcp`) with `npm i -g` of one platform tarball from [zipwiki.ai/install](https://zipwiki.ai/install). That needs Node.js 22.13 or newer. The five builds are macOS Apple silicon (`darwin-arm64`), macOS Intel (`darwin-x64`), Linux x64 glibc, Linux ARM64 glibc, and Windows x64. Alpine/musl, Windows ARM, the Rust CLI, and a public npm registry package wait until after this beta.
- [x] Pick the version customers see (`zipwiki --version`, `latest.json`, and the tarball name are the same version).
- [x] Tag that version and keep the git tree that built the tarball. Tag `v0.1.0` is commit `40618b1`, the tree `pnpm build:dist:dev` packed into `zipwiki-0.1.0-*.tgz` (`0.1.0 beta (2026-10-19)`).
- [x] Decide the support address (`hello@zipwiki.ai` or another) and put it on the site, in the package README, and in error text that tells people where to write.
- [x] Write a rollback: previous tarball URL, previous Fly image, previous Convex deploy, and who can promote `main`.
  Rollback for the `0.1.0 beta (2026-10-19)` cut. The previous dev tarball is commit `59693e6` (`Use /public/examples`). Restore each platform from `https://github.com/NeoWareInc/zipwiki/raw/59693e6/apps/web/public/dev-releases/zipwiki-0.1.0-darwin-arm64.tgz` (same path for `darwin-x64`, `linux-x64`, `linux-arm64`, and `win32-x64`) and redeploy the `dev` branch. Production tarballs were not replaced by that build; they remain `https://zipwiki.ai/releases/zipwiki-0.1.0-<platform>.tgz` from commit `faa258f`. The production Fly image in service is `registry.fly.io/zipwiki-api-prod:deployment-01M50Y6807FPSKNA0J3PGJ1BFS` (release v6). The previous image is `registry.fly.io/zipwiki-api-prod:deployment-01M50AGRQ8JF7QV3FRA8KDR5YE` (release v3): `fly deploy --image registry.fly.io/zipwiki-api-prod:deployment-01M50AGRQ8JF7QV3FRA8KDR5YE --config deploy/fly/fly.prod.toml`. Production Convex is `festive-hare-381`. The last function commit on `main` is `4036c70`; the one before it is `559a821`. Roll functions back by checking out `559a821` and running `pnpm convex:deploy`. GitHub user `NutecDev` is the only admin on `NeoWareInc/zipwiki` and is who promotes `main`, which publishes `https://zipwiki.ai`.

## B2. Production environments and secrets

- [x] Production website deploy comes from `main`. Pushing `dev` updates `https://dev.zipwiki.ai` only.
- [x] `pnpm deploy:fly:prod` is what updates the API users call. `pnpm deploy:fly:dev` does not.
- [x] `pnpm convex:deploy` is production Convex (`festive-hare-381`). `npx convex dev --once` is the dev deployment only.
- [x] Fly **prod** secrets are set and are not the dev keys: `ANTHROPIC_API_KEY`, `LLAMA_CLOUD_API_KEY`, `CONVEX_SITE_URL`, `ZIPWIKI_WORKER_SECRET`, and `WEB_ORIGIN` / site URLs that include `https://www.zipwiki.ai` and `https://zipwiki.ai` as required.
- [x] Stripe **live** keys, webhook secret, and price/credit settings point at production Convex. Test-mode webhooks are not attached to the live site.
- [x] Admin allowlist (`admin` emails / passkey) is the real operators, not a personal leftover from setup.
- [x] `ZIPWIKI_API_URL` baked into the installed CLI and into the website client config is the **production** API (`https://api.zipwiki.ai`).
- [x] `pnpm check:fly:prod` is clean.

## B3. Distribution on [zipwiki.ai](http://zipwiki.ai)

- [x] `pnpm build:dist` produces the tarballs for every platform the beta claims.
- [x] Every `npm i -g https://zipwiki.ai/releases/<file>.tgz` command on `/install` downloads a real gzip tarball (`1f 8b`), not the website HTML.
- [x] Production deploy of `apps/web` contains those release files and `index.json` / `latest.json`.
- [x] `/releases/` is not rewritten to `index.html` on **zipwiki.ai**.
- [x] Platforms that are not published say so. Beta is explicit if it is macOS Apple silicon only.
- [x] `latest.json` `version` equals the installed CLI, and `url` points at a page that exists (`/install` or a real release note).
- [x] A second machine (not the build machine) installs from the **public** URL and runs `zipwiki --help`.

## B4. Promote website, API, and Convex

- [x] Merge / promote the verified `dev` work to `main` (or the production deploy path) so `https://zipwiki.ai` matches the Part A product.
- [ ] Production Fly is running the image that contains the beta routes, with enough memory for a real PDF parse.
- [ ] `api.zipwiki.ai` has a valid certificate and DNS. Clients do not depend on `*.fly.dev` hostnames for product use.
- [x] Production Convex functions match what the CLI and website call (including admin credit adjust, welcome credits, passkey origins for www/apex as needed).

**Part B gate:** release artifacts and production wiring are ready. Proceed to Part C verification.

---

# Part C — Verify production Beta ([zipwiki.ai](http://zipwiki.ai))

A box here is done only when a new user can do it on the **production** path. A green `dev.zipwiki.ai` or local `pnpm zipwiki` does not check these boxes.

## C1. Production CLI and MCP

- [x] `npm i -g` of the published tarball puts `zipwiki` and `zipwiki-mcp` on `PATH`.
- [x] `zipwiki --version` matches `https://zipwiki.ai/releases/latest.json`.
- [x] `zipwiki login` completes against **zipwiki.ai** and the production API accepts the key.
- [ ] Local pack with LiteParse / `--no-ai-okf` still needs no account.
- [x] Hosted pack / OKF / ask debit **production** credits and match website ledger rows.
- [ ] Out-of-credits behavior matches the documented messages on production.
- [ ] Cursor and Claude (or any MCP host) start with the published `mcp.json` snippet (`command`: `zipwiki-mcp`).
- [ ] Hosted `pack` / `okf_enrich` / `ask` from MCP debit the same production account as the CLI.
- [x] `zipwiki settings pull` matches `/dashboard/settings` on **zipwiki.ai**.

## C2. Production website, portal, billing, admin

- [x] `https://zipwiki.ai/` (and www if used) shows the beta marketing and working nav destinations.
- [x] `/install` on **zipwiki.ai** offers a working download or `npm i -g` URL.
- [x] Sign up, device approval, settings, knowledge, keys, and billing work against production Convex and Stripe **live**.
- [x] A live Stripe Checkout from `/dashboard/billing` adds credits after the webhook.
- [x] `/admin` on production requires admin + passkey; add/subtract credits and account controls work for real operators.
- [x] Waitlist and sales mailboxes are monitored.

## C3. Production smokes before the tag

Run these as a person who is not the author, on **production**:

- [x] Install from `https://zipwiki.ai/install` on a clean macOS Apple silicon machine (and each other OS the beta claims).
- [ ] Pack a small PDF with `--no-ai-okf`. `open` lists it. `search` finds a word from the page. `read` returns markdown.
- [ ] Sign up, buy the smallest credit pack, pack with hosted OKF, and see the balance drop on the website.
- [ ] `zipwiki ask` and the knowledge page answer the same question from that package, with citations.
- [ ] Point Claude or Cursor at `zipwiki-mcp` and run `open` then `search` then `read_okf`.
- [ ] Pack with originals included and with originals omitted. Omitted originals still `origin --fetch` when a real public URL exists; included originals are in the zip.
- [ ] Spend the account to zero and confirm the next hosted call falls back or stops with the documented message.
- [ ] Confirm `https://zipwiki.ai/releases/latest.json` and the tarball URL from a browser and from `npm i -g`.

**Beta ready:** Part A, Part B, and Part C are all checked.

---

# After beta (do not block the tag)

- [ ] Rust CLI for macOS arm64, then other machines.
- [ ] `docs.zipwiki.ai` (GitHub `/doc` remains the beta docs host).
- [ ] Linux and Windows tarballs, if beta shipped macOS only.
- [ ] Public npm registry publish, if install stays a tarball URL for beta.