import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const relayRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(relayRoot, "..");
const wranglerCli = path.join(repoRoot, "node_modules/wrangler/bin/wrangler.js");
const persistence = await mkdtemp(path.join("/private/tmp", "iarc-keyboard-flow-"));

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

const port = await freePort();
const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, [
  wranglerCli,
  "dev", "--local",
  "--config", path.join(relayRoot, "wrangler.jsonc"),
  "--ip", "127.0.0.1",
  "--port", String(port),
  "--persist-to", persistence,
  "--var", "RELAY_READS_OPEN:true",
  "--var", "RELAY_WRITES_OPEN:true",
  "--var", "RELAY_ADMISSIONS_REQUIRED:false",
  "--var", "RELAY_REPORTING_READY:false",
  "--var", "RELAY_CAPABILITY_SECRET:local-keyboard-test-secret-do-not-deploy-0000000000000000",
  "--var", "RELAY_SERVICE_STATE:isolated-local-prototype",
  "--var", "RELAY_SESSION_TTL_SECONDS:300",
  "--var", "RELAY_STAGE_TTL_SECONDS:120",
  "--var", "RELAY_PENDING_TTL_SECONDS:120",
  "--log-level", "error",
], { cwd: repoRoot, env: { ...process.env, WRANGLER_WRITE_LOGS: "false", WRANGLER_SEND_METRICS: "false" }, stdio: ["ignore", "pipe", "pipe"] });
let output = "";
child.stdout.on("data", (chunk) => { output += chunk.toString(); });
child.stderr.on("data", (chunk) => { output += chunk.toString(); });

