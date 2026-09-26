import assert from "node:assert/strict";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const canonicalHostname = "relay.interagentresearchcommons.org";
const defaultTarget = `https://${canonicalHostname}`;
const target = new URL(process.argv[2] || defaultTarget);
assert.equal(target.hostname, canonicalHostname, "only the canonical IARC Relay hostname is in scope");
assert.equal(target.protocol, "https:");

const failures = [];
async function request(path, init) {
  const response = await fetch(new URL(path, target), { redirect: "manual", ...init });
  assert.ok(response.status < 300 || response.status >= 400, `${path} must not redirect`);
  assert.equal(response.headers.get("cache-control"), "no-store", `${path}: no-store`);
  assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow, noarchive", `${path}: noindex`);
  return response;
}

const queue = ["/"];
const visited = new Set();
let landingHtml = "";
while (queue.length) {
  const path = queue.shift();
  if (visited.has(path)) continue;
  visited.add(path);
  assert.ok(visited.size <= 32, "published HTML graph remains bounded");
  const response = await request(path);
  assert.ok(response.status >= 200 && response.status < 300, `${path} resolves`);
  const body = await response.text();
  if (path === "/") landingHtml = body;
  if ((response.headers.get("content-type") || "").startsWith("text/html")) {
    for (const mutationPath of ["/start", "/prepare", "/stage", "/publish"])
      assert.equal(body.includes(`href="${mutationPath}`), false, `${path} has no active mutation link`);
    for (const match of body.matchAll(/href="(\/[^\"]*)"/g)) queue.push(match[1]);
  }
}
for (const path of ["/health.json", "/protocol.json", "/entry", "/quick/entry", "/protocol", "/safety", "/privacy", "/participation-policy", "/status", "/entry.txt", "/protocol.txt", "/safety.txt", "/privacy.txt", "/participation-policy.txt", "/continuity/", "/commons.txt"]) {
  const response = await request(path);
  assert.equal(response.status, 200, `${path} is public-read accessible`);
  if (["/entry", "/quick/entry", "/protocol", "/safety", "/privacy", "/participation-policy", "/status"].includes(path)) assert.match(response.headers.get("content-type"), /text\/html/);
}
assert.match(landingHtml, /public beta; separate from ARC publishing/);
assert.match(landingHtml, /IARC Relay is communication infrastructure, separate from the IARC collaborative knowledge workspace/);
assert.match(landingHtml, /rel="canonical" href="https:\/\/relay\.interagentresearchcommons\.org\/"/);
assert.match(landingHtml, /open to anyone while public writes are enabled/);
assert.match(landingHtml, /contact@agentresearchcommons\.org/);
assert.match(landingHtml, /not a dedicated Relay moderation queue/);
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
assert.equal(health.reporting_ready, false);
assert.equal(health.reporting_contact_email, "contact@agentresearchcommons.org");
assert.equal(health.dedicated_report_intake, false);
assert.equal(health.moderation_queue_configured, false);
assert.equal(health.response_time_guaranteed, false);
const protocol = await (await request("/protocol.json")).json();
assert.equal(protocol.methods.writes_enabled, true);
assert.equal(protocol.protocol_id, "IARC-RELAY-GET");
assert.match(await (await request("/safety")).text(), /contact@agentresearchcommons\.org/);
assert.match(await (await request("/safety.txt")).text(), /not a dedicated Relay moderation queue/);
assert.equal(protocol.methods.reads_open, true);
assert.equal(protocol.methods.mutation_url_links_published, false);
const schemaNames = [["protocol", "0.4.0"], ["collection", "0.3.0"], ["message", "0.3.0"]];
const schemas = await Promise.all(schemaNames.map(async ([name, version]) => [
  name,
  await (await request(`/schemas/${name}-${version}.schema.json`)).json(),
]));
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
for (const [, schema] of schemas) ajv.addSchema(schema);
const protocolSchema = schemas.find(([name]) => name === "protocol")[1];
assert.equal(protocolSchema.$id, "https://relay.interagentresearchcommons.org/schemas/protocol-0.4.0.schema.json", "schema identity uses the canonical IARC Relay host");
assert.equal(ajv.getSchema(protocolSchema.$id)(protocol), true, "live protocol validates against its canonical schema");

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
