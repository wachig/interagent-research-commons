import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SOURCE = join(ROOT, "relay/semantic/lexicon-source.dic");
const OUTPUT = join(ROOT, "relay/assets/semantic-lexicon");
const MAX_SHARD_BYTES = 64 * 1024;
const WORD = /^[\p{L}\p{N}][\p{L}\p{M}\p{N}]*(?:['’\-][\p{L}\p{N}][\p{L}\p{M}\p{N}]*)*$/u;
const encoder = new TextEncoder();

const codepointCompare = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const hash = (text) => createHash("sha256").update(text).digest("hex");

const sourceBytes = await readFile(SOURCE);
const sourceText = new TextDecoder("utf-8", { fatal: true }).decode(sourceBytes);
const lines = sourceText.split(/\r?\n/u);
const declaredCount = Number(lines.shift());
if (!Number.isInteger(declaredCount) || declaredCount < 30_000) throw new Error("Pinned source dictionary is missing its expected entry count.");

const unique = new Map();
for (const line of lines) {
  const entry = line.trim().split("/")[0];
  const normalized = entry.normalize("NFC");
  if (!WORD.test(normalized) || encoder.encode(normalized).byteLength > 320 || [...normalized].length > 80) continue;
  const key = normalized.toLocaleLowerCase("en-US");
  const existing = unique.get(key);
  if (!existing || codepointCompare(normalized, existing) < 0) unique.set(key, normalized);
}

const words = [...unique.values()].sort(codepointCompare);
if (words.length < 30_000) throw new Error(`Only ${words.length} usable words were indexed; the plan requires at least 30,000.`);
const shards = [];
const shardFiles = [];
const startPairCounts = new Map();
const shortCharacters = new Set();
for (const value of words) {
  const chars = [...value.toLocaleLowerCase("en-US")];
  if (chars.length === 1 && /^[\p{L}\p{N}]$/u.test(chars[0])) shortCharacters.add(value);
  const pair = chars.slice(0, 2).join("");
  if (!/^\p{L}{2}$/u.test(pair)) continue;
  startPairCounts.set(pair, (startPairCounts.get(pair) || 0) + 1);
}

async function addShard(prefix, entries) {
  const content = JSON.stringify(entries);
  const size = encoder.encode(content).byteLength;
  if (size > MAX_SHARD_BYTES) throw new Error(`Lexicon shard ${JSON.stringify(prefix)} exceeds 64 KiB.`);
  const index = String(shardFiles.length).padStart(4, "0");
  const path = `shards/${index}.json`;
  const absolute = join(OUTPUT, path);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, `${content}\n`);
  const digest = hash(content);
  shards.push({ prefix, path, count: entries.length, bytes: size, sha256: digest });
  shardFiles.push(absolute);
}

async function partition(prefix, entries) {
  const encoded = JSON.stringify(entries);
  if (encoder.encode(encoded).byteLength <= MAX_SHARD_BYTES) {
    await addShard(prefix, entries);
    return;
  }
  const exact = entries.filter((word) => word === prefix);
  if (exact.length) await addShard(prefix, exact);
  const groups = new Map();
  for (const word of entries) {
    if (word === prefix) continue;
    const next = [...word.slice(prefix.length)][0];
    if (!next) continue;
    const child = `${prefix}${next}`;
    if (!groups.has(child)) groups.set(child, []);
    groups.get(child).push(word);
  }
  if (!groups.size) throw new Error(`Unable to partition lexicon at prefix ${JSON.stringify(prefix)}.`);
  for (const [child, values] of [...groups].sort(([a], [b]) => codepointCompare(a, b))) await partition(child, values);
}

await rm(OUTPUT, { recursive: true, force: true });
await mkdir(OUTPUT, { recursive: true });
const rootGroups = new Map();
for (const word of words) {
  const first = [...word][0];
  if (!rootGroups.has(first)) rootGroups.set(first, []);
  rootGroups.get(first).push(word);
}
for (const [prefix, entries] of [...rootGroups].sort(([a], [b]) => codepointCompare(a, b))) await partition(prefix, entries);

const manifest = {
  format: "iarc-semantic-lexicon-1",
  lexicon_version: "fluenttyper-9d4826d5-en_US-hunspell-base-1",
  source: {
    name: "FluentTyper Presage inputs en_US Hunspell dictionary",
    pinned_commit: "9d4826d5e5ddc5aa702458dfe1e941599aadc094",
    source_archive: "/predictive-keyboard/vendor/source/fluenttyper-presage-inputs-9d4826d5.tar.gz",
    source_archive_sha256: "8a266bf01ec61daa61c2750196376a73f77e78e72c1a2c3f98efba18ab83fc67",
    member: "resources_js/en_US/hunspell/en_US.dic",
    extracted_dictionary_sha256: hash(sourceBytes),
    license: "LGPL-2.1-or-later; dictionary identified as based on Kevin Atkinson's Pspell/Aspell English wordlist",
    license_file: "/predictive-keyboard/vendor/licenses/LICENSE.aspell",
    source_count: declaredCount,
  },
  word_count: words.length,
  shard_limit_bytes: MAX_SHARD_BYTES,
  shards,
};
await writeFile(join(OUTPUT, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
await writeFile(join(OUTPUT, "start-pairs.json"), `${JSON.stringify({
  lexicon_version: manifest.lexicon_version,
  pairs: [...startPairCounts].sort(([left], [right]) => codepointCompare(left, right)).map(([value, count]) => ({ value, count })),
  short_characters: [...shortCharacters].sort(codepointCompare),
})}\n`);
await writeFile(join(OUTPUT, "README.txt"), `IARC semantic composer English lexicon\nVersion: ${manifest.lexicon_version}\nUnique usable entries: ${words.length}\nSource archive SHA-256: ${manifest.source.source_archive_sha256}\nExtracted en_US.dic SHA-256: ${manifest.source.extracted_dictionary_sha256}\nLicense: ${manifest.source.license}\nLicense notice: ${manifest.source.license_file}\nBuild command: node relay/semantic/build-lexicon.mjs\n\nThis is a deterministic spelling vocabulary, not a frequency ranking or prediction model. Inflected forms not present in the pinned dictionary may be absent.\n`);
console.log(`Built ${words.length} words in ${shards.length} shards (${shardFiles.map((path) => relative(OUTPUT, path)).join(", ")}).`);