try {
  let ready = false;
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Local Wrangler exited early:\n${output}`);
    try {
      const response = await fetch(`${base}/health.json`);
      if (response.ok) { ready = true; break; }
    } catch {}
    await delay(150);
  }
  assert.ok(ready, `Local Wrangler did not become ready:\n${output}`);

  const keyboardResponse = await fetch(`${base}/predictive-keyboard/`);
  assert.equal(keyboardResponse.status, 200);
  assert.match(await keyboardResponse.text(), /Continue to Relay preview/);
  const sourceResponse = await fetch(`${base}/predictive-keyboard/source/`, { redirect: "manual" });
  assert.equal(sourceResponse.status, 200, "source page resolves without a redirect");
  assert.match(await sourceResponse.text(), /Complete GNU GPL version 2 license text/);

  const htmlKeyboard = await fetch(`${base}/predictive-keyboard/html/`);
  assert.equal(htmlKeyboard.status, 200);
  const htmlKeyboardPage = await htmlKeyboard.text();
  assert.doesNotMatch(htmlKeyboardPage, /<script\b/i, "HTML keyboard runs without page JavaScript");
  assert.equal([...htmlKeyboardPage.matchAll(/aria-label="Use prediction /g)].length, 10, "HTML keyboard shows ten model predictions");
  const addLetter = htmlKeyboardPage.match(/href="([^"]+)" aria-label="Add i"/)?.[1];
  assert.ok(addLetter, "HTML keyboard supplies the letter-i link");
  const letterPage = await (await fetch(new URL(addLetter.replaceAll("&amp;", "&"), base))).text();
  assert.match(letterPage, /<pre class="draft">i<\/pre>/, "the selected letter appears in the draft");
  const keyboardReviewHref = letterPage.match(/href="([^"]*\/review\?state=[^"]+)"/)?.[1];
  assert.ok(keyboardReviewHref, "keyboard page supplies one review link");
  const reviewUrl = new URL(keyboardReviewHref.replaceAll("&amp;", "&"), base);
  const headReview = await fetch(reviewUrl, { method: "HEAD" });
  assert.equal(headReview.status, 405, "HEAD never creates a publication draft");
  assert.equal((await (await fetch(`${base}/poll`)).json()).returned_count, 0, "keyboard composition and HEAD review do not publish");
  const draftReview = await fetch(reviewUrl, { headers: { Accept: "text/html" } });
  assert.equal(draftReview.status, 200);
  const draftReviewHtml = await draftReview.text();
  assert.match(draftReviewHtml, /Review draft/);
  assert.match(draftReviewHtml, /Exact message · 1 UTF-8 byte<\/strong>/);
  assert.match(draftReviewHtml, /expires at/);
  assert.match(draftReviewHtml, /A crawler or prefetching client that follows it can publish/);
  assert.doesNotMatch(draftReviewHtml, /quick\/preview|quick\/stage/, "review flows directly to publication without the old extra steps");
  const keyboardPublishHref = draftReviewHtml.match(/href="(\/publish\?cap=[A-Za-z0-9_-]{43})"[^>]*>Publish this message publicly/)?.[1];
  assert.ok(keyboardPublishHref, "review page shows one opaque direct-publish capability");
  const editHref = draftReviewHtml.match(/href="([^\"]*\/discard\?cap=[^\"]+)"[^>]*>Edit message and discard this private draft/)?.[1];
  assert.ok(editHref, "review page offers an explicit discard-and-edit path");
  assert.equal((await (await fetch(`${base}/poll`)).json()).returned_count, 0, "review creates only a private expiring draft");
  const discardResponse = await fetch(new URL(editHref.replaceAll("&amp;", "&"), base), { headers: { Accept: "text/html" } });
  assert.equal(discardResponse.status, 200);
  const discardHtml = await discardResponse.text();
  assert.match(discardHtml, /The unpublished draft was discarded and its publish link is invalid/);
  const stalePublish = await fetch(new URL(keyboardPublishHref, base), { headers: { Accept: "application/json" } });
  assert.equal(stalePublish.status, 410, "discarded publish capability cannot publish");
  assert.equal((await (await fetch(`${base}/poll`)).json()).returned_count, 0, "discarding never publishes");
  const returnHref = discardHtml.match(/href="([^\"]+)"[^>]*>Edit message/)?.[1];
  assert.ok(returnHref, "discard page returns to the signed keyboard draft");
  const editPage = await (await fetch(new URL(returnHref.replaceAll("&amp;", "&"), base))).text();
  const secondReviewHref = editPage.match(/href="([^\"]*\/review\?state=[^\"]+)"/)?.[1];
  assert.ok(secondReviewHref, "edited draft can be reviewed again");
  const secondReview = await fetch(new URL(secondReviewHref.replaceAll("&amp;", "&"), base), { headers: { Accept: "text/html" } });
  assert.equal(secondReview.status, 200);
  const secondReviewHtml = await secondReview.text();
  assert.match(secondReviewHtml, /Exact message · 1 UTF-8 byte/);
  const replacementPublishHref = secondReviewHtml.match(/href="(\/publish\?cap=[A-Za-z0-9_-]{43})"[^>]*>Publish this message publicly/)?.[1];
  assert.ok(replacementPublishHref && replacementPublishHref !== keyboardPublishHref, "a fresh review creates a fresh publish capability after discard");
  const keyboardPublish = await fetch(new URL(keyboardPublishHref, base), { headers: { Accept: "text/html" } });
  assert.equal(keyboardPublish.status, 410, "the discarded capability stays invalid");
  const replacementPublish = await fetch(new URL(replacementPublishHref, base), { headers: { Accept: "text/html" } });
  assert.equal(replacementPublish.status, 201);
  assert.match(await replacementPublish.text(), /Message published/);
  const keyboardReplay = await fetch(new URL(replacementPublishHref, base), { headers: { Accept: "application/json" } });
  assert.equal(keyboardReplay.status, 201, "replaying publish capability recovers its receipt");
  assert.equal((await (await fetch(`${base}/poll`)).json()).returned_count, 1, "direct publish capability creates one public record");
  const protocol = await (await fetch(`${base}/protocol.json`)).json();
  assert.ok(protocol.methods.state_changing_get_routes.includes("/predictive-keyboard/html/review?state={signed_state}"));
  assert.ok(protocol.methods.state_changing_get_routes.includes("/predictive-keyboard/html/discard?cap={publish_cap}&state={signed_state}"));
  assert.match(protocol.operations.find((operation) => operation.path === "/predictive-keyboard/html/review")?.purpose || "", /one direct \/publish\?cap=/);
  assert.match(protocol.operations.find((operation) => operation.path === "/predictive-keyboard/html/discard")?.purpose || "", /invalidate its publish capability/);

  const message = "Predictive keyboard local flow check.";
  const previewResponse = await fetch(`${base}/quick/preview?${new URLSearchParams({ message })}`, { headers: { Accept: "text/html" } });
  assert.equal(previewResponse.status, 200);
  const previewHtml = await previewResponse.text();
  assert.match(previewHtml, /Read-only preview/);
  assert.ok(previewHtml.includes(message));
  assert.equal((await (await fetch(`${base}/poll`)).json()).returned_count, 1, "preview does not publish");
  const stageHref = previewHtml.match(/href="([^"]*\/quick\/stage\?ticket=[^"]+)"/)?.[1];
  assert.ok(stageHref, "preview supplies a private-draft link");

  const stageResponse = await fetch(new URL(stageHref, base), { headers: { Accept: "text/html" } });
  assert.equal(stageResponse.status, 201);
  const stageHtml = await stageResponse.text();
  assert.match(stageHtml, /Private draft created/);
  const publishHref = stageHtml.match(/href="([^"]*\/publish\?cap=[^"]+)"/)?.[1];
  assert.ok(publishHref, "draft page supplies a distinct publish action");
  assert.equal((await (await fetch(`${base}/poll`)).json()).returned_count, 1, "private draft is not public");

  const publishResponse = await fetch(new URL(publishHref, base), { headers: { Accept: "text/html" } });
  assert.equal(publishResponse.status, 201);
  const publishHtml = await publishResponse.text();
  assert.match(publishHtml, /Message published/);
  assert.ok(publishHtml.includes(message));
  assert.doesNotMatch(publishHtml, /session_cap/, "browser receipt does not expose the rotated session capability");
  assert.equal((await (await fetch(`${base}/poll`)).json()).returned_count, 2, "publication occurs only after the separate final action");
  const messageId = publishHtml.match(/IARC-M-[0-9a-f-]{36}/i)?.[0];
  assert.ok(messageId);
  const messageView = await (await fetch(`${base}/message/${messageId}/view`)).text();
  assert.ok(messageView.includes(`/predictive-keyboard/?reply_to=${messageId}`), "public messages offer a keyboard reply link");

  console.log("Predictive keyboard local publication flow passed.");
} catch (error) {
  console.error(error);
  console.error(output);
  process.exitCode = 1;
} finally {
  child.kill("SIGTERM");
  if (child.exitCode === null) await Promise.race([new Promise((resolve) => child.once("exit", resolve)), delay(5_000)]);
  if (child.exitCode === null) child.kill("SIGKILL");
  await rm(persistence, { recursive: true, force: true });
}
