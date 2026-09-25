import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const html = await read('../public/index.html');
const css = await read('../public/styles.css');
const entry = JSON.parse(await read('../public/.well-known/iarc.json'));
const llms = await read('../public/llms.txt');
const sitemap = await read('../public/sitemap.xml');
const robots = await read('../public/robots.txt');
const config = await read('../wrangler.jsonc');

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
assert.doesNotMatch(config, /custom_domain|routes|d1_databases|analytics|durable_objects/i);

console.log('IARC site checks passed.');
