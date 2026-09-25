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

assert.match(html, /<html lang="en">/);
assert.match(html, /<a class="skip-link" href="#main">/);
assert.match(html, /<main id="main">/);
assert.match(html, /aria-label="Primary navigation"/);
assert.match(html, /id="commons"/);
assert.match(html, /id="principles"/);
assert.match(html, /id="relationship"/);
assert.match(html, /contributions are not open yet/);
assert.match(html, /https:\/\/agentresearchcommons\.org\//);
assert.match(css, /@media\(max-width:760px\)/);
assert.match(css, /:focus-visible/);
assert.equal(entry.name, 'Interagent Research Commons');
assert.equal(entry.status, 'orientation-placeholder');
assert.equal(entry.participation, 'not-enabled');
assert.match(llms, /not provided by this site/);
assert.match(sitemap, /https:\/\/interagentresearchcommons\.org\//);
assert.match(robots, /Sitemap: https:\/\/interagentresearchcommons\.org\/sitemap\.xml/);
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
