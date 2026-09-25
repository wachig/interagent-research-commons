import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import worker from '../worker/index.js';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const html = await read('../public/index.html');
const css = await read('../public/styles.css');
const entry = JSON.parse(await read('../public/.well-known/iarc.json'));
const llms = await read('../public/llms.txt');
const sitemap = await read('../public/sitemap.xml');
const robots = await read('../public/robots.txt');
const config = await read('../wrangler.jsonc');
const productionScript = await read('./deploy-production.mjs');
const jsonLd = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1] ?? 'null');

assert.match(html, /<html lang="en">/);
assert.match(html, /<a class="skip-link" href="#main">/);
assert.match(html, /<main id="main">/);
assert.match(html, /aria-label="Primary navigation"/);
assert.match(html, /id="commons"/);
assert.match(html, /id="principles"/);
assert.match(html, /id="relationship"/);
assert.match(html, /IARC is an initiative within Agent Research Commons \(ARC\)/);
assert.match(html, /knowledge workspace is not available yet/);
assert.match(html, /Parent institution/);
assert.match(html, /ARC relationship record/);
assert.match(html, /IARC Relay is not the knowledge workspace/);
assert.match(html, /https:\/\/agentresearchcommons\.org\/iarc\//);
assert.doesNotMatch(html, /Independent site|IARC is where knowledge develops/);
const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(([, id]) => id));
for (const [, target] of html.matchAll(/href="#([^"]+)"/g)) assert.ok(ids.has(target), `missing fragment target: ${target}`);
assert.equal(jsonLd['@type'], 'WebSite');
assert.equal(jsonLd.url, 'https://interagentresearchcommons.org/');
assert.equal(jsonLd.isPartOf.url, 'https://agentresearchcommons.org/');
assert.match(jsonLd.description, /initiative within Agent Research Commons/);
assert.match(css, /@media \(max-width: 760px\)/);
assert.match(css, /:focus-visible/);
assert.match(css, /prefers-reduced-motion/);
assert.equal(entry.name, 'Interagent Research Commons');
assert.equal(entry.resourceId, 'IARC-HOME');
assert.equal(entry.entityType, 'project-initiative');
assert.equal(entry.type, 'collaborative-knowledge-commons');
assert.equal(entry.status, 'orientation-placeholder');
assert.equal(entry.applicationStatus, 'not-available');
assert.equal(entry.participation, 'not-enabled');
assert.equal(entry.parentInstitution.role, 'parent-institution');
assert.equal(entry.parentInstitution.url, 'https://agentresearchcommons.org/');
assert.equal(entry.parentInstitution.relationshipRecord, 'https://agentresearchcommons.org/iarc/');
assert.equal(entry.parentOrganization.role, 'parent-institution');
assert.deepEqual(entry.parentOrganization, entry.parentInstitution);
assert.equal(entry.relatedServices[0].relationship, 'separate-pilot-service');
assert.equal(entry.relatedServices[0].isKnowledgeWorkspace, false);
assert.match(entry.relationship, /initiative within ARC/);
assert.match(llms, /initiative within Agent Research Commons \(ARC\)/);
assert.match(llms, /planned collaborative knowledge workspace is not available yet/);
assert.match(llms, /https:\/\/agentresearchcommons\.org\/iarc\//);
assert.match(llms, /IARC Relay is a separate limited pilot service/);
assert.match(sitemap, /https:\/\/interagentresearchcommons\.org\//);
assert.doesNotMatch(sitemap, /https:\/\/agentresearchcommons\.org|https:\/\/relay\./);
assert.match(robots, /Sitemap: https:\/\/interagentresearchcommons\.org\/sitemap\.xml/);
assert.match(robots, /User-agent: \*/);
assert.match(robots, /Allow: \/\n/);
assert.match(config, /"name": "interagent-research-commons"/);
assert.match(config, /"pattern": "interagentresearchcommons\.org", "custom_domain": true/);
assert.match(config, /"pattern": "www\.interagentresearchcommons\.org", "custom_domain": true/);
assert.match(config, /"run_worker_first": true/);
assert.doesNotMatch(config, /d1_databases|analytics|durable_objects/i);
assert.match(productionScript, /Production deploy stopped/);
assert.match(productionScript, /interagentresearchcommons\.org/);

const redirect = await worker.fetch(
  new Request('http://www.interagentresearchcommons.org/knowledge/?q=agents'),
  { ASSETS: { fetch: () => { throw new Error('redirect should not reach assets'); } } },
);
assert.equal(redirect.status, 301);
assert.equal(redirect.headers.get('location'), 'https://interagentresearchcommons.org/knowledge/?q=agents');

const assetRequest = new Request('https://interagent-research-commons.workers.dev/');
let forwarded;
const assetResponse = await worker.fetch(assetRequest, {
  ASSETS: { fetch: (request) => { forwarded = request; return new Response('asset'); } },
});
assert.equal(assetResponse.status, 200);
assert.equal(forwarded, assetRequest);

console.log('IARC site checks passed.');
