import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ASSETS = join(ROOT, "relay/assets/semantic-lexicon");
const hash = (value) => createHash("sha256").update(value).digest("hex");
const manifest = JSON.parse(await readFile(join(ASSETS, "manifest.json"), "utf8"));
if (manifest.format !== "iarc-semantic-lexicon-1" || !Array.isArray(manifest.shards)) throw new Error("Unsupported semantic lexicon manifest.");
const counts = new Map();
for (const shard of manifest.shards) {
  const raw = await readFile(join(ASSETS, shard.path));
  const canonical = raw.at(-1) === 10 ? raw.subarray(0, -1) : raw;
  if (canonical.byteLength !== shard.bytes || hash(canonical) !== shard.sha256) throw new Error(`Lexicon shard integrity check failed: ${shard.path}`);
  const words = JSON.parse(canonical.toString("utf8"));
  if (!Array.isArray(words) || words.length !== shard.count) throw new Error(`Lexicon shard count failed: ${shard.path}`);
  for (const word of words) {
    const chars = [...word.normalize("NFC").toLocaleLowerCase("en-US")];
    const pair = chars.slice(-2).join("");
    if (/^\p{L}{2}$/u.test(pair)) counts.set(pair, (counts.get(pair) || 0) + 1);
  }
}
if (manifest.word_count !== Object.values(manifest.shards).reduce((sum, shard) => sum + shard.count, 0)) throw new Error("Lexicon manifest word count mismatch.");
const output = {
  format: "iarc-end-pairs-1",
  lexicon_version: manifest.lexicon_version,
  lexicon_word_count: manifest.word_count,
  position_rule: "the final two Unicode letters of the word",
  pairs: [...counts].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(([value, count]) => ({ value, count })),
};
if (!output.pairs.length || !output.pairs.some(({ value }) => value === "tt") || !output.pairs.some(({ value }) => value === "dd")) throw new Error("The ending pair inventory is empty or missing expected doubled-consonant endings.");
await writeFile(join(ASSETS, "end-pairs.json"), `${JSON.stringify(output, null, 2)}\n`);
console.log(`Wrote ${output.pairs.length} END pairs from ${output.lexicon_word_count} lexicon entries.`);
