import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = resolve(ROOT, "tokenizers/o200k_base.tiktoken");
const OUTPUT = resolve(ROOT, "assets/o200k");
const EXPECTED_SHA256 = "446a9538cb6c348e3516120d7c08b09f57c36495e2acfffe59a5bf8b0cfb1a2d";

const source = await readFile(SOURCE);
const digest = createHash("sha256").update(source).digest("hex");
if (digest !== EXPECTED_SHA256) throw new Error(`Unexpected o200k source digest: ${digest}`);

const shards = Array.from({ length: 256 }, () => Object.create(null));
const counts = Array(256).fill(0);
const lines = source.toString("ascii").trimEnd().split("\n");
for (const line of lines) {
  const separator = line.lastIndexOf(" ");
  if (separator < 1) throw new Error("Malformed tokenizer row");
  const bytes = Buffer.from(line.slice(0, separator), "base64");
  const rank = Number(line.slice(separator + 1));
  if (!bytes.length || !Number.isSafeInteger(rank) || rank < 0) throw new Error("Malformed tokenizer record");
  const first = bytes[0];
  counts[first] += 1;
  const shard = shards[first];
  for (let offset = 1; offset <= bytes.length; offset += 1) {
    const suffix = bytes.subarray(1, offset).toString("hex");
    const entry = shard[suffix] || (shard[suffix] = [null, ""]);
    if (offset === bytes.length) {
      if (entry[0] !== null) throw new Error(`Duplicate token bytes at rank ${rank}`);
      entry[0] = rank;
    }
    if (offset < bytes.length) {
      const child = bytes[offset].toString(16).padStart(2, "0");
      const existingChildren = entry[1] ? entry[1].match(/../g) : [];
      if (!existingChildren.includes(child)) entry[1] = [...existingChildren, child].sort().join("");
    }
  }
}
if (lines.length !== 199_998) throw new Error(`Expected 199998 ordinary vocabulary entries, found ${lines.length}`);

await rm(OUTPUT, { recursive: true, force: true });
await mkdir(OUTPUT, { recursive: true });
await writeFile(resolve(OUTPUT, "manifest.json"), `${JSON.stringify({
  dataset: "o200k_base",
  source: "https://openaipublic.blob.core.windows.net/encodings/o200k_base.tiktoken",
  source_sha256: EXPECTED_SHA256,
  entries: lines.length,
  special_tokens_included: false,
  trie_format: "prefix-map-1",
  generated_by: "relay/tokenizers/build_o200k_assets.mjs",
})}\n`);
for (let first = 0; first < 256; first += 1) {
  if (!counts[first]) continue;
  const key = first.toString(16).padStart(2, "0");
  await writeFile(resolve(OUTPUT, `${key}.json`), `${JSON.stringify(shards[first])}\n`);
}
console.log(JSON.stringify({ entries: lines.length, sourceBytes: source.length, assets: counts.filter(Boolean).length + 1, generatedBytes: (await readFile(resolve(OUTPUT, "manifest.json"))).length + counts.reduce((sum, count, byte) => sum + (count ? Buffer.byteLength(JSON.stringify(shards[byte])) + 1 : 0), 0) }));
