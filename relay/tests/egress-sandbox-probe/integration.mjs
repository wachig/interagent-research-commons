import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import net from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const cli = path.join(root, "node_modules/wrangler/bin/wrangler.js");
const target = net.createServer();
await new Promise((resolve) => target.listen(0, "127.0.0.1", resolve));
const targetPort = target.address().port;
let reached = 0;
target.on("connection", (socket) => { reached += 1; socket.destroy(); });

const portProbe = net.createServer();
await new Promise((resolve) => portProbe.listen(0, "127.0.0.1", resolve));
const port = portProbe.address().port;
await new Promise((resolve, reject) => portProbe.close((error) => error ? reject(error) : resolve()));
const child = spawn(process.execPath, [cli, "dev", "--local", "--config", path.join(here, "wrangler.jsonc"), "--ip", "127.0.0.1", "--port", String(port), "--log-level", "error"], {
  cwd: root,
  env: { ...process.env, WRANGLER_WRITE_LOGS: "false", WRANGLER_SEND_METRICS: "false" },
  stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
child.stdout.on("data", (chunk) => { output += chunk.toString(); });
child.stderr.on("data", (chunk) => { output += chunk.toString(); });

try {
  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 30_000;
  let response;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Wrangler exited early:\n${output}`);
    try {
      response = await fetch(`${base}/?target=${encodeURIComponent(`http://127.0.0.1:${targetPort}/blocked`)}`);
      if (response.ok) break;
    } catch {}
    await delay(150);
  }
  assert.ok(response?.ok, `Worker Loader did not respond:\n${output}`);
  const result = await response.json();
  assert.equal(result.bound, "narrow-binding-available", "sandbox receives only its explicit RPC binding");
  assert.equal(result.blocked, true, `sandbox egress was not blocked: ${JSON.stringify(result)}`);
  await delay(100);
  assert.equal(reached, 0, "the local egress target received no connection");
  console.log("Dynamic Worker globalOutbound:null blocks loopback fetch and preserves explicit RPC bindings.");
} finally {
  child.kill("SIGTERM");
  await Promise.race([new Promise((resolve) => child.once("exit", resolve)), delay(5_000)]);
  if (child.exitCode === null) child.kill("SIGKILL");
  await new Promise((resolve) => target.close(resolve));
}
