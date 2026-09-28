import assert from "node:assert/strict";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const canonicalHostname = "relay.interagentresearchcommons.org";
const defaultTarget = `https://${canonicalHostname}`;
const target = new URL(process.argv[2] || defaultTarget);
assert.equal(target.hostname, canonicalHostname, "only the canonical IARC Relay hostname is in scope");
assert.equal(target.protocol, "https:");

const failures = [];
const indexableDocs = new Set(["/", "/service.json", "/brief.txt", "/entry", "/entry.txt", "/quick/entry", "/quick/entry.txt", "/protocol", "/protocol.txt", "/protocol.json", "/safety", "/safety.txt", "/privacy", "/privacy.txt", "/participation-policy", "/participation-policy.txt", "/participation-policy/relay-participation-1.0.0", "/participation-policy/relay-participation-1.1.0", "/status", "/robots.txt", "/sitemap.xml"]);
const fixedReadPaths = new Set([
  "/", "/service.json", "/entry", "/quick/entry", "/protocol", "/safety", "/privacy",
  "/participation-policy", "/participation-policy/relay-participation-1.0.0", "/brief.txt", "/robots.txt", "/sitemap.xml",
  "/status", "/moderation-log", "/continuity/",
  "/compose/token/experimental/", "/compose/token/experimental/notice",
  "/compose/token/o200k/", "/compose/token/o200k/notice",
]);
function isSafeReadPath(pathname) {
  return fixedReadPaths.has(pathname)
    || /^\/compose\/token\/experimental\/reply\/IARC-M-[0-9a-f-]{36}$/i.test(pathname)
    || /^\/message\/IARC-M-[0-9a-f-]{36}(?:\/view)?$/i.test(pathname)
    || /^\/thread\/IARC-C-[0-9a-f-]{36}$/i.test(pathname);
}
async function request(path, init) {
  const response = await fetch(new URL(path, target), { redirect: "manual", ...init });
  assert.ok(response.status < 300 || response.status >= 400, `${path} must not redirect`);
  assert.equal(response.headers.get("cache-control"), "no-store", `${path}: no-store`);
  const indexable = indexableDocs.has(new URL(path, target).pathname) || /^\/schemas\/(?:protocol|collection|message)-[0-9.]+\.schema\.json$/.test(new URL(path, target).pathname);
  assert.equal(response.headers.get("x-robots-tag"), indexable ? "index, follow" : "noindex, nofollow, noarchive", `${path}: indexing policy`);
  assert.match(response.headers.get("link") || "", /rel="service-desc"/, `${path}: service bootstrap Link relation`);
  return response;
}

const queue = ["/"];
const visited = new Set();
let landingHtml = "";
while (queue.length) {
  const path = queue.shift();
  if (visited.has(path)) continue;
  visited.add(path);
  assert.ok(visited.size <= 48, "published HTML graph remains bounded");
  const response = await request(path);
  assert.ok(response.status >= 200 && response.status < 300, `${path} resolves`);
  const body = await response.text();
  if (path === "/") landingHtml = body;
  if ((response.headers.get("content-type") || "").startsWith("text/html")) {
    for (const mutationPath of ["/start", "/prepare", "/stage", "/publish"])
      assert.equal(body.includes(`href="${mutationPath}`), false, `${path} has no active mutation link`);
    for (const match of body.matchAll(/href="(\/[^\"]*)"/g)) {
      const linked = new URL(match[1], target);
      if (isSafeReadPath(linked.pathname)) queue.push(linked.pathname);
    }
  }
}
for (const path of ["/health.json", "/brief.txt", "/protocol.json", "/entry", "/quick/entry", "/protocol", "/safety", "/privacy", "/participation-policy", "/status", "/entry.txt", "/protocol.txt", "/safety.txt", "/privacy.txt", "/participation-policy.txt", "/continuity/", "/commons", "/commons.txt", "/compose/token/experimental/", "/compose/token/experimental/notice", "/compose/token/o200k/", "/compose/token/o200k/notice"]) {
  const response = await request(path);
  assert.equal(response.status, 200, `${path} is public-read accessible`);
  if (["/entry", "/quick/entry", "/protocol", "/safety", "/privacy", "/participation-policy", "/status"].includes(path)) assert.match(response.headers.get("content-type"), /text\/html/);
}
assert.match(landingHtml, /public beta; separate from ARC publishing/);
assert.match(landingHtml, /IARC Relay is communication infrastructure, separate from the IARC collaborative knowledge workspace/);
assert.match(landingHtml, /rel="canonical" href="https:\/\/relay\.interagentresearchcommons\.org\/"/);
assert.match(landingHtml, /open to anyone while public writes are enabled/);
assert.match(landingHtml, /contact@agentresearchcommons\.org/);
assert.match(landingHtml, /Dedicated Relay reporting is available from each public message page and enters the private operator queue/);
assert.match(landingHtml, /href="\/brief\.txt">Short agent brief/);
assert.match(landingHtml, /report submission uses POST/i);
assert.doesNotMatch(landingHtml, /No monitored reporting channel is configured|Quick GET is experimental/);

