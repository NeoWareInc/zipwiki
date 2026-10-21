# Convex (ZipWiki SaaS backend)

Convex holds users, accounts, API keys, prepaid credits, usage, device auth, and
**account settings** (the portal at `/dashboard/settings`).

This is a **new** Convex project — do not reuse zipcodex.ai deployments.

## Secret lanes

| Lane | Where | Used by |
| --- | --- | --- |
| **A — SaaS / auth** | Convex env | Dashboard login, billing, settings |
| **B — Hosted compute** | Fly secrets (`deploy/.env.dev` / `.env.prod` → `fly secrets set`) | Hosted LlamaParse / OKF on the API |
| **C — User / CLI** | Shell, project `.env` / `.env.local`, `~/.zipwiki/.env` | Local pack / BYO vendor keys |

Settings store **preferences** (`parseCredential`, `okfCredential`), never provider secrets.

### Where Llama and AI keys are loaded

**Lane B — ZipWiki master keys (hosted credits)**

| Secret | Lives on | Who calls the vendor |
| --- | --- | --- |
| `LLAMA_CLOUD_API_KEY` | Fly only (`deploy/.env.dev` / `.env.prod` are ops templates) | `apps/server` → LlamaParse |
| `ANTHROPIC_API_KEY` | Fly only | `apps/server` → Claude (OKF / digest / ask) |

The CLI and MCP **must not** read `deploy/.env*`. When the account preference is
`parseCredential=zipwiki` or `okfCredential=zipwiki`, the client sends work to
the hosted API with the user’s ZipWiki API key; Fly holds the vendor key and
debits ZipWiki credits. See [HOSTED-API.md](HOSTED-API.md).

**Lane C — User BYO keys (machine-local)**

CLI startup order (`apps/zipwiki/src/cli.ts`):

1. Shell / process env (already set) wins
2. Project root `.env`, then `.env.local` (`loadEnvFiles`)
3. `~/.zipwiki/.env` (`loadZipwikiHomeEnv`; also via `zipwiki config api-key`)

| Key | BYO use |
| --- | --- |
| `LLAMA_CLOUD_API_KEY` | Direct LlamaParse on this machine (`parseCredential=llama`; pack header shows `(user api key)`) |
| `ANTHROPIC_API_KEY` | Direct Claude for OKF (`okfCredential=anthropic`) |
| `OPENAI_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `OPENAI_COMPATIBLE_API_KEY`, `AI_GATEWAY_API_KEY` | Optional local OKF providers |

A user LlamaParse key exists **only** when one of those Lane C sources sets
`LLAMA_CLOUD_API_KEY`. It is never inferred from ZipWiki login or from deploy
env. No key + LlamaParse + signed-in account → hosted parse (ZipWiki credits).

`ZIPWIKI_API_KEY` in `~/.zipwiki/.env` is the ZipWiki account credential for the
hosted API — not a Llama or Anthropic key.

```bash
npx convex dev
npx @convex-dev/auth
```

Web env (repo-root `.env.local` for local; Vercel for hosts):

| Variable | Dev | Production |
| --- | --- | --- |
| `VITE_CONVEX_URL` | `https://dashing-cod-224.convex.cloud` | `https://festive-hare-381.convex.cloud` |
| `VITE_API_URL` | `https://api-dev.zipwiki.ai` | `https://api.zipwiki.ai` |

Convex `SITE_URL` / `WEB_ORIGIN` (passkeys, auth redirects, mail links):

| Deployment | `SITE_URL` | `WEB_ORIGIN` (comma-separated) |
| --- | --- | --- |
| Dev (`dashing-cod-224`) | `https://dev.zipwiki.ai` | `dev.zipwiki.ai`, Vercel alias, `localhost:5173` |
| Prod (`festive-hare-381`) | `https://zipwiki.ai` | `zipwiki.ai`, `www.zipwiki.ai`, Vercel alias, `localhost:5173` |

Beta access (Convex env on each deployment):

| Variable | Dev | Production |
| --- | --- | --- |
| `BETA_ACCESS_MODE` | `invite` (default when `SITE_URL` is `dev.zipwiki.ai`) | `open` |
| `BETA_USER_LIMIT` | ignored | `500` (default when unset) |

Invite-only: new accounts need a row in `betaInvites` (Admin → Users) or a bootstrap admin email. At capacity: `/signup` shows a waitlist form that emails `hello@zipwiki.ai`.

Restart `pnpm dev:web` after changing env. Do not put `AUTH_*` in `VITE_*`.
