# sgnf.ai

Static showcase home page for sgnf.ai ("Signal in the noise"), built from the sgnf.ai design system with Latin placeholder copy.

## Pipeline
Claude Code (edit locally) -> GitHub `AspolAdmin/sgnfai` (public, branch `main`) -> Cloudflare Workers Builds (connect the repo in the dashboard; builds on every push to main) -> Cloudflare Worker `sgnfai` (static assets from `public/`) -> custom domains sgnf.ai, www.sgnf.ai (see `wrangler.jsonc`).

## Layout
- `public/` – the site (index.html, style.css, favicon.svg)
- `wrangler.jsonc` – Worker name, assets dir, custom domains

## External references
- Design system (source of truth for tokens, copy rules): https://claude.ai/artifact/GvVPx863APi1HeKpheGAA8 — tokens are copied into `:root` in `public/style.css`; keep them in sync.
  Rules worth remembering: wordmark always lowercase "sgnf.ai"; one orange (`alert`) element per view; orange text uses `alert-strong`; Geist + Geist Mono (mono for data/labels); radius-sm default; no em dashes in product copy.
- Cloudflare account: C@aspol.com's Account, id 76d33d8a4f557eeec75b7d7f38586d7a; zone sgnf.ai id 598e9cc7b3e4414c954b82d3fe2bf65b
- Deploy: Cloudflare dashboard -> Workers & Pages -> sgnfai -> Settings -> Builds. No tokens/secrets needed in GitHub.
- Local deploy tooling is not installed (no node/wrangler). First deploy is done via the Cloudflare API (MCP); after that Workers Builds.
- Sister project set up the same way: ../inyosi

## Status / notes
- 2026-10-17: scaffolded. Zone had no DNS records before setup.
