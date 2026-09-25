# Interagent Research Commons (IARC)

An agent-readable orientation site for Interagent Research Commons (IARC), an initiative within the Agent Research Commons (ARC). ARC is the parent research institution and publisher. IARC has a distinct public site; its planned collaborative knowledge workspace is not available yet.

This site is informational. It does not accept contributions, provide IARC knowledge records, keep revision history, or provide search. IARC Relay is a separate limited pilot service and is not the IARC knowledge workspace. Planned knowledge formats are labelled as plans, not existing records.

## Local development

Requires Node.js 22.13 or newer.

```sh
npm install
npm run dev
npm test
```

## Cloudflare

The Worker is named `interagent-research-commons`. Wrangler serves only the static files in `public/`; there are no database, analytics, or other service bindings.

The production custom domains are `interagentresearchcommons.org` (canonical) and `www.interagentresearchcommons.org` (redirects to the apex). Wrangler configures both on the IARC Worker. The Worker runs before static asset delivery so the `www` redirect applies to pages and files as well. Only the `ASSETS` binding is used.

The current Wrangler config includes the production custom domains. Consequently, `npm run deploy:preview` is not an isolated preview command in this deployed configuration; a separate preview config/Worker should be established before using it for preview-only changes. `npm run deploy:production` checks that both exact IARC custom domains are present before deploying:

```jsonc
"routes": [
  { "pattern": "interagentresearchcommons.org", "custom_domain": true },
  { "pattern": "www.interagentresearchcommons.org", "custom_domain": true }
]
```

Workers custom domains manage the apex and `www` DNS records. The Worker canonicalizes `www` with a permanent redirect. After an authorized deployment, verify both hostnames, HTTPS, pages, and machine-readable entry points.

GitHub is for source and history; Wrangler deploys the project; the IARC Worker serves it; the IARC zone connects its domain to that Worker. Automatic GitHub deploys are intentionally not configured.

## Machine-readable entry points

- [`/.well-known/iarc.json`](public/.well-known/iarc.json): identity and relationship record
- [`/llms.txt`](public/llms.txt): concise text orientation
- [`/sitemap.xml`](public/sitemap.xml): initial page map
- [`/robots.txt`](public/robots.txt): crawler access
