# sgnf.ai

Static home page for Sgnfai (display wordmark "Sgnf.ai", pronounced SIG-nuh-fy). AI-first B2B2B services. Tagline: "Our tools. Your intelligence. Their advantage."

## Pipeline
Claude Code (edit locally) -> GitHub `AspolAdmin/sgnfai` (public, branch `main`) -> Cloudflare Workers Builds (connect the repo in the dashboard; builds on every push to main) -> Cloudflare Worker `sgnfai` (static assets from `public/`) -> custom domains sgnf.ai, www.sgnf.ai, sgnfy.ai, www.sgnfy.ai (see `wrangler.jsonc`).

## Layout
- `public/` – the site (index.html, style.css, favicon.svg)
- `.claude/launch.json` – local preview: `python3 -m http.server 8787 -d public`
- `wrangler.jsonc` – Worker name, assets dir, custom domains

## External references
- Brand source of truth (from Perplexity, 2026-10-19): `perplexity-comments.md` (spec, locked copy, logo animation sequence) and `sgnfai-look-and-feel.md` (palette, type, layout). These supersede the old green/orange design system artifact (claude.ai/artifact/GvVPx863APi1HeKpheGAA8), which no longer applies.
  Rules worth remembering: prose name "Sgnfai", wordmark "Sgnf.ai" (capital S, no spaces, dot attached); white #fff / near-black #111 / one blue #153894 (sampled 2026-10-19 from the blue band on the Pet Shop Boys Discography sleeve, Wikipedia scan; replaces Perplexity's provisional #0087C9); no pink, yellow, gradients or multicolour motifs; Helvetica-like sans; blue as a structural block, not a wash; rectangular CTAs; logo animation is coded typing: main logo plays once on load and once per click, header logo only on click (independent); per user (2026-10-19) it now ends with the dot coming back out (Sgnf.ai -> Sgnfai), overriding the Perplexity 'dot inserted last' spec; static for reduced motion; no em dashes in product copy.
  Open items: production font, vector wordmark.
- Cloudflare account: C@aspol.com's Account, id 76d33d8a4f557eeec75b7d7f38586d7a; zone sgnf.ai id 598e9cc7b3e4414c954b82d3fe2bf65b; zone sgnfy.ai id 158f4b97f042b9e8f54214255163a0da (same site, no redirect)
- Deploy: Cloudflare dashboard -> Workers & Pages -> sgnfai -> Settings -> Builds. No tokens/secrets needed in GitHub.
- Local deploy tooling is not installed (no node/wrangler). First deploy is done via the Cloudflare API (MCP); after that Workers Builds.
- Sister project set up the same way: ../inyosi

## Status / notes
- 2026-10-17: first deploy via Cloudflare API (MCP): Worker `sgnfai` + custom domains sgnf.ai, www.sgnf.ai. Zone had no DNS records before setup, so nothing removed.
- Workers Builds connected 2026-10-17; verified a push to main deploys in ~40s.
- sgnfy.ai + www.sgnfy.ai added 2026-10-17 as extra custom domains on the same Worker (zone had no DNS records).
- 2026-10-19: site reworked to the Perplexity Sgnfai direction. User asked for it very simple: one screen with the animated logo, tagline, description and email, a faint dot grid and blue bars top and bottom. No nav, sections or imagery.
- 2026-10-19: GitHub CLI (gh) installed via Homebrew and signed in; git pushes over HTTPS use its credentials (from the sandboxed Bash tool, pushing may need the sandbox disabled).