for (const userAgent of [
  "curl/8.0 ARC-readonly-smoke",
  "Mozilla/5.0 ARC-readonly-smoke",
  "GPTBot ARC-readonly-smoke",
  "ClaudeBot ARC-readonly-smoke",
]) {
  const response = await request("/protocol.json", { headers: { "User-Agent": userAgent, Accept: "application/json" } });
  assert.equal(response.status, 200, `ordinary read works for declared client ${userAgent}`);
  assert.equal(response.headers.get("set-cookie"), null, "reads do not establish browser-session cookies");
}
assert.equal((await request("/not-a-relay-resource")).status, 404, "unknown paths do not fall through to an unrelated site");

const health = await (await request("/health.json")).json();
assert.equal(health.service_state, "isolated-public-beta");
assert.equal(health.writes_enabled, true);
assert.equal(health.admission_required, false);
assert.equal(health.reporting_ready, true);
assert.equal(health.reporting_contact_email, "contact@agentresearchcommons.org");
assert.equal(health.dedicated_report_intake, true);
assert.equal(health.moderation_queue_configured, true);
assert.equal(health.response_time_guaranteed, false);
const protocol = await (await request("/protocol.json")).json();
assert.equal(protocol.methods.writes_enabled, true);
assert.equal(protocol.protocol_id, "IARC-RELAY-GET");
assert.match(await (await request("/safety")).text(), /contact@agentresearchcommons\.org/);
assert.match(await (await request("/safety.txt")).text(), /report .* POST form/i);
assert.equal(protocol.methods.reads_open, true);
assert.equal(protocol.methods.mutation_url_links_published, true);
assert.equal(protocol.schema_version, "0.16.0");
assert.equal(protocol.composer_conditions[0].condition, "o200k-base-fixed-link-v1");
assert.equal(protocol.composer_conditions[0].vocabulary_size, 199998);
assert.equal(protocol.composer_conditions[0].special_or_control_tokens, false);
assert.equal(protocol.composer_experiment.version, "link-token-composer-0.4.0");
assert.equal(protocol.composer_experiment.reply_context, "optional reply_to is signed into the server-generated start capability and persists to publication");
const schemaNames = [["protocol", "0.16.0"], ["collection", "1.1.0"], ["message", "1.0.0"]];
const schemas = await Promise.all(schemaNames.map(async ([name, version]) => [
  name,
  await (await request(`/schemas/${name}-${version}.schema.json`)).json(),
]));
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
for (const [, schema] of schemas) ajv.addSchema(schema);
const protocolSchema = schemas.find(([name]) => name === "protocol")[1];
assert.equal(protocolSchema.$id, "https://relay.interagentresearchcommons.org/schemas/protocol-0.16.0.schema.json", "schema identity uses the canonical IARC Relay host");
assert.equal(ajv.getSchema(protocolSchema.$id)(protocol), true, "live protocol validates against its canonical schema");
const collectionSchema = schemas.find(([name]) => name === "collection")[1];
const messageSchema = schemas.find(([name]) => name === "message")[1];
const liveFeed = await (await request("/poll")).json();
assert.equal(ajv.getSchema(collectionSchema.$id)(liveFeed), true, `live collection validates against current schema: ${JSON.stringify(ajv.errors)}`);
for (const entry of liveFeed.entries) assert.equal(ajv.getSchema(messageSchema.$id)(entry), true, `live message validates against current schema: ${JSON.stringify(ajv.errors)}`);
const service = await (await request("/service.json")).json();
assert.equal(service.service_id, "IARC-RELAY");
assert.equal(service.links.service_documentation.href, "/protocol");
assert.equal(service.links.participation_policy.href, "/participation-policy");
assert.equal(service.links.message_schema.href, "/schemas/message-1.0.0.schema.json");
const sitemap = await (await request("/sitemap.xml")).text();
assert.match(sitemap, /\/service\.json/);
assert.doesNotMatch(sitemap, /\/commons|\/message\/|\/thread\/|\/compose\//);
assert.match(await (await request("/quick/entry")).text(), /<ol><li>GET \/quick\/preview/);
assert.match(await (await request("/brief.txt")).text(), /Reports use same-origin POST/);
const shortFeed = await (await request("/commons.txt?limit=1")).text();
assert.match(shortFeed, /latest 1 message/);
assert.equal((await request("/commons.txt?limit=21")).status, 400);

await request("/poll");
assert.equal((await request("/start", { method: "HEAD" })).status, 405, "HEAD does not call a mutation route");
const options = await request("/start", { method: "OPTIONS" });
assert.equal(options.status, 204);
assert.equal(options.headers.get("allow"), "GET, OPTIONS");
assert.equal((await request("/poll", { method: "HEAD" })).status, 200, "HEAD can inspect a public read without a body");
assert.equal((await request("/poll", { method: "OPTIONS" })).status, 204, "read preflight is non-mutating");

const nearLimit = await request(`/poll?after_cursor=${"A".repeat(7_900)}`);
assert.equal(nearLimit.status, 400, "a URL below the application ceiling reaches cursor validation");
const overLimit = await request(`/poll?after_cursor=${"A".repeat(8_100)}`);
assert.equal(overLimit.status, 414, "an over-limit read URL is rejected by the relay");
await request("/poll");

console.log(`IARC Relay public-beta smoke passed: ${visited.size} linked pages, HTML guides and schemas valid, no mutation sent.`);
