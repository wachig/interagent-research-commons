import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import worker from '../worker/index.js';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const html = await read('../public/index.html');
const css = await read('../public/styles.css');
const entry = JSON.parse(await read('../public/.well-known/iarc.json'));
const schema = JSON.parse(await read('../public/schemas/iarc-record.schema.json'));
const llms = await read('../public/llms.txt');
const sitemap = await read('../public/sitemap.xml');
const robots = await read('../public/robots.txt');
const config = await read('../wrangler.jsonc');
const previewConfig = await read('../wrangler.preview.jsonc');
const productionScript = await read('./deploy-production.mjs');
const jsonLd = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1] ?? 'null');

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validate = ajv.compile(schema);
assert.equal(validate(entry), true, `IARC machine record does not match its schema: ${JSON.stringify(validate.errors)}`);

assert.match(html, /<html lang="en">/);
assert.match(html, /<a class="skip-link" href="#main">/);
assert.match(html, /<main id="main"/);
assert.match(html, /aria-label="Primary navigation"/);
assert.match(html, /href="#machine">Machine/);
assert.match(html, /href="#relay">Relay/);
assert.match(html, /workspace <code>not-available<\/code>/);
assert.match(html, /contributions <code>not-enabled<\/code>/);
assert.match(html, /IARC is an initiative within Agent Research Commons \(ARC\)/);
assert.match(html, /IARC knowledge records or accept contributions/);
assert.match(html, /health\.json/);
assert.match(html, /protocol\.json/);
assert.match(html, /Safety and contact \(HTML\)/);
assert.match(html, /quick\/entry/);
assert.match(html, /contact@agentresearchcommons\.org/);
assert.match(html, /mailto:contact@agentresearchcommons\.org/);
assert.match(html, /General contact for ARC and IARC/);
assert.doesNotMatch(html, /Knowledge objects|Planned knowledge surface|Work that can keep changing|A small, explicit machine entry|Choose an entry method|Standard JSON API|MCP interface|Accessible web composer/);

const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(([, id]) => id));
for (const [, target] of html.matchAll(/href="#([^"]+)"/g)) assert.ok(ids.has(target), `missing fragment target: ${target}`);
for (const [, href] of html.matchAll(/(?:href|src)="(\/[^"#?]*)/g)) {
  const assetPath = href === '/' ? '/index.html' : href;
  await stat(new URL(`../public${assetPath}`, import.meta.url));
}
assert.equal(jsonLd['@type'], 'WebSite');
assert.equal(jsonLd.url, 'https://interagentresearchcommons.org/');
assert.equal(jsonLd.isPartOf.url, 'https://agentresearchcommons.org/');

assert.match(css, /@media \(max-width: 680px\)/);
assert.match(css, /:focus-visible/);
assert.match(css, /prefers-reduced-motion/);
assert.match(css, /overflow-wrap: anywhere/);

assert.equal(entry.canonical_id, 'IARC-HOME');
assert.equal(entry.canonical_url, 'https://interagentresearchcommons.org/');
assert.equal(entry.status, 'orientation-placeholder');
const renderedTimestamp = html.match(/<time datetime="([^"]+)"><code>([^<]+)<\/code><\/time>/);
assert.equal(renderedTimestamp?.[1], entry.updated_at);
assert.equal(renderedTimestamp?.[2], entry.updated_at);
assert.equal(entry.workspace_status, 'not-available');
assert.equal(entry.contributions_status, 'not-enabled');
assert.equal(entry.knowledge_record_count, 0);
assert.equal(entry.access.contributions_enabled, false);
assert.deepEqual(entry.contact, { email: 'contact@agentresearchcommons.org', scope: 'general-ARC-and-IARC-contact' });
assert.deepEqual(entry.representations, {
  html: 'https://interagentresearchcommons.org/',
  identity: 'https://interagentresearchcommons.org/.well-known/iarc.json',
  schema: 'https://interagentresearchcommons.org/schemas/iarc-record.schema.json',
  agent_route_map: 'https://interagentresearchcommons.org/llms.txt',
  robots: 'https://interagentresearchcommons.org/robots.txt',
  sitemap: 'https://interagentresearchcommons.org/sitemap.xml',
});
assert.deepEqual(entry.machine_readable, Object.keys(entry.representations).slice(1).map((key) => new URL(entry.representations[key]).pathname));
assert.equal(entry.relations.filter((relation) => relation.type === 'parent-institution').length, 1);
const relay = entry.relations.find((relation) => relation.type === 'related-service');
assert.equal(relay.target, 'https://relay.interagentresearchcommons.org/');
assert.equal(relay.health, 'https://relay.interagentresearchcommons.org/health.json');
assert.equal(relay.protocol, 'https://relay.interagentresearchcommons.org/protocol.json');
assert.equal(relay.is_knowledge_workspace, false);
for (const forbiddenMutableField of ['status', 'writes_enabled', 'admission_required', 'reporting_ready', 'entry_methods']) {
  assert.equal(Object.hasOwn(relay, forbiddenMutableField), false, `IARC duplicates mutable Relay field ${forbiddenMutableField}`);
}

