# @zipwiki/web

Marketing site and account portal for [zipwiki.ai](https://zipwiki.ai).

```bash
pnpm --filter @zipwiki/web dev
pnpm --filter @zipwiki/web build
```

**Marketing:** `/` `/product` `/how-it-works` `/pricing` `/roadmap` `/terms` `/privacy`.

**Portal:** `/login` `/signup` `/dashboard` `/dashboard/settings` `/dashboard/keys`
`/dashboard/billing` `/dashboard/knowledge` `/cli/setup` `/cli/device`.

Account settings (parse/OKF/pack preferences) live on Convex. Local pack still
works without login. To persist portal settings:

```bash
npx convex dev
```

See [doc/CONVEX.md](../../doc/CONVEX.md).
