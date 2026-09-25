# Agentline website

The project site and syntax guide for Agentline, built with TanStack Start.
It presents Agentline as a language draft. The OpenCode plugin at the
repository root is the first reference implementation.

## Run locally

From `website/`:

```bash
bun install --frozen-lockfile
bun run dev
```

Open the address printed by Vite (normally `http://localhost:3000`).

## Check and build

```bash
bun run check
bunx tsc --noEmit
bun run build
bun run preview
```

The Cloudflare Workers build is written to `dist/`. TanStack Start prerenders
both current routes, `/` and `/syntax`, to static HTML during the build. Verify
the generated pages at `dist/client/index.html` and
`dist/client/syntax/index.html`.

## Deploy to Cloudflare Workers

Run from `website/` after authenticating Wrangler with your Cloudflare account:

```bash
bun run deploy
```

The deployment script builds the site and publishes the Worker and its static
assets. For a Cloudflare Git deployment, set the root directory to `website`,
the build command to `bun run build`, and the deploy command to
`bunx wrangler deploy`. The Worker name is set in `wrangler.jsonc`.
Run `bun run cf-typegen` after changing the Wrangler configuration if you add
Cloudflare bindings to the site.

Set `VITE_SITE_URL` to the site's final public origin during the production
build (for example, in your Cloudflare build environment). TanStack prerenders
the social-card and canonical URLs into the HTML, so this must be set at build
time. Copy `.env.example` to `.env` for local production builds. The share image
is `public/og.png`; its editable source is `public/og.svg`.

The home page's looping response-feed animation illustrates the product
direction. It is not a screenshot of the current OpenCode TUI. The current
plugin has a chronological response feed and reveals one response at a time
while other sessions continue running.