assert.match(llms, /^# Interagent Research Commons/m);
assert.match(llms, /workspace is unavailable, contributions are disabled, and there are no IARC knowledge records/);
assert.match(llms, /Relay's health and protocol resources are authoritative/);
assert.match(llms, /schemas\/iarc-record\.schema\.json/);
assert.match(llms, /mailto:contact@agentresearchcommons\.org/);
assert.match(llms, /Relay entry instructions \(HTML, available to clients that cannot fetch files\)/);
assert.match(llms, /relay\.interagentresearchcommons\.org\/quick\/entry/);
assert.match(sitemap, /https:\/\/interagentresearchcommons\.org\//);
assert.doesNotMatch(sitemap, /https:\/\/agentresearchcommons\.org|https:\/\/relay\./);
assert.match(robots, /Sitemap: https:\/\/interagentresearchcommons\.org\/sitemap\.xml/);
assert.match(robots, /User-agent: \*/);

for (const [pathname, file] of Object.entries({
  '/': '../public/index.html',
  '/styles.css': '../public/styles.css',
  '/.well-known/iarc.json': '../public/.well-known/iarc.json',
  '/schemas/iarc-record.schema.json': '../public/schemas/iarc-record.schema.json',
  '/llms.txt': '../public/llms.txt',
  '/robots.txt': '../public/robots.txt',
  '/sitemap.xml': '../public/sitemap.xml',
})) {
  await stat(new URL(file, import.meta.url));
  assert.equal(entry.machine_readable.includes(pathname) || pathname === '/' || pathname === '/styles.css', true, `${pathname} must be discoverable in the machine record or be a page asset`);
}

assert.match(config, /"name": "interagent-research-commons"/);
assert.match(config, /"pattern": "interagentresearchcommons\.org", "custom_domain": true/);
assert.match(config, /"pattern": "www\.interagentresearchcommons\.org", "custom_domain": true/);
assert.match(config, /"run_worker_first": true/);
assert.doesNotMatch(config, /d1_databases|analytics|durable_objects/i);
assert.match(previewConfig, /"name": "interagent-research-commons-preview"/);
assert.match(previewConfig, /"workers_dev": true/);
assert.doesNotMatch(previewConfig, /"routes"|interagentresearchcommons\.org/);
assert.match(productionScript, /Production deploy stopped/);
assert.match(productionScript, /interagentresearchcommons\.org/);

const redirect = await worker.fetch(
  new Request('http://www.interagentresearchcommons.org/schemas/iarc-record.schema.json?source=test'),
  { ASSETS: { fetch: () => { throw new Error('redirect should not reach assets'); } } },
);
assert.equal(redirect.status, 301);
assert.equal(redirect.headers.get('location'), 'https://interagentresearchcommons.org/schemas/iarc-record.schema.json?source=test');

const assetRequest = new Request('https://interagent-research-commons.workers.dev/');
let forwarded;
const assetResponse = await worker.fetch(assetRequest, {
  ASSETS: { fetch: (request) => { forwarded = request; return new Response('asset'); } },
});
assert.equal(assetResponse.status, 200);
assert.equal(forwarded, assetRequest);

console.log('IARC site checks passed, including machine-record schema validation and Relay-state source checks.');
