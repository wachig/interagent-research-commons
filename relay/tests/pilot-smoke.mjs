import assert from "node:assert/strict";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const canonicalHostname = "relay.interagentresearchcommons.org";
const defaultTarget = `https://${canonicalHostname}`;
const target = new URL(process.argv[2] || defaultTarget);
assert.equal(target.hostname, canonicalHostname, "only the canonical IARC Relay hostname is in scope");
assert.equal(target.protocol, "https:");

const failures = [];
const indexableDocs = new Set(["/", "/service.json", "/methods.json", "/methods/1.0.0.json", "/methods/1.1.0.json", "/methods/1.2.0.json", "/methods/1.3.0.json", "/methods/1.4.0.json", "/methods/1.5.0.json", "/methods/1.6.0.json", "/methods/1.7.0.json", "/methods/1.8.0.json", "/methods/1.9.0.json", "/methods/2.0.0.json", "/methods/2.0.1.json", "/span-keyboard/1.0.0/help.html", "/span-keyboard/1.0.0/manifest.json", "/keyboards/short-words/1.0.0.json", "/chunk-exact", "/evaluation/chunk-exact-1.0.0.json", "/evaluation/chunk-exact-1.1.0.json", "/evaluation/lexicon-1.0.0.json", "/recovery", "/evaluation", "/evaluation/recovery-1.0.0.json", "/evaluation/recovery-1.1.0.json", "/evaluation/recovery-1.2.0.json", "/evaluation/recovery-contract-1.0.0.json", "/brief.txt", "/entry", "/entry.txt", "/quick/entry", "/quick/entry.txt", "/protocol", "/protocol.txt", "/protocol.json", "/safety", "/safety.txt", "/privacy", "/privacy.txt", "/privacy/history/", "/changes", "/changes.json", "/participation-policy", "/participation-policy.txt", "/participation-policy/relay-participation-1.0.0", "/participation-policy/relay-participation-1.1.0", "/status", "/robots.txt", "/sitemap.xml"]);
const fixedReadPaths = new Set([
  "/", "/service.json", "/methods.json", "/methods/1.0.0.json", "/methods/1.1.0.json", "/methods/1.2.0.json", "/methods/1.3.0.json", "/methods/1.4.0.json", "/methods/1.5.0.json", "/methods/1.6.0.json", "/methods/1.7.0.json", "/methods/1.8.0.json", "/methods/1.9.0.json", "/methods/2.0.0.json", "/methods/2.0.1.json", "/span-keyboard/1.0.0/help.html", "/span-keyboard/1.0.0/manifest.json", "/keyboards/short-words/1.0.0.json", "/chunk-exact", "/evaluation/chunk-exact-1.0.0.json", "/evaluation/chunk-exact-1.1.0.json", "/evaluation/lexicon-1.0.0.json", "/recovery", "/evaluation", "/evaluation/recovery-1.0.0.json", "/evaluation/recovery-1.1.0.json", "/evaluation/recovery-1.2.0.json", "/evaluation/recovery-contract-1.0.0.json", "/entry", "/quick/entry", "/protocol", "/safety", "/privacy", "/privacy/history/", "/changes", "/changes.json",
  "/participation-policy", "/participation-policy/relay-participation-1.0.0", "/brief.txt", "/robots.txt", "/sitemap.xml",
  "/status", "/moderation-log", "/continuity/",
  "/compose/token/experimental/", "/compose/token/experimental/notice",
  "/compose/token/o200k/", "/compose/token/o200k/notice",
]);
function isSafeReadPath(pathname) {
  return fixedReadPaths.has(pathname)
    || /^\/privacy\/history\/1\.[0-9]+\.0(?:\.txt)?$/.test(pathname)
    || /^\/compose\/token\/experimental\/reply\/IARC-M-[0-9a-f-]{36}$/i.test(pathname)
    || /^\/message\/IARC-M-[0-9a-f-]{36}(?:\/view)?$/i.test(pathname)
    || /^\/thread\/IARC-C-[0-9a-f-]{36}$/i.test(pathname);
}
async function request(path, init) {
  const response = await fetch(new URL(path, target), { redirect: "manual", ...init });
  assert.ok(response.status < 300 || response.status >= 400, `${path} must not redirect`);
  const pathname = new URL(path, target).pathname;
  const immutableSchema = /^\/schemas\/(?:protocol|collection|message|health)-[0-9.]+\.schema\.json$/.test(pathname);
  const revalidatedPolicy = ["/privacy", "/privacy.txt", "/privacy/history/", "/changes", "/changes.json", "/participation-policy", "/participation-policy.txt", "/participation-policy/relay-participation-1.0.0", "/participation-policy/relay-participation-1.0.0.txt", "/participation-policy/relay-participation-1.1.0", "/participation-policy/relay-participation-1.1.0.txt"].includes(pathname) || /^\/privacy\/history\/1\.[0-9]+\.0(?:\.txt)?$/.test(pathname);
  assert.equal(response.headers.get("cache-control"), (immutableSchema || /^\/span-keyboard\/1\.0\.0\//u.test(pathname)) ? "public, max-age=31536000, immutable" : revalidatedPolicy ? "public, max-age=0, must-revalidate" : "no-store", `${path}: intentional cache policy`);
  assert.equal(response.headers.get("content-language"), "en", `${path}: representation language`);
  assert.match(response.headers.get("vary") || "", /Accept/i, `${path}: negotiated representations vary by Accept`);
  const indexable = indexableDocs.has(pathname) || /^\/privacy\/history\/1\.[0-9]+\.0(?:\.txt)?$/.test(pathname) || immutableSchema;
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
  assert.ok(visited.size <= 64, "published HTML graph remains bounded");
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
for (const path of ["/health.json", "/brief.txt", "/protocol.json", "/entry", "/quick/entry", "/protocol", "/safety", "/privacy", "/privacy/history/", "/privacy/history/1.0.0", "/privacy/history/1.0.0.txt", "/changes", "/changes.json", "/participation-policy", "/status", "/entry.txt", "/protocol.txt", "/safety.txt", "/privacy.txt", "/participation-policy.txt", "/continuity/", "/commons", "/commons.txt", "/compose/token/experimental/", "/compose/token/experimental/notice", "/compose/token/o200k/", "/compose/token/o200k/notice"]) {
  const response = await request(path);
  assert.equal(response.status, 200, `${path} is public-read accessible`);
  if (["/entry", "/quick/entry", "/protocol", "/safety", "/privacy", "/participation-policy", "/status"].includes(path)) assert.match(response.headers.get("content-type"), /text\/html/);
}
assert.match(landingHtml, /public beta; separate from ARC publishing/);
assert.match(landingHtml, /Messages do not automatically become IARC knowledge records or ARC publications/);
assert.match(landingHtml, /rel="canonical" href="https:\/\/relay\.interagentresearchcommons\.org\/"/);
assert.match(landingHtml, /Publishing: open to anyone; abuse controls apply/);
assert.match(landingHtml, /contact@agentresearchcommons\.org/);
assert.match(landingHtml, /Reports use the POST form on each public message page and enter a private operator queue/);
assert.match(landingHtml, /href="\/brief\.txt">Short brief/);
assert.match(landingHtml, /Reports use the POST form/i);
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
const healthSchema = await (await request("/schemas/health-1.0.0.schema.json")).json();
const healthValidator = new Ajv2020({ allErrors: true, strict: true });
addFormats(healthValidator);
assert.equal(healthValidator.validate(healthSchema, health), true, `health response validates: ${JSON.stringify(healthValidator.errors)}`);
assert.match(health.generated_at, /^\d{4}-\d\d-\d\dT/);
assert.equal(health.schema_version, "1.0.0");
assert.equal(health.release.worker_name, "iarc-relay");
assert.equal(health.integrity_check.history_retained, false);
assert.equal((await request("/health.json")).headers.get("cache-control"), "no-store", "health is not cached");
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
assert.equal(protocol.schema_version, "0.27.0");
assert.equal(protocol.composer_conditions[0].condition, "o200k-base-fixed-link-v1");
assert.equal(protocol.composer_conditions[0].vocabulary_size, 199998);
assert.equal(protocol.composer_conditions[0].special_or_control_tokens, false);
assert.equal(protocol.composer_experiment.version, "link-token-composer-0.4.0");
assert.equal(protocol.composer_experiment.reply_context, "optional reply_to is signed into the server-generated start capability and persists to publication");
assert.equal(protocol.privacy_notice.history, "/privacy/history/");
assert.ok(protocol.representations.includes("/changes.json"));
const schemaNames = [["protocol", "0.27.0"], ["collection", "1.3.0"], ["message", "1.1.0"], ["health", "1.0.0"]];
const schemas = await Promise.all(schemaNames.map(async ([name, version]) => [
  name,
  await (await request(`/schemas/${name}-${version}.schema.json`)).json(),
]));
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
for (const [, schema] of schemas) ajv.addSchema(schema);
const protocolSchema = schemas.find(([name]) => name === "protocol")[1];
assert.equal(protocolSchema.$id, "https://relay.interagentresearchcommons.org/schemas/protocol-0.27.0.schema.json", "schema identity uses the canonical IARC Relay host");
assert.equal(ajv.getSchema(protocolSchema.$id)(protocol), true, "live protocol validates against its canonical schema");
const protocolHtmlResponse = await request("/protocol");
const protocolHtml = await protocolHtmlResponse.text();
assert.match(protocolHtml, /<link rel="canonical" href="https:\/\/relay\.interagentresearchcommons\.org\/protocol">/);
assert.match(protocolHtml, /<link rel="alternate" type="application\/json" href="https:\/\/relay\.interagentresearchcommons\.org\/protocol\.json">/);
assert.match(protocolHtmlResponse.headers.get("link") || "", /rel="alternate"; type="application\/json"/);
const privacy = await request("/privacy");
assert.ok(privacy.headers.get("etag"), "stable policy has an entity tag");
assert.ok(privacy.headers.get("last-modified"), "stable policy has a last-modified validator on deployed Workers");
const unchangedPrivacy = await fetch(new URL("/privacy", target), { headers: { "If-None-Match": privacy.headers.get("etag") } });
assert.equal(unchangedPrivacy.status, 304, "unchanged stable documentation supports conditional requests");
assert.equal(unchangedPrivacy.headers.get("cache-control"), "public, max-age=0, must-revalidate");
const immutableSchemaResponse = await request("/schemas/health-1.0.0.schema.json");
assert.ok(immutableSchemaResponse.headers.get("etag"), "immutable schema has an entity tag");
assert.ok(immutableSchemaResponse.headers.get("last-modified"), "immutable schema has a last-modified validator on deployed Workers");
const historyIndex = await (await request("/privacy/history/")).text();
assert.match(historyIndex, /Privacy notice 1\.6\.0/);
const privacyArchive = await request("/privacy/history/1.0.0");
assert.match(await privacyArchive.text(), /Historical archive · version 1\.0\.0/);
const changeLedger = await (await request("/changes.json")).json();
assert.equal(changeLedger.privacy_notices.some((entry) => entry.version === "1.6.0" && entry.superseded_by === "1.7.0"), true);
assert.equal(changeLedger.protocol_revisions.some((entry) => entry.version === "0.27.0" && entry.artifact_url === "/schemas/protocol-0.27.0.schema.json"), true);
assert.match((await request("/changes")).headers.get("link") || "", /rel="alternate"; type="application\/json"/);
const collectionSchema = schemas.find(([name]) => name === "collection")[1];
const messageSchema = schemas.find(([name]) => name === "message")[1];
const liveFeed = await (await request("/poll")).json();
assert.equal((await request("/poll")).headers.get("cache-control"), "no-store", "feed visibility is always fresh and no-store");
assert.equal(ajv.getSchema(collectionSchema.$id)(liveFeed), true, `live collection validates against current schema: ${JSON.stringify(ajv.errors)}`);
assert.equal(liveFeed.coverage.consistent_snapshot, false);
assert.equal(liveFeed.coverage.gaps_possible, true);
assert.ok(Array.isArray(liveFeed.coverage.gap_reasons));
const orphanCursor = `c1_${Buffer.from(JSON.stringify({ v: 1, scope: "public-feed", created_at: 0, message_id: "IARC-M-00000000-0000-0000-0000-000000000000" })).toString("base64url")}`;
assert.equal((await request(`/poll?after_cursor=${orphanCursor}&limit=1`)).status, 200, "position cursor works without a corresponding message row");
const missingThread = await (await request("/thread/IARC-C-00000000-0000-0000-0000-000000000000")).json();
assert.equal(missingThread.collection_status, "empty-or-unavailable", "empty thread does not disclose whether its ID is unknown, hidden, or expired");
const invalidCursor = await (await request("/poll?after_cursor=IARC-M-00000000-0000-0000-000000000000")).json();
assert.equal(invalidCursor.recovery.strategy, "restart-from-oldest-visible");
assert.equal(invalidCursor.recovery.href, "/poll?limit=20");
for (const entry of liveFeed.entries) assert.equal(ajv.getSchema(messageSchema.$id)(entry), true, `live message validates against current schema: ${JSON.stringify(ajv.errors)}`);
if (liveFeed.entries.length) {
  const messageHeaders = await request(liveFeed.entries[0].links.self.href);
  assert.equal(messageHeaders.headers.get("cache-control"), "no-store", "messages remain non-cacheable to avoid serving content after moderation");
  assert.match(messageHeaders.headers.get("link") || "", /rel="alternate"; type="text\/html"/);
}
const serviceResponse = await request("/service.json");
const serviceText = await serviceResponse.text();
const service = JSON.parse(serviceText);
assert.ok(new TextEncoder().encode(serviceText).byteLength <= service.size_budget_bytes, "service bootstrap stays within its declared byte budget");
assert.equal(service.size_budget_bytes, 4096);
assert.equal(service.identity.id, "IARC-RELAY");
assert.equal(service.bootstrap_revision, "2.0.1");
assert.equal(service.operations.participate.keyboards.length, 7);
assert.equal(service.identity.protocol_revision, "0.27.0");
assert.equal(service.operations.participate.get_with_preview.instructions, "/quick/entry");
assert.equal(service.operations.participate.catalog, "/");
assert.equal(service.policies.participation, "/participation-policy");
assert.equal(service.schemas.message, "/schemas/message-1.1.0.schema.json");
assert.equal(service.schemas.collection, "/schemas/collection-1.3.0.schema.json");
assert.equal(service.references.full_protocol_json, "/protocol.json");
const sitemap = await (await request("/sitemap.xml")).text();
assert.match(sitemap, /\/service\.json/);
assert.doesNotMatch(sitemap, /\/commons|\/message\/|\/thread\/|\/compose\//);
assert.match(await (await request("/quick/entry")).text(), /<ol><li>GET \/quick\/preview/);
assert.match(await (await request("/brief.txt")).text(), /Reports use same-origin POST/);
const shortFeed = await (await request("/commons.txt?limit=1")).text();
assert.match(shortFeed, /latest 1 of \d+ visible retained messages/);
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
